import type { BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

export type CheckpointLogLevel = 'debug' | 'warn';
export type CheckpointLog = (level: CheckpointLogLevel, message: string) => void;

export interface CheckpointManagerOptions {
  /** Defaults to `join(process.cwd(), '.checkpoints')` */
  rootDir?: string;
  log?: CheckpointLog;
}

export interface CheckpointData {
  step: number;
  /** When set, resume stays on this step and replays until this label (see `createResumableFlow.checkpoint`). */
  subCheckpoint?: string;
  /**
   * Optional stamp (seed version, tenant id, commit hash, etc.). If the next run passes a different
   * `resumeKey` into the flow runner, the checkpoint is discarded so setup steps are not skipped
   * against the wrong dataset.
   */
  resumeKey?: string;
  url: string;
  statePath: string;
  timestamp: number;
}

/**
 * Persists Playwright storageState + URL after each successful step so a later run
 * can skip completed steps. No dependency on this repo beyond Playwright types + Node.
 */
export class CheckpointManager {
  private readonly rootDir: string;
  private readonly metaPath: string;
  private readonly log?: CheckpointLog;
  private readonly id: string;

  constructor(testId: string, options?: CheckpointManagerOptions) {
    this.rootDir = options?.rootDir ?? path.join(process.cwd(), '.checkpoints');
    this.log = options?.log;
    this.id = this.sanitizeId(testId);
    this.metaPath = path.join(this.rootDir, `${this.id}.json`);
  }

  async checkpoint(
    step: number,
    context: BrowserContext,
    url: string,
    subCheckpoint?: string,
    resumeKey?: string,
  ): Promise<void> {
    this.ensureDir();
    const statePath = path.join(this.rootDir, `${this.id}.state.json`);
    await context.storageState({ path: statePath });

    const data: CheckpointData = {
      step,
      url,
      statePath,
      timestamp: Date.now(),
    };
    if (subCheckpoint !== undefined) {
      data.subCheckpoint = subCheckpoint;
    }
    if (resumeKey !== undefined) {
      data.resumeKey = resumeKey;
    }
    fs.writeFileSync(this.metaPath, JSON.stringify(data, null, 2));
    const sub =
      subCheckpoint !== undefined ? ` sub="${subCheckpoint}"` : '';
    this.log?.('debug', `Saved checkpoint at step ${step}${sub} for "${this.id}"`);
  }

  async hasCheckpoint(): Promise<CheckpointData | null> {
    if (!fs.existsSync(this.metaPath)) return null;

    try {
      const raw = fs.readFileSync(this.metaPath, 'utf-8');
      const data: CheckpointData = JSON.parse(raw);
      if (!fs.existsSync(data.statePath)) {
        this.log?.('warn', `State file missing for "${this.id}", clearing`);
        await this.clear();
        return null;
      }
      return data;
    } catch (err) {
      const detail = err instanceof Error ? err.stack ?? err.message : String(err);
      this.log?.(
        'warn',
        `Corrupt checkpoint metadata for "${this.id}" (clearing): ${detail}`,
      );
      await this.clear();
      return null;
    }
  }

  async getResumeStep(): Promise<number> {
    const cp = await this.hasCheckpoint();
    if (!cp) return 0;
    return cp.subCheckpoint != null ? cp.step : cp.step + 1;
  }

  async clear(): Promise<void> {
    const statePath = path.join(this.rootDir, `${this.id}.state.json`);
    if (fs.existsSync(this.metaPath)) fs.unlinkSync(this.metaPath);
    if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
    this.log?.('debug', `Cleared checkpoint for "${this.id}"`);
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
    }
  }

  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
  }
}
