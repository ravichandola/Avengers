import type { BrowserContext } from 'playwright';
import { CheckpointManager, type CheckpointData } from './checkpoint-manager';
import type { CheckpointLog } from './checkpoint-manager';

export type ResumableLogLevel = 'info' | 'warn' | 'error';
export type ResumableLog = (level: ResumableLogLevel, message: string) => void;

export interface ResumableStep<T> {
  name: string;
  fn: (driver: T) => Promise<void>;
}

export interface RunResumableStepsOptions<T> {
  testId: string;
  /** Passed through to {@link CheckpointManager} */
  checkpointRootDir?: string;
  checkpointLog?: CheckpointLog;
  /** When true and a checkpoint exists, `onResume` runs then remaining steps execute */
  resumeEnabled: boolean;
  driver: T;
  steps: ResumableStep<T>[];
  getContext: () => BrowserContext | null;
  getUrl: (driver: T) => Promise<string>;
  navigate: (driver: T, url: string) => Promise<void>;
  /**
   * Restore session + page before continuing. Typically: recreate context from
   * `checkpoint.statePath`, then `navigate(checkpoint.url)`.
   */
  onResume?: (driver: T, checkpoint: CheckpointData) => Promise<void>;
  /** Persisted with checkpoints; mismatch clears resume without restoring the browser. */
  resumeKey?: string;
  /** After `onResume`, return false if prerequisites are missing — checkpoint cleared, full flow runs. */
  validateResume?: (driver: T, cp: CheckpointData) => boolean | Promise<boolean>;
  /** When `validateResume` is false (e.g. navigate to a safe URL before step 0). */
  onResumeInvalidated?: (driver: T) => void | Promise<void>;
  log?: ResumableLog;
}

/**
 * Portable step runner with disk checkpoints (storageState + URL per step).
 * Copy the `copyable/` folder into your project and wire `onResume` for your driver.
 */
export async function runResumableSteps<T>(options: RunResumableStepsOptions<T>): Promise<void> {
  const {
    testId,
    checkpointRootDir,
    checkpointLog,
    resumeEnabled,
    driver,
    steps,
    getContext,
    getUrl,
    navigate,
    onResume,
    resumeKey,
    validateResume,
    onResumeInvalidated,
    log,
  } = options;

  const checkpoint = new CheckpointManager(testId, {
    rootDir: checkpointRootDir,
    log: checkpointLog,
  });

  let saved = await checkpoint.hasCheckpoint();
  let useResume = Boolean(resumeEnabled && saved);
  let startFrom =
    useResume && saved != null && saved.subCheckpoint == null
      ? saved.step + 1
      : useResume && saved != null
        ? saved.step
        : 0;

  if (saved && resumeKey !== undefined && saved.resumeKey !== resumeKey) {
    log?.(
      'warn',
      `Checkpoint resumeKey mismatch for "${testId}" — clearing`,
    );
    await checkpoint.clear();
    saved = null;
    useResume = false;
    startFrom = 0;
  }

  if (useResume && saved) {
    const sub = saved.subCheckpoint;
    log?.(
      'info',
      sub != null
        ? `Resuming "${testId}" at step ${saved.step} after sub-checkpoint "${sub}" (${steps[saved.step]?.name ?? '?'})`
        : `Resuming "${testId}" from step ${startFrom} (${steps[startFrom]?.name ?? 'end'})`,
    );
    if (onResume) {
      await onResume(driver, saved);
    } else {
      log?.(
        'warn',
        'runResumableSteps: no onResume — only navigating (cookies/storage may be missing)',
      );
      await navigate(driver, saved.url);
    }
    if (validateResume) {
      const ok = await validateResume(driver, saved);
      if (!ok) {
        log?.(
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

  for (let i = startFrom; i < steps.length; i++) {
    const step = steps[i];
    log?.('info', `Running step ${i}: "${step.name}"`);

    try {
      await step.fn(driver);
    } catch (err) {
      log?.('error', `Step ${i} "${step.name}" failed: ${err}`);
      throw err;
    }

    const ctx = getContext();
    if (ctx) {
      const url = await getUrl(driver);
      await checkpoint.checkpoint(i, ctx, url, undefined, resumeKey);
    }
  }

  await checkpoint.clear();
  log?.('info', `All ${steps.length} steps completed for "${testId}"`);
}

/** Read `process.env`; use your own flag name if you prefer */
export function resumeEnabledFromEnv(
  key = 'BROWSER_CHECKPOINT_RESUME',
): boolean {
  return process.env[key] === 'true';
}
