import type { BrowserContext } from 'playwright';
import { test as pwTest } from '@playwright/test';
import { IDriver } from '../core/base-driver';
import { tryUnwrapBrowserDriver } from '../core/unwrap-browser-driver';
import { env } from '../core/env-loader';
import { logger } from '../utils/logger';
import { CheckpointManager } from './checkpoint-manager';
import type { CheckpointData } from './checkpoint-manager';

function logResumable(level: 'info' | 'warn' | 'error', msg: string): void {
  if (level === 'info') logger.info('ResumableSteps', msg);
  else if (level === 'warn') logger.warn('ResumableSteps', msg);
  else logger.error('ResumableSteps', msg);
}

async function onResumeBrowser(driver: IDriver, cp: CheckpointData): Promise<void> {
  const bd = tryUnwrapBrowserDriver(driver);
  if (bd) {
    await bd.recreateContextFromStorageState(cp.statePath);
  } else {
    logger.warn(
      'ResumableSteps',
      'Cannot load storage state ― driver is not BrowserDriver; navigating only',
    );
  }
  await driver.navigate(cp.url);
}

export interface Step {
  name: string;
  fn: (driver: IDriver) => Promise<void>;
}

export interface CreateResumableFlowOptions {
  testId: string;
  driver: IDriver;
  getContext: () => BrowserContext | null;
  /**
   * When set, it is written into checkpoint metadata on each save. On resume, it must match
   * the saved value or the checkpoint is cleared (no restore) so data-setup steps are not skipped
   * for a different DB seed, tenant, or environment.
   */
  resumeKey?: string;
  /**
   * After browser storage + URL are restored for a resume, return false if backend/App prerequisites
   * are missing (record deleted, staging reset, etc.). The checkpoint is cleared and the flow runs
   * from step 0; use {@link onResumeInvalidated} to reset the driver if the resumed page is a dead end.
   */
  validateResume?: (driver: IDriver, cp: CheckpointData) => boolean | Promise<boolean>;
  /** Optional reset when {@link validateResume} returns false (e.g. navigate home or recreate context). */
  onResumeInvalidated?: (driver: IDriver) => void | Promise<void>;
}

export interface RunStepsOptions extends CreateResumableFlowOptions {
  steps: Step[];
}

/**
 * For environments where disposable server/request context makes DB state unknown or unstable:
 * after restore, run a **UI-only** probe (locator, POM `isLoaded`, short `waitFor`). No DB or API access needed.
 * If the probe throws or returns false, the checkpoint is cleared and the flow runs from step 0 (see {@link CreateResumableFlowOptions.validateResume}).
 */
export function uiResumeValidator(
  probe: (driver: IDriver) => boolean | Promise<boolean>,
): (driver: IDriver, _cp: CheckpointData) => Promise<boolean> {
  return async (driver, _cp) => {
    try {
      return await probe(driver);
    } catch {
      return false;
    }
  };
}

type CheckpointHandler = (name: string, segment?: () => Promise<void>) => Promise<void>;

export interface ResumableFlow {
  /** One logical step: runs `fn`, then checkpoints (browser) when `BROWSER_CHECKPOINT_RESUME` flow is active. */
  step(name: string, fn: (driver: IDriver) => Promise<void>): Promise<void>;
  /**
   * Save storage + URL mid-step, or optionally run `segment` then save (skips `segment` when resuming past this label).
   * Must be called only while a `step` callback is executing.
   */
  checkpoint(name: string, segment?: () => Promise<void>): Promise<void>;
  /** Clears `.checkpoints/` for this test — call when the flow is done, or rely on the `resumable` fixture teardown on pass. */
  complete(): Promise<void>;
}

/**
 * Linear tests: `await resumable.step('name', async (d) => { ... })` in order — same checkpoint/resume semantics as {@link runSteps}.
 */
export async function createResumableFlow(options: CreateResumableFlowOptions): Promise<ResumableFlow> {
  const { testId, driver, getContext, resumeKey, validateResume, onResumeInvalidated } = options;
  const checkpoint = new CheckpointManager(testId);
  let saved = await checkpoint.hasCheckpoint();
  let useResume = Boolean(env.browserCheckpointResume && saved);
  let startFrom =
    useResume && saved != null && saved.subCheckpoint == null
      ? saved.step + 1
      : useResume && saved != null
        ? saved.step
        : 0;

  if (saved && resumeKey !== undefined && saved.resumeKey !== resumeKey) {
    logResumable(
      'warn',
      `Checkpoint resumeKey mismatch for "${testId}" (saved=${JSON.stringify(saved.resumeKey)} current=${JSON.stringify(resumeKey)}) — clearing`,
    );
    await checkpoint.clear();
    saved = null;
    useResume = false;
    startFrom = 0;
  }

  if (useResume && saved) {
    const sub = saved.subCheckpoint;
    logResumable(
      'info',
      sub != null
        ? `Resuming "${testId}" at step ${saved.step} after sub-checkpoint "${sub}"`
        : `Resuming "${testId}" from step ${startFrom}`,
    );
    await onResumeBrowser(driver, saved);
    if (validateResume) {
      const ok = await validateResume(driver, saved);
      if (!ok) {
        logResumable(
          'warn',
          `validateResume rejected restore for "${testId}" — running full flow`,
        );
        if (onResumeInvalidated) await onResumeInvalidated(driver);
        await checkpoint.clear();
        saved = null;
        useResume = false;
        startFrom = 0;
      }
    }
  }

  let nextIndex = 0;
  let stepCheckpointHandler: CheckpointHandler | null = null;

  return {
    async checkpoint(name: string, segment?: () => Promise<void>): Promise<void> {
      if (!stepCheckpointHandler) {
        throw new Error('resumable.checkpoint(...) must be called inside resumable.step(...)');
      }
      return stepCheckpointHandler(name, segment);
    },
    async step(name: string, fn: (driver: IDriver) => Promise<void>): Promise<void> {
      const i = nextIndex++;
      let activeMidResume =
        useResume && saved != null && saved.subCheckpoint != null && i === saved.step
          ? saved.subCheckpoint
          : null;

      await pwTest.step(name, async () => {
        if (i < startFrom) {
          logResumable('info', `Skipping step ${i}: "${name}" (resumed)`);
          return;
        }
        logResumable('info', `Running step ${i}: "${name}"`);

        const checkpointHandler: CheckpointHandler = async (subName, segment) => {
          if (activeMidResume !== null) {
            if (subName !== activeMidResume) {
              if (segment) return;
              return;
            }
            activeMidResume = null;
            if (segment) return;
            return;
          }
          if (segment) await segment();
          const ctx = getContext();
          if (ctx) {
            const url = await driver.getURL();
            await checkpoint.checkpoint(i, ctx, url, subName, resumeKey);
          }
        };

        stepCheckpointHandler = checkpointHandler;
        try {
          try {
            await fn(driver);
          } catch (err) {
            logResumable('error', `Step ${i} "${name}" failed: ${err}`);
            throw err;
          }
          if (activeMidResume !== null) {
            logResumable(
              'warn',
              `Step ${i} finished without reaching sub-checkpoint "${activeMidResume}"; treating step as complete`,
            );
          }
          const ctx = getContext();
          if (ctx) {
            const url = await driver.getURL();
            await checkpoint.checkpoint(i, ctx, url, undefined, resumeKey);
          }
        } finally {
          stepCheckpointHandler = null;
        }
      });
    },
    async complete(): Promise<void> {
      await checkpoint.clear();
      logResumable('info', `All steps completed for "${testId}"`);
    },
  };
}

/** Non-browser drivers: `step` runs `fn` only; no disk checkpoints. */
export function createNoopResumableFlow(driver: IDriver): ResumableFlow {
  let inStep = false;
  return {
    async step(_name: string, fn: (d: IDriver) => Promise<void>) {
      inStep = true;
      try {
        await fn(driver);
      } finally {
        inStep = false;
      }
    },
    async checkpoint(_name: string, segment?: () => Promise<void>) {
      if (!inStep) {
        throw new Error('resumable.checkpoint(...) must be called inside resumable.step(...)');
      }
      if (segment) await segment();
    },
    async complete() {},
  };
}

/**
 * Execute a sequence of steps with auto-checkpointing.
 * After each successful step, cookies/localStorage + URL are saved under `.checkpoints/`.
 * Set env `BROWSER_CHECKPOINT_RESUME=true` to restore and skip completed steps.
 */
export async function runSteps(options: RunStepsOptions): Promise<void> {
  const { steps, ...rest } = options;
  const flow = await createResumableFlow(rest);
  for (const s of steps) {
    await flow.step(s.name, s.fn);
  }
  await flow.complete();
}
