import { BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

const CHECKPOINT_DIR = path.resolve(process.cwd(), '.checkpoints');

export interface CheckpointData {
  step: number;
  url: string;
  statePath: string;
  timestamp: number;
}

/**
 * CheckpointManager saves execution state at each step so a failed test
 * can resume from the last successful checkpoint on the next run.
 */
export class CheckpointManager {
  private testId: string;
  private metaPath: string;

  constructor(testId: string) {
    this.testId = this.sanitizeId(testId);
    this.metaPath = path.join(CHECKPOINT_DIR, `${this.testId}.json`);
  }

  /**
   * Save state after a successful step.
   */
  async checkpoint(step: number, context: BrowserContext, url: string): Promise<void> {
    this.ensureDir();
    const statePath = path.join(CHECKPOINT_DIR, `${this.testId}.state.json`);
    await context.storageState({ path: statePath });

    const data: CheckpointData = {
      step,
      url,
      statePath,
      timestamp: Date.now(),
    };
    fs.writeFileSync(this.metaPath, JSON.stringify(data, null, 2));
    logger.debug('Checkpoint', `Saved checkpoint at step ${step} for "${this.testId}"`);
  }

  /**
   * Check if a checkpoint exists for this test. Returns checkpoint data or null.
   */
  async hasCheckpoint(): Promise<CheckpointData | null> {
    if (!fs.existsSync(this.metaPath)) return null;

    try {
      const raw = fs.readFileSync(this.metaPath, 'utf-8');
      const data: CheckpointData = JSON.parse(raw);
      if (!fs.existsSync(data.statePath)) {
        logger.warn('Checkpoint', `State file missing for "${this.testId}", clearing`);
        await this.clear();
        return null;
      }
      return data;
    } catch {
      await this.clear();
      return null;
    }
  }

  /**
   * Get the step number to resume from (step after the last checkpointed step).
   */
  async getResumeStep(): Promise<number> {
    const cp = await this.hasCheckpoint();
    return cp ? cp.step + 1 : 0;
  }

  /**
   * Clear checkpoint data (call on successful test completion).
   */
  async clear(): Promise<void> {
    const statePath = path.join(CHECKPOINT_DIR, `${this.testId}.state.json`);
    if (fs.existsSync(this.metaPath)) fs.unlinkSync(this.metaPath);
    if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
    logger.debug('Checkpoint', `Cleared checkpoint for "${this.testId}"`);
  }

  private ensureDir(): void {
    if (!fs.existsSync(CHECKPOINT_DIR)) {
      fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
    }
  }

  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
  }
}
