import type { ScenarioModel } from '../ast/scenario-model.js';

export interface RunArtifacts {
  workingDirectory: string;
  /** Absolute path to generated low-level plan (JMX, k6 script, etc.) — engine-specific */
  primaryArtifactPath: string;
  resultsPath: string;
}

export interface RunContext {
  runId: string;
  environment: string;
  artifacts: RunArtifacts;
  /** Extra env vars merged into process / worker */
  env: NodeJS.ProcessEnv;
}

export interface ExecutionSummary {
  runId: string;
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  /** Pass/fail from SLA + assertions aggregate */
  violations: string[];
}

/**
 * Port: framework depends on this abstraction — never on JMeter, k6, or Gatling.
 * Adapter implements compile + execute + streaming metrics.
 */
export interface PerformanceEngine {
  readonly id: string;

  compile(model: ScenarioModel, context: RunContext): Promise<void>;

  execute(model: ScenarioModel, context: RunContext): Promise<ExecutionSummary>;
}
