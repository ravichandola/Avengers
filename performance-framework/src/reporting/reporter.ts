export interface Reporter {
  onRunBegin?(payload: { runId: string; scenarioName: string }): Promise<void>;
  onScenarioBegin?(payload: { runId: string; scenarioId: string }): Promise<void>;
  onMetric?(payload: {
    label: string;
    elapsedMs: number;
    success: boolean;
    responseCode: string;
  }): Promise<void>;
  onScenarioEnd?(payload: { runId: string; scenarioId: string }): Promise<void>;
  onRunEnd?(payload: { runId: string; passed: boolean; violations: string[] }): Promise<void>;
}
