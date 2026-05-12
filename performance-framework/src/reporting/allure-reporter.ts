import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Reporter } from './reporter.js';

/** Writes Allure-compatible container/result stubs; expand with full steps/results as needed. */
export class AllureReporter implements Reporter {
  constructor(private readonly outputDir: string) {}

  async onRunBegin(payload: Parameters<NonNullable<Reporter['onRunBegin']>>[0]): Promise<void> {
    await mkdir(this.outputDir, { recursive: true });
    await writeFile(
      join(this.outputDir, `${payload.runId}-container.json`),
      JSON.stringify({ name: payload.scenarioName, uuid: payload.runId }, null, 2),
      'utf8',
    );
  }
}
