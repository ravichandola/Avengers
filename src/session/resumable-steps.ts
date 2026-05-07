import type { BrowserContext } from 'playwright';
import { IDriver } from '../core/base-driver';
import { BrowserDriver } from '../drivers/browser/browser-driver';
import { env } from '../core/env-loader';
import { logger } from '../utils/logger';
import { VisionDriverWrapper } from '../vision/vision-driver-mixin';
import { runResumableSteps as runResumableStepsPortable } from './copyable/run-resumable-steps';

function unwrapToBrowserDriver(d: IDriver): BrowserDriver | null {
  let cur: IDriver = d;
  while (cur instanceof VisionDriverWrapper) {
    cur = (cur as unknown as { inner: IDriver }).inner;
  }
  return cur instanceof BrowserDriver ? cur : null;
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

/**
 * Execute a sequence of steps with auto-checkpointing (wraps portable {@link runResumableStepsPortable}).
 * After each successful step, cookies/localStorage + URL are saved under `.checkpoints/`.
 * Set env `BROWSER_CHECKPOINT_RESUME=true` to restore and skip completed steps.
 */
export async function runSteps(options: RunStepsOptions): Promise<void> {
  const { testId, driver, steps, getContext } = options;

  await runResumableStepsPortable({
    testId,
    resumeEnabled: env.browserCheckpointResume,
    driver,
    steps,
    getContext,
    getUrl: (d) => d.getURL(),
    navigate: (d, url) => d.navigate(url),
    onResume: async (d, cp) => {
      const bd = unwrapToBrowserDriver(d);
      if (bd) {
        await bd.recreateContextFromStorageState(cp.statePath);
      } else {
        logger.warn(
          'ResumableSteps',
          'Cannot load storage state ― driver is not BrowserDriver; navigating only',
        );
      }
      await d.navigate(cp.url);
    },
    log: (level, msg) => {
      if (level === 'info') logger.info('ResumableSteps', msg);
      else if (level === 'warn') logger.warn('ResumableSteps', msg);
      else logger.error('ResumableSteps', msg);
    },
  });
}
