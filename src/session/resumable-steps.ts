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

interface RunStepsOptions {
  testId: string;
  driver: IDriver;
  steps: Step[];
  getContext: () => BrowserContext | null;
}

export interface ResumableFlow {
  /** One logical step: runs `fn`, then checkpoints (browser) when `BROWSER_CHECKPOINT_RESUME` flow is active. */
  step(name: string, fn: (driver: IDriver) => Promise<void>): Promise<void>;
  /** Clears `.checkpoints/` for this test — call when the flow is done, or rely on the `resumable` fixture teardown on pass. */
  complete(): Promise<void>;
}

interface CreateResumableFlowOptions {
  testId: string;
  driver: IDriver;
  getContext: () => BrowserContext | null;
}

/**
 * Linear tests: `await resumable.step('name', async (d) => { ... })` in order — same checkpoint/resume semantics as {@link runSteps}.
 */
export async function createResumableFlow(options: CreateResumableFlowOptions): Promise<ResumableFlow> {
  const { testId, driver, getContext } = options;
  const checkpoint = new CheckpointManager(testId);
  const saved = await checkpoint.hasCheckpoint();
  const useResume = Boolean(env.browserCheckpointResume && saved);
  const startFrom = useResume ? saved!.step + 1 : 0;

  if (useResume) {
    logResumable('info', `Resuming "${testId}" from step ${startFrom}`);
    await onResumeBrowser(driver, saved!);
  }

  let nextIndex = 0;

  return {
    async step(name: string, fn: (driver: IDriver) => Promise<void>): Promise<void> {
      const i = nextIndex++;
      await pwTest.step(name, async () => {
        if (i < startFrom) {
          logResumable('info', `Skipping step ${i}: "${name}" (resumed)`);
          return;
        }
        logResumable('info', `Running step ${i}: "${name}"`);
        try {
          await fn(driver);
        } catch (err) {
          logResumable('error', `Step ${i} "${name}" failed: ${err}`);
          throw err;
        }
        const ctx = getContext();
        if (ctx) {
          const url = await driver.getURL();
          await checkpoint.checkpoint(i, ctx, url);
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
  return {
    async step(_name: string, fn: (d: IDriver) => Promise<void>) {
      await fn(driver);
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
