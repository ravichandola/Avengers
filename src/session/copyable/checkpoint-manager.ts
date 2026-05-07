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

  async checkpoint(step: number, context: BrowserContext, url: string): Promise<void> {
    this.ensureDir();
    const statePath = path.join(this.rootDir, `${this.id}.state.json`);
    await context.storageState({ path: statePath });

    const data: CheckpointData = {
      step,
      url,
      statePath,
      timestamp: Date.now(),
    };
    fs.writeFileSync(this.metaPath, JSON.stringify(data, null, 2));
    this.log?.('debug', `Saved checkpoint at step ${step} for "${this.id}"`);
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
    } catch {
      await this.clear();
      return null;
    }
  }

  async getResumeStep(): Promise<number> {
    const cp = await this.hasCheckpoint();
    return cp ? cp.step + 1 : 0;
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
