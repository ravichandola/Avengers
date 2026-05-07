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
    log,
  } = options;

  const checkpoint = new CheckpointManager(testId, {
    rootDir: checkpointRootDir,
    log: checkpointLog,
  });

  const saved = await checkpoint.hasCheckpoint();
  const useResume = Boolean(resumeEnabled && saved);
  const startFrom = useResume ? saved!.step + 1 : 0;

  if (useResume) {
    log?.(
      'info',
      `Resuming "${testId}" from step ${startFrom} (${steps[startFrom]?.name ?? 'end'})`,
    );
    if (onResume) {
      await onResume(driver, saved!);
    } else {
      log?.(
        'warn',
        'runResumableSteps: no onResume — only navigating (cookies/storage may be missing)',
      );
      await navigate(driver, saved!.url);
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
      await checkpoint.checkpoint(i, ctx, url);
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
