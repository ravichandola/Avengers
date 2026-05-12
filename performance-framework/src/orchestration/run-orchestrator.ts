import type { ExecutionSummary, PerformanceEngine, RunContext } from '../engine/performance-engine.js';
import type { ScenarioModel } from '../ast/scenario-model.js';

/**
 * Application service: wires engine port with cross-cutting policies (plugins, gates).
 * Keeps DSL and adapters isolated from presentation (CLI, CI).
 */
export class RunOrchestrator {
  constructor(private readonly engine: PerformanceEngine) {}

  async run(model: ScenarioModel, context: RunContext): Promise<ExecutionSummary> {
    /* Plugin hooks: beforeRun could be registered on a PluginHost */
    return this.engine.execute(model, context);
  }
}
