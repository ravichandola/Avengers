import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Reporter } from './reporter.js';

/** Minimal HTML reporter — extend with Chart.js in static assets for trend graphs. */
export class HtmlReporter implements Reporter {
  constructor(private readonly outputDir: string) {}

  async onRunEnd(payload: Parameters<NonNullable<Reporter['onRunEnd']>>[0]): Promise<void> {
    await mkdir(this.outputDir, { recursive: true });
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Performance run ${payload.runId}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; }
    .ok { color: #0a0; } .bad { color: #c00; }
    pre { background: #111; color:#eee; padding:1rem; border-radius:8px; }
  </style>
</head>
<body>
  <h1>Performance report</h1>
  <p>Run <code>${payload.runId}</code> — <span class="${payload.passed ? 'ok' : 'bad'}">${payload.passed ? 'PASSED' : 'FAILED'}</span></p>
  <h2>Violations</h2>
  <pre>${payload.violations.length ? payload.violations.join('\n') : 'None'}</pre>
</body>
</html>`;
    await writeFile(join(this.outputDir, 'index.html'), html, 'utf8');
  }
}
