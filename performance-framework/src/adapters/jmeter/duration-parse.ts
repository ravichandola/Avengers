/**
 * Parses human durations into seconds for engine adapters.
 * Supports: 30s, 5m, 1h, 1h30m (optional compose — keep simple: single unit)
 */
export function durationToSeconds(input: string | undefined, fallback: number): number {
  if (!input) return fallback;
  const m = String(input).trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/i);
  if (!m) return fallback;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  if (u === 'ms') return Math.max(0.001, n / 1000);
  if (u === 's') return n;
  if (u === 'm') return n * 60;
  if (u === 'h') return n * 3600;
  return fallback;
}
