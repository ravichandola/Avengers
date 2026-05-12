import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Reporter } from './reporter.js';

type MetricRow = {
  label: string;
  elapsedMs: number;
  success: boolean;
  responseCode: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(p * (sorted.length - 1));
  return sorted[idx] ?? 0;
}

type LabelStats = {
  label: string;
  count: number;
  passed: number;
  failed: number;
  errorRatePct: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
  p50: number;
  p95: number;
  p99: number;
  responseCodes: Record<string, number>;
};

function buildLabelStats(samples: MetricRow[]): LabelStats[] {
  const byLabel = new Map<string, MetricRow[]>();
  for (const s of samples) {
    const list = byLabel.get(s.label) ?? [];
    list.push(s);
    byLabel.set(s.label, list);
  }
  const out: LabelStats[] = [];
  const labels = [...byLabel.keys()].sort();
  for (const label of labels) {
    const rows = byLabel.get(label)!;
    const lat = rows.map((r) => r.elapsedMs).sort((a, b) => a - b);
    const passed = rows.filter((r) => r.success).length;
    const failed = rows.length - passed;
    const codes: Record<string, number> = {};
    for (const r of rows) {
      codes[r.responseCode] = (codes[r.responseCode] ?? 0) + 1;
    }
    out.push({
      label,
      count: rows.length,
      passed,
      failed,
      errorRatePct: rows.length ? (failed / rows.length) * 100 : 0,
      meanMs: rows.length ? lat.reduce((a, b) => a + b, 0) / rows.length : 0,
      minMs: lat[0] ?? 0,
      maxMs: lat[lat.length - 1] ?? 0,
      p50: percentile(lat, 0.5),
      p95: percentile(lat, 0.95),
      p99: percentile(lat, 0.99),
      responseCodes: codes,
    });
  }
  return out;
}

function formatCodes(codes: Record<string, number>): string {
  return Object.entries(codes)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c}: ${n}`)
    .join(' · ');
}

/** Playwright-inspired HTML report: sidebar nav, tags, bar/doughnut charts (Chart.js), themes. */
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
    await mkdir(this.outputDir, { recursive: true });

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
    const violationsHtml = violations.length
      ? `<ul class="violations-list">${violations.map((v) => `<li>${escapeHtml(v)}</li>`).join('')}</ul>`
      : '<p class="muted">No violations.</p>';

    const tail = this.metrics.slice(-150).reverse();
    const samplesRows = tail
      .map(
        (m, i) => `
        <tr class="sample-tr-animate ${m.success ? '' : 'row-fail'}" style="--sr:${Math.min(i, 24)}">
          <td class="num">${tail.length - i}</td>
          <td>${escapeHtml(m.label)}</td>
          <td class="num">${m.elapsedMs}</td>
          <td><span class="pill ${m.success ? 'pill-ok' : 'pill-bad'}">${m.success ? 'OK' : 'FAIL'}</span></td>
          <td><code>${escapeHtml(m.responseCode)}</code></td>
        </tr>`,
      )
      .join('');

    const tableRows = byLabel
      .map(
        (s, idx) => `
      <tr class="tr-animate" id="req-${idx}" style="--r:${Math.min(idx, 40)}">
        <td class="mono">${escapeHtml(s.label)}</td>
        <td class="num">${s.count}</td>
        <td class="num">${s.passed}</td>
        <td class="num ${s.failed ? 'bad' : ''}">${s.failed}</td>
        <td class="num">${s.errorRatePct.toFixed(2)}%</td>
        <td class="num">${s.meanMs.toFixed(0)}</td>
        <td class="num">${s.minMs}</td>
        <td class="num">${s.maxMs}</td>
        <td class="num">${s.p50}</td>
        <td class="num">${s.p95}</td>
        <td class="num">${s.p99}</td>
        <td class="codes">${escapeHtml(formatCodes(s.responseCodes))}</td>
      </tr>`,
      )
      .join('');

    const statusClass = passed ? 'status-pass status-anim' : 'status-fail status-anim';
    const endedAt = new Date().toISOString();

    const summaryCards: Array<{ title: string; value: string; sub: string }> = [
      { title: 'Total samples', value: String(total), sub: `${globalPassed} passed · ${globalFailed} failed` },
      { title: 'Error rate', value: `${globalErrPct.toFixed(2)}%`, sub: 'Across all requests' },
      { title: 'Throughput', value: String(rps), sub: 'Samples / sec (wall)' },
      { title: 'Global p95', value: `${globalP95} ms`, sub: `p99: ${globalP99} ms` },
    ];
    const cardsHtml = summaryCards
      .map(
        (c, i) => `
      <div class="card" style="--stagger:${i}">
        <h3>${escapeHtml(c.title)}</h3>
        <div class="val">${escapeHtml(c.value)}</div>
        <div class="sub">${escapeHtml(c.sub)}</div>
      </div>`,
      )
      .join('');

    const tagsHtml =
      this.tags.length > 0
        ? `<div class="pw-tags" aria-label="Tags">${this.tags
            .map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`)
            .join('')}</div>`
        : '';

    const sidebarNav =
      byLabel.length > 0
        ? `<nav class="pw-nav" aria-label="Requests">
        <div class="pw-nav-title">Requests</div>
        <ul class="pw-nav-list">${byLabel
          .map(
            (s, i) => `<li><a class="pw-nav-link" href="#req-${i}"><span class="pw-nav-dot ${s.failed > 0 ? 'dot-fail' : 'dot-ok'}" aria-hidden="true"></span><span class="pw-nav-label">${escapeHtml(s.label)}</span></a></li>`,
          )
          .join('')}</ul>
      </nav>`
        : `<nav class="pw-nav" aria-label="Requests"><p class="muted nav-empty">No labeled requests in this run.</p></nav>`;

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

    const chartsPanel =
      byLabel.length > 0
        ? `<section class="panel panel-charts panel-d0">
      <h2>Charts — latency & outcomes (Playwright-style overview)</h2>
      <div class="section-body chart-section-body">
        <div class="chart-grid">
          <div class="chart-card">
            <div class="chart-card-title">Sample outcomes</div>
            <div class="chart-canvas-wrap"><canvas id="chartTotals" aria-label="Passed vs failed samples"></canvas></div>
          </div>
          <div class="chart-card chart-wide">
            <div class="chart-card-title">Latency percentiles by request (ms)</div>
            <div class="chart-canvas-wrap tall"><canvas id="chartLatency" aria-label="Latency percentiles"></canvas></div>
          </div>
          <div class="chart-card chart-full">
            <div class="chart-card-title">Pass / fail count by request</div>
            <div class="chart-canvas-wrap wide"><canvas id="chartStacked" aria-label="Outcomes per request"></canvas></div>
          </div>
        </div>
      </div>
    </section>`
        : '';

    const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(this.scenarioName)} · Performance report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js" crossorigin="anonymous"></script>
  <style>
    :root {
      --bg: #f6f8fa;
      --bg-main: #ffffff;
      --card: #ffffff;
      --border: #d8dee4;
      --text: #1f2328;
      --muted: #656d76;
      --green: #1a7f37;
      --red: #cf222e;
      --shadow: 0 1px 3px rgba(31, 35, 40, 0.12);
      --shadow-hover: 0 8px 24px rgba(31, 35, 40, 0.12);
      --table-head: #f6f8fa;
      --codes: #24292f;
      --fail-bg: #fff8f8;
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --radius: 12px;
      --status-pass-bg: #dafbe1;
      --status-fail-bg: #ffebe9;
      --pill-ok-bg: #dafbe1;
      --pill-bad-bg: #ffebe9;
      --accent: #0969da;
      --sidebar-bg: #fafbfc;
      --topbar-pass: #1f883d;
      --topbar-fail: #cf222e;
      --tag-bg: #ddf4ff;
      --tag-text: #0969da;
      --chart-p50: #0969da;
      --chart-p95: #8250df;
      --chart-p99: #bf3989;
      --chart-pass: #1a7f37;
      --chart-fail: #cf222e;
      --chart-grid: rgba(31, 35, 40, 0.08);
      --chart-text: #656d76;
    }
    [data-theme="dark"] {
      --bg: #010409;
      --bg-main: #0d1117;
      --card: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --green: #3fb950;
      --red: #ff7b72;
      --shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
      --shadow-hover: 0 8px 24px rgba(0, 0, 0, 0.45);
      --table-head: #21262d;
      --codes: #adbac7;
      --fail-bg: #3d1114;
      --status-pass-bg: rgba(46, 160, 67, 0.2);
      --status-fail-bg: rgba(248, 81, 73, 0.15);
      --pill-ok-bg: rgba(46, 160, 67, 0.22);
      --pill-bad-bg: rgba(248, 81, 73, 0.2);
      --accent: #58a6ff;
      --sidebar-bg: #0d1117;
      --topbar-pass: #3fb950;
      --topbar-fail: #ff7b72;
      --tag-bg: rgba(56, 139, 253, 0.15);
      --tag-text: #58a6ff;
      --chart-p50: #58a6ff;
      --chart-p95: #a371f7;
      --chart-p99: #f778ba;
      --chart-pass: #3fb950;
      --chart-fail: #ff7b72;
      --chart-grid: rgba(139, 148, 158, 0.2);
      --chart-text: #8b949e;
    }

    * { box-sizing: border-box; }

    @keyframes fadeRaise {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes rowIn {
      from { opacity: 0; transform: translateX(-8px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes statusGlow {
      0%, 100% { box-shadow: 0 0 0 0 rgba(63, 185, 80, 0); }
      40% { box-shadow: 0 0 0 8px rgba(63, 185, 80, 0.12); }
    }

    html { scroll-behavior: smooth; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      margin: 0;
      color: var(--text);
      line-height: 1.5;
      font-size: 14px;
      min-height: 100vh;
      background: var(--bg);
      transition: background 0.25s ease, color 0.2s ease;
    }

    .pw-topbar {
      height: 4px;
      background: ${passed ? 'var(--topbar-pass)' : 'var(--topbar-fail)'};
    }

    .pw-shell {
      display: flex;
      align-items: flex-start;
      max-width: 1440px;
      margin: 0 auto;
      min-height: calc(100vh - 4px);
    }

    .pw-sidebar {
      width: 260px;
      flex-shrink: 0;
      position: sticky;
      top: 0;
      align-self: flex-start;
      max-height: 100vh;
      overflow-y: auto;
      border-right: 1px solid var(--border);
      background: var(--sidebar-bg);
      padding: 1rem 0.75rem 2rem;
    }

    .pw-brand {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      padding: 0 0.65rem 0.75rem;
    }

    .pw-nav-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      padding: 0.5rem 0.65rem 0.35rem;
    }

    .pw-nav-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .pw-nav-link {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.45rem 0.65rem;
      border-radius: 8px;
      color: var(--text);
      text-decoration: none;
      font-size: 13px;
      transition: background 0.15s ease;
    }
    .pw-nav-link:hover { background: rgba(9, 105, 218, 0.08); }
    [data-theme="dark"] .pw-nav-link:hover { background: rgba(88, 166, 255, 0.12); }

    .pw-nav-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot-ok { background: var(--chart-pass); }
    .dot-fail { background: var(--chart-fail); }

    .pw-nav-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .nav-empty, .small { font-size: 12px; padding: 0 0.65rem; }

    .pw-main {
      flex: 1;
      min-width: 0;
      background: var(--bg-main);
      padding: 1.25rem 1.5rem 3rem;
      animation: fadeRaise 0.5s ease backwards;
    }

    .pw-header {
      margin-bottom: 1.25rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }

    .pw-header-top {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .pw-kicker {
      font-size: 12px;
      color: var(--muted);
      margin: 0 0 0.25rem;
      font-weight: 500;
    }

    .pw-title {
      font-size: 1.5rem;
      font-weight: 650;
      margin: 0;
      letter-spacing: -0.03em;
      line-height: 1.25;
    }

    .pw-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 0.65rem;
    }

    .tag-pill {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: var(--tag-bg);
      color: var(--tag-text);
    }

    .theme-bar {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-shrink: 0;
    }
    .theme-bar span {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .theme-bar button {
      font: inherit;
      font-size: 11px;
      font-weight: 600;
      padding: 0.3rem 0.55rem;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--text);
      cursor: pointer;
    }
    .theme-bar button[aria-pressed="true"] {
      border-color: var(--accent);
      color: var(--accent);
    }

    .subtitle {
      color: var(--muted);
      font-size: 12px;
      margin-top: 0.65rem;
      line-height: 1.6;
    }
    .subtitle code {
      font-size: 11px;
      font-family: var(--mono);
      background: var(--table-head);
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid var(--border);
    }

    .status-bar {
      display: inline-flex;
      align-items: center;
      margin-top: 0.75rem;
      padding: 0.35rem 0.85rem;
      border-radius: 6px;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.02em;
    }
    .status-pass {
      background: var(--status-pass-bg);
      color: var(--green);
      border: 1px solid rgba(26, 127, 55, 0.25);
    }
    .status-fail {
      background: var(--status-fail-bg);
      color: var(--red);
      border: 1px solid rgba(207, 34, 46, 0.25);
    }
    .status-anim.status-pass { animation: statusGlow 2s ease-in-out 2; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 0.75rem;
      margin: 1rem 0 1.25rem;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1rem;
      box-shadow: var(--shadow);
      transition: box-shadow 0.2s ease;
      animation: fadeRaise 0.45s ease backwards;
      animation-delay: calc(var(--stagger, 0) * 0.08s);
    }
    .card:hover { box-shadow: var(--shadow-hover); }
    .card h3 {
      margin: 0 0 0.3rem;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .card .val {
      font-size: 1.35rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .card .sub { font-size: 11px; color: var(--muted); margin-top: 0.3rem; }

    section.panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin: 1rem 0;
      overflow: hidden;
      box-shadow: var(--shadow);
      animation: fadeRaise 0.5s ease backwards;
    }
    section.panel-d0 { animation-delay: 0.1s; }
    section.panel-d1 { animation-delay: 0.18s; }
    section.panel-d2 { animation-delay: 0.26s; }
    section.panel-d3 { animation-delay: 0.34s; }
    section.panel h2 {
      margin: 0;
      padding: 0.75rem 1rem;
      font-size: 13px;
      font-weight: 650;
      border-bottom: 1px solid var(--border);
      background: var(--table-head);
    }

    .chart-section-body { padding: 1rem; }
    .chart-grid {
      display: grid;
      grid-template-columns: minmax(200px, 280px) 1fr;
      gap: 1rem;
      align-items: stretch;
    }
    @media (max-width: 900px) {
      .pw-shell { flex-direction: column; }
      .pw-sidebar {
        position: relative;
        width: 100%;
        max-height: none;
        border-right: none;
        border-bottom: 1px solid var(--border);
      }
      .chart-grid { grid-template-columns: 1fr; }
    }

    .chart-card {
      background: var(--table-head);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
    }
    .chart-card-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 0.5rem;
    }
    .chart-canvas-wrap {
      position: relative;
      flex: 1;
      min-height: 200px;
    }
    .chart-canvas-wrap.tall { min-height: 280px; }
    .chart-canvas-wrap.wide { min-height: 240px; }
    .chart-wide { grid-column: 2; }
    .chart-full { grid-column: 1 / -1; }

    .section-body { padding: 1rem; overflow-x: auto; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
    th {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      font-weight: 700;
      background: var(--table-head);
    }
    tbody tr:hover td { background: rgba(9, 105, 218, 0.04); }
    [data-theme="dark"] tbody tr:hover td { background: rgba(88, 166, 255, 0.06); }

    .tr-animate {
      animation: rowIn 0.35s ease backwards;
      animation-delay: calc(var(--r, 0) * 24ms);
      scroll-margin-top: 96px;
    }
    .sample-tr-animate {
      animation: rowIn 0.3s ease backwards;
      animation-delay: calc(var(--sr, 0) * 18ms);
    }

    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .mono { font-family: var(--mono); font-size: 12px; }
    .codes { font-size: 11px; color: var(--codes); max-width: 200px; word-break: break-word; }
    .row-fail td { background: var(--fail-bg) !important; }
    .bad { color: var(--red); font-weight: 700; }
    .muted { color: var(--muted); margin: 0; }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
    }
    .pill-ok { background: var(--pill-ok-bg); color: var(--green); }
    .pill-bad { background: var(--pill-bad-bg); color: var(--red); }
    .violations-list { margin: 0; padding-left: 1.25rem; color: var(--red); }
    .samples-scroll { max-height: 400px; overflow: auto; }

    footer {
      margin-top: 2rem;
      font-size: 11px;
      color: var(--muted);
      text-align: center;
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  </style>
</head>
<body>
  <div class="pw-topbar" role="presentation"></div>
  <div class="pw-shell">
    <aside class="pw-sidebar">
      <div class="pw-brand">Performance</div>
      ${sidebarNav}
    </aside>
    <main class="pw-main">
      <header class="pw-header">
        <div class="pw-header-top">
          <div>
            <p class="pw-kicker">Scenario test</p>
            <h1 class="pw-title">${escapeHtml(this.scenarioName)}</h1>
            ${tagsHtml}
          </div>
          <div class="theme-bar" role="group" aria-label="Theme">
            <span>Theme</span>
            <button type="button" data-theme-btn="light" aria-pressed="false">Light</button>
            <button type="button" data-theme-btn="dark" aria-pressed="false">Dark</button>
            <button type="button" data-theme-btn="system" aria-pressed="true">System</button>
          </div>
        </div>
        <div class="subtitle">
          Scenario ID <code title="${escapeHtml(this.scenarioId)}">${escapeHtml(shortScenarioId)}</code>
          · Run <code>${escapeHtml(runId)}</code>
          · ${escapeHtml(endedAt)}
          · Wall <code>~${escapeHtml(durationSec)}s</code>
        </div>
        <div class="status-bar ${statusClass}" role="status">${passed ? 'All checks passed' : 'Failed — see violations'}</div>
      </header>

    <div class="grid">${cardsHtml}</div>

    ${chartsPanel}

    <section class="panel panel-d3">
      <h2>Requests — latency & reliability</h2>
      <div class="section-body">
        ${
          byLabel.length
            ? `<table>
          <thead>
            <tr>
              <th>Request (label)</th>
              <th class="num">N</th>
              <th class="num">OK</th>
              <th class="num">Fail</th>
              <th class="num">Err%</th>
              <th class="num">Mean</th>
              <th class="num">Min</th>
              <th class="num">Max</th>
              <th class="num">p50</th>
              <th class="num">p95</th>
              <th class="num">p99</th>
              <th>HTTP codes</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>`
            : '<p class="muted">No metric samples were recorded (run may have failed before JTL was parsed).</p>'
        }
      </div>
    </section>

    <section class="panel panel-d1">
      <h2>SLA &amp; assertion violations</h2>
      <div class="section-body">${violationsHtml}</div>
    </section>

    <section class="panel panel-d2">
      <h2>Recent samples (last ${tail.length})</h2>
      <div class="section-body samples-scroll">
        ${
          tail.length
            ? `<table>
          <thead>
            <tr>
              <th class="num">#</th>
              <th>Label</th>
              <th class="num">Elapsed ms</th>
              <th>Result</th>
              <th>Code</th>
            </tr>
          </thead>
          <tbody>${samplesRows}</tbody>
        </table>`
            : '<p class="muted">No samples.</p>'
        }
      </div>
    </section>

    <footer>Enterprise performance framework · HTML report</footer>
    </main>
  </div>
  <script type="application/json" id="perf-chart-data">${chartDataJson}</script>
  <script>
(function () {
  var KEY = 'perf-fw-report-theme';
  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var chartInstances = [];

  function chartColors() {
    var st = getComputedStyle(root);
    return {
      p50: st.getPropertyValue('--chart-p50').trim(),
      p95: st.getPropertyValue('--chart-p95').trim(),
      p99: st.getPropertyValue('--chart-p99').trim(),
      pass: st.getPropertyValue('--chart-pass').trim(),
      fail: st.getPropertyValue('--chart-fail').trim(),
      grid: st.getPropertyValue('--chart-grid').trim(),
      text: st.getPropertyValue('--chart-text').trim(),
    };
  }

  function readChartPayload() {
    var el = document.getElementById('perf-chart-data');
    if (!el || !el.textContent) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  function destroyCharts() {
    chartInstances.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    chartInstances = [];
  }

  function buildCharts() {
    if (typeof Chart === 'undefined') return;
    var D = readChartPayload();
    if (!D || !D.labels || !D.labels.length) return;
    destroyCharts();
    var C = chartColors();
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var anim = reduced ? false : { duration: 400 };

    var elTotals = document.getElementById('chartTotals');
    if (elTotals && (D.totalPass > 0 || D.totalFail > 0)) {
      chartInstances.push(new Chart(elTotals, {
        type: 'doughnut',
        data: {
          labels: ['Passed samples', 'Failed samples'],
          datasets: [{
            data: [D.totalPass, D.totalFail],
            backgroundColor: [C.pass, C.fail],
            borderWidth: 0,
          }],
        },
        options: {
          animation: anim,
          plugins: { legend: { position: 'bottom', labels: { color: C.text, boxWidth: 12 } } },
        },
      }));
    }

    var elLat = document.getElementById('chartLatency');
    if (elLat) {
      chartInstances.push(new Chart(elLat, {
        type: 'bar',
        data: {
          labels: D.labels,
          datasets: [
            { label: 'p50', data: D.p50, backgroundColor: C.p50 },
            { label: 'p95', data: D.p95, backgroundColor: C.p95 },
            { label: 'p99', data: D.p99, backgroundColor: C.p99 },
          ],
        },
        options: {
          animation: anim,
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: C.text, maxRotation: 45 }, grid: { color: C.grid } },
            y: { beginAtZero: true, ticks: { color: C.text }, grid: { color: C.grid }, title: { display: true, text: 'ms', color: C.text } },
          },
          plugins: { legend: { labels: { color: C.text } } },
        },
      }));
    }

    var elStack = document.getElementById('chartStacked');
    if (elStack) {
      chartInstances.push(new Chart(elStack, {
        type: 'bar',
        data: {
          labels: D.labels,
          datasets: [
            { label: 'Passed', data: D.passed, backgroundColor: C.pass, stack: 's' },
            { label: 'Failed', data: D.failed, backgroundColor: C.fail, stack: 's' },
          ],
        },
        options: {
          animation: anim,
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { stacked: true, beginAtZero: true, ticks: { color: C.text }, grid: { color: C.grid } },
            y: { stacked: true, ticks: { color: C.text }, grid: { display: false } },
          },
          plugins: { legend: { labels: { color: C.text } } },
        },
      }));
    }
  }

  function effectiveMode(pref) {
    if (pref === 'system') return mq.matches ? 'dark' : 'light';
    return pref;
  }

  function applyResolved(resolved) {
    root.setAttribute('data-theme', resolved);
    requestAnimationFrame(function () { destroyCharts(); buildCharts(); });
  }

  function setPreference(pref) {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
    syncButtons(pref);
    applyResolved(effectiveMode(pref));
  }

  function syncButtons(pref) {
    var saved = localStorage.getItem(KEY);
    var active = saved === 'light' || saved === 'dark' ? saved : 'system';
    document.querySelectorAll('[data-theme-btn]').forEach(function (btn) {
      var m = btn.getAttribute('data-theme-btn');
      btn.setAttribute('aria-pressed', m === active ? 'true' : 'false');
    });
  }

  function init() {
    var saved = localStorage.getItem(KEY);
    var pref = saved === 'light' || saved === 'dark' ? saved : 'system';
    syncButtons(pref);
    root.setAttribute('data-theme', effectiveMode(pref));

    document.querySelectorAll('[data-theme-btn]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setPreference(btn.getAttribute('data-theme-btn'));
      });
    });

    mq.addEventListener('change', function () {
      if (!localStorage.getItem(KEY)) applyResolved(effectiveMode('system'));
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', buildCharts);
    } else {
      requestAnimationFrame(buildCharts);
    }
  }

  init();
})();
  </script>
</body>
</html>`;

    await writeFile(join(this.outputDir, 'index.html'), html, 'utf8');
  }
}
