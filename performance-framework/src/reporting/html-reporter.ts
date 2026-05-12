import type { Reporter } from './reporter.js';
import { buildLabelStats, percentile, type MetricRow, type ReportViewModel } from './html-report/report-model.js';
import { writeHtmlReportBundle } from './html-report/write-html-report.js';

/** HTML reporter: React SSR markup + static `report.css` / `report.js` in the output directory. */
export class HtmlReporter implements Reporter {
  private scenarioName = '—';
  private scenarioId = '—';
  private tags: string[] = [];
  private readonly metrics: MetricRow[] = [];
  private runStartedAt = Date.now();

  constructor(private readonly outputDir: string) {}

  async onRunBegin(payload: Parameters<NonNullable<Reporter['onRunBegin']>>[0]): Promise<void> {
    this.scenarioName = payload.scenarioName;
    this.scenarioId = payload.scenarioId;
    this.tags = [...payload.tags];
    this.runStartedAt = Date.now();
    this.metrics.length = 0;
  }

  async onMetric(payload: Parameters<NonNullable<Reporter['onMetric']>>[0]): Promise<void> {
    this.metrics.push({
      label: payload.label,
      elapsedMs: payload.elapsedMs,
      success: payload.success,
      responseCode: payload.responseCode,
    });
  }

  async onRunEnd(payload: Parameters<NonNullable<Reporter['onRunEnd']>>[0]): Promise<void> {
    const { runId, passed, violations } = payload;
    const total = this.metrics.length;
    const globalPassed = this.metrics.filter((m) => m.success).length;
    const globalFailed = total - globalPassed;
    const globalErrPct = total ? (globalFailed / total) * 100 : 0;
    const allLat = this.metrics.map((m) => m.elapsedMs).sort((a, b) => a - b);
    const globalP95 = percentile(allLat, 0.95);
    const globalP99 = percentile(allLat, 0.99);
    const durationSec = ((Date.now() - this.runStartedAt) / 1000).toFixed(1);
    const rps = Number(durationSec) > 0 ? (total / Number(durationSec)).toFixed(1) : '0';

    const byLabel = buildLabelStats(this.metrics);
    const endedAt = new Date().toISOString();

    const summaryCards: ReportViewModel['summaryCards'] = [
      { title: 'Total samples', value: String(total), sub: `${globalPassed} passed · ${globalFailed} failed` },
      { title: 'Error rate', value: `${globalErrPct.toFixed(2)}%`, sub: 'Across all requests' },
      { title: 'Throughput', value: String(rps), sub: 'Samples / sec (wall)' },
      { title: 'Global p95', value: `${globalP95} ms`, sub: `p99: ${globalP99} ms` },
    ];

    const shortScenarioId =
      this.scenarioId.length > 12 ? `${this.scenarioId.slice(0, 8)}…${this.scenarioId.slice(-4)}` : this.scenarioId;

    const chartPayload = {
      labels: byLabel.map((s) => s.label),
      p50: byLabel.map((s) => s.p50),
      p95: byLabel.map((s) => s.p95),
      p99: byLabel.map((s) => s.p99),
      passed: byLabel.map((s) => s.passed),
      failed: byLabel.map((s) => s.failed),
      totalPass: globalPassed,
      totalFail: globalFailed,
    };
    const chartDataJson = JSON.stringify(chartPayload).replace(/</g, '\\u003c');

    const tailSamples = this.metrics.slice(-150).reverse();

    const model: ReportViewModel = {
      scenarioName: this.scenarioName,
      scenarioId: this.scenarioId,
      shortScenarioId,
      tags: this.tags,
      runId,
      passed,
      endedAt,
      durationSec,
      violations,
      summaryCards,
      byLabel,
      tailSamples,
      chartDataJson,
    };

    await writeHtmlReportBundle(this.outputDir, model);
  }
}
