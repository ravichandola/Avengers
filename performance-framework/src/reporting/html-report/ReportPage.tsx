import type { ReactNode } from "react";
import type { LabelStats, MetricRow, ReportViewModel } from "./report-model.js";
import { formatCodes } from "./report-model.js";

function Sidebar({ byLabel }: { byLabel: LabelStats[] }): ReactNode {
  if (byLabel.length === 0) {
    return (
      <nav className="pw-nav" aria-label="Requests">
        <p className="muted nav-empty">No labeled requests in this run.</p>
      </nav>
    );
  }
  return (
    <nav className="pw-nav" aria-label="Requests">
      <div className="pw-nav-title">Requests</div>
      <ul className="pw-nav-list">
        {byLabel.map((s, i) => (
          <li key={i}>
            <a className="pw-nav-link" href={`#req-${i}`}>
              <span
                className={`pw-nav-dot ${s.failed > 0 ? "dot-fail" : "dot-ok"}`}
                aria-hidden="true"
              />
              <span className="pw-nav-label">{s.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TagRow({ tags }: { tags: string[] }): ReactNode {
  if (tags.length === 0) return null;
  return (
    <div className="pw-tags" aria-label="Tags">
      {tags.map((t, i) => (
        <span key={`${i}-${t}`} className="tag-pill">
          {t}
        </span>
      ))}
    </div>
  );
}

function SummaryGrid({
  cards,
}: {
  cards: ReportViewModel["summaryCards"];
}): ReactNode {
  return (
    <div className="grid">
      {cards.map((c, i) => (
        <div
          key={`${i}-${c.title}`}
          className="card"
          style={{ ["--stagger" as string]: i }}
        >
          <h3>{c.title}</h3>
          <div className="val">{c.value}</div>
          <div className="sub">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

function ChartsPanel({ byLabel }: { byLabel: LabelStats[] }): ReactNode {
  if (byLabel.length === 0) return null;
  return (
    <section className="panel panel-charts panel-d0">
      <h2>Charts — latency & outcomes </h2>
      <div className="section-body chart-section-body">
        <div className="chart-grid">
          <div className="chart-card">
            <div className="chart-card-title">Sample outcomes</div>
            <div className="chart-canvas-wrap">
              <canvas id="chartTotals" aria-label="Passed vs failed samples" />
            </div>
          </div>
          <div className="chart-card chart-wide">
            <div className="chart-card-title">
              Latency percentiles by request (ms)
            </div>
            <div className="chart-canvas-wrap tall">
              <canvas id="chartLatency" aria-label="Latency percentiles" />
            </div>
          </div>
          <div className="chart-card chart-full">
            <div className="chart-card-title">Pass / fail count by request</div>
            <div className="chart-canvas-wrap wide">
              <canvas id="chartStacked" aria-label="Outcomes per request" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RequestsTable({ byLabel }: { byLabel: LabelStats[] }): ReactNode {
  if (byLabel.length === 0) {
    return (
      <p className="muted">
        No metric samples were recorded (run may have failed before JTL was
        parsed).
      </p>
    );
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Request (label)</th>
          <th className="num">N</th>
          <th className="num">OK</th>
          <th className="num">Fail</th>
          <th className="num">Err%</th>
          <th className="num">Mean</th>
          <th className="num">Min</th>
          <th className="num">Max</th>
          <th className="num">p50</th>
          <th className="num">p95</th>
          <th className="num">p99</th>
          <th>HTTP codes</th>
        </tr>
      </thead>
      <tbody>
        {byLabel.map((s, idx) => (
          <tr
            key={idx}
            className="tr-animate"
            id={`req-${idx}`}
            style={{ ["--r" as string]: Math.min(idx, 40) }}
          >
            <td className="mono">{s.label}</td>
            <td className="num">{s.count}</td>
            <td className="num">{s.passed}</td>
            <td className={`num ${s.failed ? "bad" : ""}`}>{s.failed}</td>
            <td className="num">{s.errorRatePct.toFixed(2)}%</td>
            <td className="num">{s.meanMs.toFixed(0)}</td>
            <td className="num">{s.minMs}</td>
            <td className="num">{s.maxMs}</td>
            <td className="num">{s.p50}</td>
            <td className="num">{s.p95}</td>
            <td className="num">{s.p99}</td>
            <td className="codes">{formatCodes(s.responseCodes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ViolationsBlock({ violations }: { violations: string[] }): ReactNode {
  if (violations.length === 0) {
    return <p className="muted">No violations.</p>;
  }
  return (
    <ul className="violations-list">
      {violations.map((v, i) => (
        <li key={i}>{v}</li>
      ))}
    </ul>
  );
}

function SamplesTable({
  tailSamples,
}: {
  tailSamples: MetricRow[];
}): ReactNode {
  if (tailSamples.length === 0) {
    return <p className="muted">No samples.</p>;
  }
  const n = tailSamples.length;
  return (
    <table>
      <thead>
        <tr>
          <th className="num">#</th>
          <th>Label</th>
          <th className="num">Elapsed ms</th>
          <th>Result</th>
          <th>Code</th>
        </tr>
      </thead>
      <tbody>
        {tailSamples.map((m, i) => (
          <tr
            key={i}
            className={`sample-tr-animate ${m.success ? "" : "row-fail"}`}
            style={{ ["--sr" as string]: Math.min(i, 24) }}
          >
            <td className="num">{n - i}</td>
            <td>{m.label}</td>
            <td className="num">{m.elapsedMs}</td>
            <td>
              <span className={`pill ${m.success ? "pill-ok" : "pill-bad"}`}>
                {m.success ? "OK" : "FAIL"}
              </span>
            </td>
            <td>
              <code>{m.responseCode}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Root document for SSR; paired with `report.css` + `report.js` in the same output folder. */
export function ReportPage(props: ReportViewModel): ReactNode {
  const {
    scenarioName,
    scenarioId,
    shortScenarioId,
    tags,
    runId,
    passed,
    endedAt,
    durationSec,
    violations,
    summaryCards,
    byLabel,
    tailSamples,
    chartDataJson,
  } = props;

  const statusClass = passed
    ? "status-pass status-anim"
    : "status-fail status-anim";

  return (
    <html lang="en" data-theme="light" data-passed={passed ? "true" : "false"}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{scenarioName} · Performance report</title>
        <link rel="stylesheet" href="report.css" />
        <script
          src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <div className="pw-topbar" role="presentation" />
        <div className="pw-shell">
          <aside className="pw-sidebar">
            <div className="pw-brand">Performance</div>
            <Sidebar byLabel={byLabel} />
          </aside>
          <main className="pw-main">
            <header className="pw-header">
              <div className="pw-header-top">
                <div>
                  <p className="pw-kicker">Scenario test</p>
                  <h1 className="pw-title">{scenarioName}</h1>
                  <TagRow tags={tags} />
                </div>
                <div className="theme-bar" role="group" aria-label="Theme">
                  <span>Theme</span>
                  <button
                    type="button"
                    data-theme-btn="light"
                    aria-pressed="false"
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    data-theme-btn="dark"
                    aria-pressed="false"
                  >
                    Dark
                  </button>
                  <button
                    type="button"
                    data-theme-btn="system"
                    aria-pressed="true"
                  >
                    System
                  </button>
                </div>
              </div>
              <div className="subtitle">
                Scenario ID <code title={scenarioId}>{shortScenarioId}</code>
                {" · "}
                Run <code>{runId}</code>
                {" · "}
                {endedAt}
                {" · "}
                Wall <code>~{durationSec}s</code>
              </div>
              <div className={`status-bar ${statusClass}`} role="status">
                {passed ? "All checks passed" : "Failed — see violations"}
              </div>
            </header>

            <SummaryGrid cards={summaryCards} />

            <ChartsPanel byLabel={byLabel} />

            <section className="panel panel-d3">
              <h2>Requests — latency & reliability</h2>
              <div className="section-body">
                <RequestsTable byLabel={byLabel} />
              </div>
            </section>

            <section className="panel panel-d1">
              <h2>SLA & assertion violations</h2>
              <div className="section-body">
                <ViolationsBlock violations={violations} />
              </div>
            </section>

            <section className="panel panel-d2">
              <h2>Recent samples (last {tailSamples.length})</h2>
              <div className="section-body samples-scroll">
                <SamplesTable tailSamples={tailSamples} />
              </div>
            </section>

            <footer>Enterprise performance framework · HTML report</footer>
          </main>
        </div>
        <div id="perf-report-root" />
        <script
          type="application/json"
          id="perf-chart-data"
          dangerouslySetInnerHTML={{ __html: chartDataJson }}
        />
        <script src="report.js" defer />
      </body>
    </html>
  );
}
