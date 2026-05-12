import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Reporter } from './reporter.js';

export class JsonReporter implements Reporter {
  private readonly rows: unknown[] = [];

  constructor(private readonly outputDir: string) {}

  async onMetric(payload: Parameters<NonNullable<Reporter['onMetric']>>[0]): Promise<void> {
    this.rows.push({ type: 'metric', ...payload, t: Date.now() });
  }

  async onRunEnd(payload: Parameters<NonNullable<Reporter['onRunEnd']>>[0]): Promise<void> {
    await mkdir(this.outputDir, { recursive: true });
    const path = join(this.outputDir, 'report.json');
    await writeFile(path, JSON.stringify({ summary: payload, samples: this.rows }, null, 2), 'utf8');
  }
}
