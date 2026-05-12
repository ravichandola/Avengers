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

/** Rich HTML report with themes, motion (respects reduced-motion), and executive layout. */
export class HtmlReporter implements Reporter {
  private scenarioName = '—';
  private readonly metrics: MetricRow[] = [];
  private runStartedAt = Date.now();

  constructor(private readonly outputDir: string) {}

  async onRunBegin(payload: Parameters<NonNullable<Reporter['onRunBegin']>>[0]): Promise<void> {
    this.scenarioName = payload.scenarioName;
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
      <tr class="tr-animate" style="--r:${Math.min(idx, 40)}">
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

    const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Performance — ${escapeHtml(this.scenarioName)}</title>
  <style>
    :root {
      --bg: #f0f2f5;
      --bg-wave: #e8ecf2;
      --card: #ffffff;
      --border: #e1e4e8;
      --text: #1a1a1a;
      --muted: #656d76;
      --green: #1a7f37;
      --red: #cf222e;
      --shadow: 0 4px 24px rgba(15, 20, 30, 0.06);
      --shadow-hover: 0 12px 40px rgba(15, 20, 30, 0.1);
      --table-head: #f6f8fa;
      --codes: #444;
      --fail-bg: #fff5f5;
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --radius: 10px;
      --status-pass-bg: #d1f4e0;
      --status-fail-bg: #ffe4e8;
      --pill-ok-bg: #d1f4e0;
      --pill-bad-bg: #ffe4e8;
    }
    [data-theme="dark"] {
      --bg: #0d1117;
      --bg-wave: #161b22;
      --card: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --green: #3fb950;
      --red: #ff7b72;
      --shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
      --shadow-hover: 0 12px 40px rgba(0, 0, 0, 0.45);
      --table-head: #21262d;
      --codes: #adbac7;
      --fail-bg: #3d1114;
      --status-pass-bg: rgba(63, 185, 80, 0.2);
      --status-fail-bg: rgba(255, 123, 114, 0.18);
      --pill-ok-bg: rgba(63, 185, 80, 0.22);
      --pill-bad-bg: rgba(255, 123, 114, 0.2);
    }

    * { box-sizing: border-box; }

    @keyframes bgDrift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    @keyframes fadeRaise {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes rowIn {
      from { opacity: 0; transform: translateX(-12px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes statusGlow {
      0%, 100% { box-shadow: 0 0 0 0 rgba(63, 185, 80, 0); }
      40% { box-shadow: 0 0 0 8px rgba(63, 185, 80, 0.15); }
    }
    @keyframes statusGlowLight {
      0%, 100% { box-shadow: 0 0 0 0 rgba(26, 127, 55, 0); }
      40% { box-shadow: 0 0 0 6px rgba(26, 127, 55, 0.2); }
    }

    html { scroll-behavior: smooth; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      color: var(--text);
      line-height: 1.5;
      font-size: 14px;
      min-height: 100vh;
      background: linear-gradient(125deg, var(--bg) 0%, var(--bg-wave) 45%, var(--bg) 90%);
      background-size: 200% 200%;
      animation: bgDrift 22s ease-in-out infinite;
      transition: background 0.4s ease, color 0.3s ease;
    }
    [data-theme="dark"] body {
      animation-duration: 28s;
    }

    .wrap {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1.5rem 1.25rem 3rem;
      animation: fadeRaise 0.65s cubic-bezier(0.22, 1, 0.36, 1) backwards;
    }

    header {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.1rem 1.2rem 1.15rem;
      margin-bottom: 1.35rem;
      box-shadow: var(--shadow);
      animation: fadeRaise 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.08s backwards;
      transition: box-shadow 0.35s ease, border-color 0.3s ease;
    }
    header:hover { box-shadow: var(--shadow-hover); }

    .header-top {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .header-top h1 {
      font-size: 1.35rem;
      font-weight: 600;
      margin: 0;
      letter-spacing: -0.02em;
    }

    .theme-bar {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      flex-shrink: 0;
    }
    .theme-bar span {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .theme-bar button {
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      padding: 0.35rem 0.65rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      cursor: pointer;
      transition: transform 0.18s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .theme-bar button:hover {
      transform: translateY(-1px);
      border-color: var(--muted);
    }
    .theme-bar button[aria-pressed="true"] {
      background: linear-gradient(180deg, var(--table-head), var(--card));
      border-color: var(--muted);
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    [data-theme="dark"] .theme-bar button[aria-pressed="true"] {
      box-shadow: 0 2px 12px rgba(0,0,0,0.25);
    }

    .subtitle { color: var(--muted); font-size: 13px; margin-top: 0.4rem; }
    .subtitle code {
      font-size: 12px;
      font-family: var(--mono);
      background: var(--bg);
      padding: 2px 7px;
      border-radius: 6px;
      border: 1px solid var(--border);
    }

    .status-bar {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.85rem;
      padding: 0.45rem 0.9rem;
      border-radius: 999px;
      font-weight: 600;
      font-size: 13px;
      transition: transform 0.2s ease;
    }
    .status-pass {
      background: var(--status-pass-bg);
      color: var(--green);
      border: 1px solid rgba(63, 185, 80, 0.35);
    }
    [data-theme="light"] .status-pass { border-color: rgba(26, 127, 55, 0.25); }
    .status-fail {
      background: var(--status-fail-bg);
      color: var(--red);
      border: 1px solid rgba(255, 123, 114, 0.35);
    }
    .status-anim.status-pass {
      animation: statusGlowLight 2.4s ease-in-out 2;
    }
    [data-theme="dark"] .status-anim.status-pass {
      animation-name: statusGlow;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
      gap: 0.85rem;
      margin: 1.25rem 0;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.05rem 1.1rem;
      box-shadow: var(--shadow);
      animation: fadeRaise 0.55s cubic-bezier(0.22, 1, 0.36, 1) backwards;
      animation-delay: calc(var(--stagger, 0) * 0.1s + 0.12s);
      transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.25s ease, border-color 0.25s ease;
    }
    .card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-hover);
      border-color: var(--muted);
    }
    .card h3 {
      margin: 0 0 0.35rem;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }
    .card .val {
      font-size: 1.42rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }
    .card .sub { font-size: 12px; color: var(--muted); margin-top: 0.35rem; }

    section.panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin: 1.25rem 0;
      overflow: hidden;
      box-shadow: var(--shadow);
      animation: fadeRaise 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
      transition: box-shadow 0.3s ease;
    }
    section.panel:hover { box-shadow: var(--shadow-hover); }
    section.panel-d0 { animation-delay: 0.42s; }
    section.panel-d1 { animation-delay: 0.52s; }
    section.panel-d2 { animation-delay: 0.62s; }

    section.panel h2 {
      margin: 0;
      padding: 0.9rem 1.05rem;
      font-size: 13px;
      font-weight: 600;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(180deg, var(--table-head) 0%, var(--card) 100%);
      letter-spacing: -0.01em;
    }

    .section-body { padding: 1rem; overflow-x: auto; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 9px 11px; border-bottom: 1px solid var(--border); }
    th {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      font-weight: 600;
      background: var(--table-head);
      position: sticky;
      top: 0;
    }
    tbody tr {
      transition: background 0.18s ease;
    }
    tbody tr:hover td {
      background: rgba(99, 110, 130, 0.06);
    }
    [data-theme="dark"] tbody tr:hover td {
      background: rgba(139, 148, 158, 0.08);
    }
    tr:last-child td { border-bottom: none; }

    .tr-animate {
      animation: rowIn 0.42s ease backwards;
      animation-delay: calc(var(--r, 0) * 28ms);
    }
    .sample-tr-animate {
      animation: rowIn 0.38s ease backwards;
      animation-delay: calc(var(--sr, 0) * 22ms);
    }

    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .mono { font-family: var(--mono); font-size: 12px; }
    .codes { font-size: 12px; color: var(--codes); max-width: 220px; word-break: break-word; }
    .row-fail td { background: var(--fail-bg) !important; }
    .bad { color: var(--red); font-weight: 600; }
    .muted { color: var(--muted); margin: 0; }
    .pill {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      transition: transform 0.15s ease;
    }
    .pill:hover { transform: scale(1.04); }
    .pill-ok { background: var(--pill-ok-bg); color: var(--green); }
    .pill-bad { background: var(--pill-bad-bg); color: var(--red); }
    .violations-list { margin: 0; padding-left: 1.25rem; color: var(--red); }
    .samples-scroll { max-height: 420px; overflow: auto; scroll-behavior: smooth; }

    footer {
      margin-top: 2.25rem;
      font-size: 12px;
      color: var(--muted);
      text-align: center;
      opacity: 0.85;
      animation: fadeRaise 0.5s ease 0.85s backwards;
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
      body { animation: none; background: var(--bg); }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="header-top">
        <h1>${escapeHtml(this.scenarioName)}</h1>
        <div class="theme-bar" role="group" aria-label="Theme">
          <span>Theme</span>
          <button type="button" data-theme-btn="light" aria-pressed="false">Light</button>
          <button type="button" data-theme-btn="dark" aria-pressed="false">Dark</button>
          <button type="button" data-theme-btn="system" aria-pressed="true">System</button>
        </div>
      </div>
      <div class="subtitle">
        Run ID <code>${escapeHtml(runId)}</code> · Generated <code>${escapeHtml(endedAt)}</code> · Wall time ~${escapeHtml(durationSec)}s
      </div>
      <div class="status-bar ${statusClass}">${passed ? 'PASSED — all gates green' : 'FAILED — see violations'}</div>
    </header>

    <div class="grid">${cardsHtml}</div>

    <section class="panel panel-d0">
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
      <h2>SLA & assertion violations</h2>
      <div class="section-body">${violationsHtml}</div>
    </section>

    <section class="panel panel-d2">
      <h2>Recent samples (last ${tail.length} — detail)</h2>
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

    <footer>Enterprise performance framework · HTML reporter</footer>
  </div>
  <script>
(function () {
  var KEY = 'perf-fw-report-theme';
  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');

  function effectiveMode(pref) {
    if (pref === 'system') return mq.matches ? 'dark' : 'light';
    return pref;
  }

  function applyResolved(resolved) {
    root.setAttribute('data-theme', resolved);
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
      var isActive = m === active;
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function init() {
    var saved = localStorage.getItem(KEY);
    var pref = saved === 'light' || saved === 'dark' ? saved : 'system';
    syncButtons(pref);
    applyResolved(effectiveMode(pref));

    document.querySelectorAll('[data-theme-btn]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setPreference(btn.getAttribute('data-theme-btn'));
      });
    });

    mq.addEventListener('change', function () {
      if (!localStorage.getItem(KEY)) applyResolved(effectiveMode('system'));
    });
  }

  init();
})();
  </script>
</body>
</html>`;

    await writeFile(join(this.outputDir, 'index.html'), html, 'utf8');
  }
}
