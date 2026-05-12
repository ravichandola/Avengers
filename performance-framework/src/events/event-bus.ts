import { EventEmitter } from 'eventemitter3';
import type { Assertion } from '../domain/load-profile.js';

export type PerformanceEventMap = {
  'run:begin': { runId: string; scenarioName: string };
  'run:end': { runId: string; passed: boolean; violations: string[] };
  'scenario:begin': { runId: string; scenarioId: string };
  'scenario:end': { runId: string; scenarioId: string };
  'metric:sample': {
    runId: string;
    label: string;
    elapsedMs: number;
    success: boolean;
    responseCode: string;
    threadName: string;
  };
  'metric:aggregate': {
    runId: string;
    label: string;
    throughput: number;
    errorRate: number;
    p50: number;
    p95: number;
    p99: number;
  };
  'log': { level: 'info' | 'warn' | 'error'; message: string; data?: unknown };
  'sla:violation': { runId: string; rule: string; detail: string };
};

export type PerformanceEventName = keyof PerformanceEventMap;

export class PerformanceEventBus {
  private readonly bus = new EventEmitter<PerformanceEventMap>();

  on<K extends PerformanceEventName>(name: K, fn: (payload: PerformanceEventMap[K]) => void): void {
    this.bus.on(name, fn as Parameters<EventEmitter<PerformanceEventMap>['on']>[1]);
  }

  emitTyped<K extends PerformanceEventName>(name: K, payload: PerformanceEventMap[K]): boolean {
    return this.bus.emit(name, payload);
  }

  /** Await every listener (sync or Promise-returning). Use for terminal events so reporters finish I/O before the run returns. */
  async emitTypedAsync<K extends PerformanceEventName>(
    name: K,
    payload: PerformanceEventMap[K],
  ): Promise<void> {
    const listeners = this.bus.listeners(name);
    await Promise.all(listeners.map((fn) => Promise.resolve(fn(payload))));
  }
}

export function evaluateAssertions(
  assertions: Assertion[],
  samples: Array<{ elapsedMs: number; success: boolean; responseCode: string }>,
): string[] {
  const violations: string[] = [];
  for (const a of assertions) {
    if (a.kind === 'duration_p95') {
      const sorted = samples.map((s) => s.elapsedMs).sort((x, y) => x - y);
      const idx = Math.floor(0.95 * (sorted.length - 1));
      const p95 = sorted[idx] ?? 0;
      if (p95 > a.maxMs) violations.push(`p95 ${p95}ms exceeds ${a.maxMs}ms`);
    }
    if (a.kind === 'duration_p99') {
      const sorted = samples.map((s) => s.elapsedMs).sort((x, y) => x - y);
      const idx = Math.floor(0.99 * (sorted.length - 1));
      const p99 = sorted[idx] ?? 0;
      if (p99 > a.maxMs) violations.push(`p99 ${p99}ms exceeds ${a.maxMs}ms`);
    }
    if (a.kind === 'error_rate') {
      const fail = samples.filter((s) => !s.success).length;
      const pct = samples.length ? (fail / samples.length) * 100 : 0;
      if (pct > a.maxPercent) violations.push(`error rate ${pct.toFixed(2)}% exceeds ${a.maxPercent}%`);
    }
    if (a.kind === 'status') {
      const bad = samples.filter((s) => s.responseCode !== String(a.value));
      if (bad.length > 0) violations.push(`expected status ${a.value} — had failures`);
    }
  }
  return violations;
}
