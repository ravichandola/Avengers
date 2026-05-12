/**
 * Standalone LLM judge — follows Chrome AI Evals "basic judge model" pattern:
 *   - Strict expert persona via system instruction
 *   - Temperature 0 for deterministic output
 *   - Binary PASS / FAIL with rationale-first structured JSON
 *   - Few-shot examples in the grading prompt
 *
 * Can be used standalone or through DriverPage.judgePassFail().
 *
 * Now uses the provider abstraction layer (llm-provider.ts) so that
 * OpenAI, Anthropic, and Gemini all work through one interface.
 *
 * References:
 *   https://developer.chrome.com/docs/ai/evals/judge-basic
 *   https://developer.chrome.com/docs/ai/evals/judge-basic-2
 */

import {
  EvalLabel,
  EvalResult,
  JudgeRequest,
  LlmConfig,
} from './types';
import {
  LlmProvider,
  resolveProvider,
  resolveProviderConfig,
} from './llm-provider';

export type JudgeOutcome =
  | { data: EvalResult; raw: string }
  | { unavailable: string }
  | { parseError: string; raw: string };

/** LLM replies with arbitrary JSON — use with {@link LlmJudge.completeJson} / {@link DriverPage.judgeJson}. */
export type JudgeJsonOutcome<T = unknown> =
  | { data: T; raw: string }
  | { unavailable: string }
  | { parseError: string; raw: string };

const DEFAULT_SYSTEM_INSTRUCTION =
  'You are a precise QA evaluator. ' +
  'Apply the rubric exactly as written — assign PASS when ALL criteria are met, ' +
  'assign FAIL only when at least one criterion is violated. ' +
  'Do not invent extra requirements beyond the rubric. ' +
  'Always formulate your rationale before assigning the final PASS or FAIL label. ' +
  'Return ONLY valid JSON with keys "rationale" and "label".';

export class LlmJudge {
  private provider: LlmProvider | null = null;
  private readonly config: LlmConfig;

  constructor(config?: Partial<LlmConfig>) {
    this.config = LlmJudge.resolveConfig(config);
  }

  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  async evaluate(request: JudgeRequest): Promise<JudgeOutcome> {
    if (!this.config.apiKey) {
      return { unavailable: 'No LLM API key configured for selected provider' };
    }

    const systemInstruction = request.systemInstruction ?? DEFAULT_SYSTEM_INSTRUCTION;
    const prompt = LlmJudge.buildGradingPrompt(request);

    try {
      const provider = this.getProvider();
      const raw = await provider.complete(systemInstruction, prompt, {
        temperature: request.temperature ?? 0,
        maxTokens: request.maxTokens ?? 280,
      });
      return LlmJudge.parseResponse(raw);
    } catch (err) {
      return { unavailable: `LLM judge unavailable: ${err instanceof Error ? err.message : err}` };
    }
  }

  /** Model returns a plain JSON object (any shape — not PASS/FAIL rubric). */
  async completeJson<T = unknown>(
    opts: {
      prompt: string;
      systemInstruction?: string;
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<JudgeJsonOutcome<T>> {
    if (!this.config.apiKey) {
      return { unavailable: 'No LLM API key configured for selected provider' };
    }

    const systemInstruction =
      opts.systemInstruction ??
      'Reply with ONLY a single JSON object. No markdown fences, no prose outside that object.';

    try {
      const provider = this.getProvider();
      const raw = await provider.complete(systemInstruction, opts.prompt, {
        temperature: opts.temperature ?? 0,
        maxTokens: opts.maxTokens ?? 280,
      });
      return LlmJudge.parseJsonObject<T>(raw);
    } catch (err) {
      return { unavailable: `LLM judge unavailable: ${err instanceof Error ? err.message : err}` };
    }
  }

  private getProvider(): LlmProvider {
    if (!this.provider) {
      const resolved = resolveProvider({
        provider: this.config.provider,
        model: this.config.model,
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
      });
      if (!resolved) {
        throw new Error('No LLM provider could be resolved — check API keys');
      }
      this.provider = resolved;
    }
    return this.provider;
  }

  static buildGradingPrompt(request: JudgeRequest): string {
    const parts: string[] = [];

    parts.push('Evaluate the candidate output using ONLY the criteria below.');
    parts.push('');

    if (request.context?.trim()) {
      parts.push('Context:');
      parts.push(request.context.trim());
      parts.push('');
    }

    parts.push('Criteria / Rubric:');
    parts.push(request.criteria.trim());
    parts.push('');

    parts.push('Candidate output:');
    parts.push(request.candidateOutput.trim());
    parts.push('');

    if (request.examples?.length) {
      parts.push('Few-shot examples:');
      for (const [i, ex] of request.examples.entries()) {
        parts.push(`Example ${i + 1} input:`);
        parts.push(ex.input.trim());
        parts.push('Example result:');
        parts.push(JSON.stringify({ rationale: ex.result.rationale, label: ex.result.label }, null, 2));
        parts.push('');
      }
    }

    parts.push('Return only valid JSON in this exact schema:');
    parts.push('{');
    parts.push('  "rationale": "brief explanation",');
    parts.push('  "label": "PASS or FAIL"');
    parts.push('}');

    return parts.join('\n');
  }

  static parseJsonObject<T>(raw: string): JudgeJsonOutcome<T> {
    const text = raw.replace(/^\s*```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/im, '').trim();

    const tryParse = (s: string): T | undefined => {
      try {
        return JSON.parse(s) as T;
      } catch {
        return undefined;
      }
    };

    const direct = tryParse(text);
    if (direct !== undefined) {
      return { data: direct, raw };
    }

    const slice = LlmJudge.extractBalancedBraceObject(text);
    if (slice === null) {
      return { parseError: 'No JSON object found in model response', raw };
    }

    const parsed = tryParse(slice);
    if (parsed !== undefined) {
      return { data: parsed, raw };
    }

    return { parseError: 'Failed to parse JSON in model response', raw };
  }

  static extractBalancedBraceObject(source: string): string | null {
    const start = source.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
    return null;
  }

  static parseResponse(raw: string): JudgeOutcome {
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) {
      return { parseError: 'No JSON object found in model response', raw };
    }

    try {
      const parsed = JSON.parse(match[0]);
      if (parsed.label !== EvalLabel.PASS && parsed.label !== EvalLabel.FAIL) {
        return { parseError: 'label is not PASS or FAIL', raw };
      }
      return {
        data: { label: parsed.label, rationale: parsed.rationale ?? '' },
        raw,
      };
    } catch {
      return { parseError: 'Failed to parse JSON in model response', raw };
    }
  }

  static resolveConfig(overrides?: Partial<LlmConfig>): LlmConfig {
    const resolved = resolveProviderConfig({
      provider: overrides?.provider,
      model: overrides?.model,
      apiKey: overrides?.apiKey,
      baseURL: overrides?.baseURL,
    });
    return {
      provider: resolved.provider,
      model: resolved.model,
      apiKey: resolved.apiKey,
      baseURL: resolved.baseURL,
    };
  }
}
