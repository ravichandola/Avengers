import type { PerformanceEventBus } from '../events/event-bus.js';
import type { Reporter } from './reporter.js';

export class ReporterOrchestrator {
  constructor(private readonly reporters: Reporter[]) {}

  subscribe(bus: PerformanceEventBus): void {
    bus.on('run:begin', async (p) => {
      await Promise.all(this.reporters.map((r) => r.onRunBegin?.(p) ?? Promise.resolve()));
    });
    bus.on('scenario:begin', async (p) => {
      await Promise.all(this.reporters.map((r) => r.onScenarioBegin?.(p) ?? Promise.resolve()));
    });
    bus.on('metric:sample', async (p) => {
      await Promise.all(
        this.reporters.map((r) =>
          r.onMetric?.({
            label: p.label,
            elapsedMs: p.elapsedMs,
            success: p.success,
            responseCode: p.responseCode,
          }) ?? Promise.resolve(),
        ),
      );
    });
    bus.on('scenario:end', async (p) => {
      await Promise.all(this.reporters.map((r) => r.onScenarioEnd?.(p) ?? Promise.resolve()));
    });
    bus.on('run:end', async (p) => {
      await Promise.all(this.reporters.map((r) => r.onRunEnd?.(p) ?? Promise.resolve()));
    });
  }
}
