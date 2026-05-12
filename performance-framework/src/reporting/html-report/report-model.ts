export type MetricRow = {
  label: string;
  elapsedMs: number;
  success: boolean;
  responseCode: string;
};

export type LabelStats = {
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

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(p * (sorted.length - 1));
  return sorted[idx] ?? 0;
}

export function buildLabelStats(samples: MetricRow[]): LabelStats[] {
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

export function formatCodes(codes: Record<string, number>): string {
  return Object.entries(codes)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c}: ${n}`)
    .join(' · ');
}

/** Serializable snapshot passed into the React report tree. */
export type ReportViewModel = {
  scenarioName: string;
  scenarioId: string;
  shortScenarioId: string;
  tags: string[];
  runId: string;
  passed: boolean;
  endedAt: string;
  durationSec: string;
  violations: string[];
  summaryCards: Array<{ title: string; value: string; sub: string }>;
  byLabel: LabelStats[];
  tailSamples: MetricRow[];
  chartDataJson: string;
};
