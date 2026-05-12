import type { Assertion, HttpMethod, LoadProfile, ThinkTime } from '../domain/load-profile.js';
import type { SlaRule } from '../domain/sla.js';

export type ScenarioVariableSource =
  | { type: 'environment'; key: string }
  | { type: 'csv'; column: string }
  | { type: 'extract_json'; path: string; fromRequestId: string };

export interface ScenarioVariable {
  name: string;
  source: ScenarioVariableSource;
}

export type HookPhase = 'beforeRun' | 'afterRun' | 'beforeEachIteration' | 'afterEachIteration';

export interface HookDefinition {
  phase: HookPhase;
  /** Adapter maps to setup/teardown thread or JSR223 — opaque at DSL level */
  description: string;
  scriptPath?: string;
}

export interface RequestBody {
  json?: unknown;
  raw?: string;
  graphql?: { query: string; variables?: Record<string, unknown> };
}

export interface RequestDefinition {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  body?: RequestBody;
  assertions: Assertion[];
  thinkTime?: ThinkTime;
  /** Mark for response extraction / correlation */
  capture?: Array<{ name: string; jsonPath?: string; regex?: string; headerName?: string }>;
}

export type StepDefinition =
  | { type: 'request'; request: RequestDefinition }
  | { type: 'parallel'; steps: StepDefinition[] }
  | { type: 'sequence'; steps: StepDefinition[] }
  | {
      type: 'transaction';
      name: string;
      steps: StepDefinition[];
    }
  | { type: 'websocket'; name: string; url: string; messages: Array<{ text: string; thinkAfterMs?: number }> };

/**
 * Immutable scenario AST — DSL builders produce this; engines never parse TS.
 */
export interface ScenarioModel {
  id: string;
  name: string;
  load: LoadProfile;
  variables: ScenarioVariable[];
  steps: StepDefinition[];
  hooks: HookDefinition[];
  sla: SlaRule[];
  tags: string[];
}
