/**
 * Shared evaluation types — used by both rule-based and LLM judge evals.
 *
 * Follows Chrome AI Evals guide:
 *   https://developer.chrome.com/docs/ai/evals/judge-basic
 */

export enum EvalLabel {
  PASS = 'PASS',
  FAIL = 'FAIL',
}

export interface EvalResult {
  label: EvalLabel;
  rationale: string;
}

export interface JudgeFewShotExample {
  input: string;
  result: EvalResult;
}

export interface JudgeRequest {
  criteria: string;
  candidateOutput: string;
  context?: string;
  systemInstruction?: string;
  examples?: JudgeFewShotExample[];
  temperature?: number;
  maxTokens?: number;
}

export interface AlignmentEntry {
  id: string;
  input: Record<string, unknown>;
  candidateOutput: string;
  humanLabel: EvalLabel;
  humanRationale?: string;
  criteria: string;
  context?: string;
  examples?: JudgeFewShotExample[];
}

export interface AlignmentResult {
  id: string;
  humanLabel: EvalLabel;
  judgeLabel: EvalLabel;
  judgeRationale: string;
  aligned: boolean;
}

export interface EvalMetrics {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  aligned?: number;
  alignmentScore?: number;
}

export interface BootstrapResult {
  iterations: number;
  sampleSize: number;
  scores: number[];
  mean: number;
  variance: number;
  stable: boolean;
}

export interface ConsistencyResult {
  id: string;
  runs: EvalLabel[];
  consistent: boolean;
}

export type RuleEvalFn = (candidateOutput: string) => EvalResult;

export interface LlmConfig {
  provider: 'openai' | 'anthropic' | 'gemini' | string;
  model: string;
  apiKey?: string;
  baseURL?: string;
}
