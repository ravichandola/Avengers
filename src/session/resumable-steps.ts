import { BrowserContext } from 'playwright';
import { IDriver } from '../core/base-driver';
import { CheckpointManager } from './checkpoint-manager';
import { logger } from '../utils/logger';

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
 * Execute a sequence of steps with auto-checkpointing.
 * If a prior run failed at step N, this resumes from step N
 * by restoring the saved browser state and skipping completed steps.
 */
export async function runSteps(options: RunStepsOptions): Promise<void> {
  const { testId, driver, steps, getContext } = options;
  const checkpoint = new CheckpointManager(testId);
  const saved = await checkpoint.hasCheckpoint();
  const startFrom = saved ? saved.step + 1 : 0;

  if (saved) {
    logger.info('ResumableSteps', `Resuming "${testId}" from step ${startFrom} (${steps[startFrom]?.name ?? 'end'})`);
    await driver.navigate(saved.url);
  }

  for (let i = startFrom; i < steps.length; i++) {
    const step = steps[i];
    logger.info('ResumableSteps', `Running step ${i}: "${step.name}"`);

    try {
      await step.fn(driver);
    } catch (err) {
      logger.error('ResumableSteps', `Step ${i} "${step.name}" failed: ${err}`);
      throw err;
    }

    const ctx = getContext();
    if (ctx) {
      const url = await driver.getURL();
      await checkpoint.checkpoint(i, ctx, url);
    }
  }

  await checkpoint.clear();
  logger.info('ResumableSteps', `All ${steps.length} steps completed for "${testId}"`);
}
