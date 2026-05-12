import type { Reporter } from '../reporting/reporter.js';
import type { PerformanceEngine } from '../engine/performance-engine.js';

export interface PerformancePlugin {
  readonly name: string;
  /** Optional additional reporters (e.g. InfluxDB line protocol sink) */
  reporters?(): Reporter[];
  /** Future: wrap or substitute engine */
  adaptEngine?(engine: PerformanceEngine): PerformanceEngine;
}

export class PluginHost {
  private readonly plugins: PerformancePlugin[] = [];

  register(plugin: PerformancePlugin): void {
    this.plugins.push(plugin);
  }

  allReporters(): Reporter[] {
    return this.plugins.flatMap((p) => p.reporters?.() ?? []);
  }
}
