/**
 * LLM Provider abstraction layer — clean interface for multiple model backends.
 *
 * Supports OpenAI, Anthropic (Claude), and Google Gemini (native SDK).
 * Auto-detects the right provider from env vars, or you can set LLM_PROVIDER explicitly.
 *
 * Usage:
 *   const provider = resolveProvider();
 *   const text = await provider.complete(system, prompt, { temperature: 0 });
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

// ─── Interface ───────────────────────────────────────────────────────────────

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(
    system: string,
    prompt: string,
    opts: { temperature?: number; maxTokens?: number },
  ): Promise<string>;
}

// ─── OpenAI Provider ─────────────────────────────────────────────────────────

export class OpenAIProvider implements LlmProvider {
  readonly name = 'openai';
  private client: OpenAI | null = null;

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseURL?: string,
  ) {}

  async complete(
    system: string,
    prompt: string,
    opts: { temperature?: number; maxTokens?: number } = {},
  ): Promise<string> {
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: this.model,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 280,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    });
    return response.choices[0]?.message?.content ?? '';
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL });
    }
    return this.client;
  }
}

// ─── Anthropic Provider ──────────────────────────────────────────────────────

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  private client: Anthropic | null = null;

  constructor(
    readonly model: string,
    private readonly apiKey: string,
  ) {}

  async complete(
    system: string,
    prompt: string,
    opts: { temperature?: number; maxTokens?: number } = {},
  ): Promise<string> {
    const client = this.getClient();
    const response = await client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 280,
      temperature: opts.temperature ?? 0,
      system,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    return block?.type === 'text' ? block.text : '';
  }

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({ apiKey: this.apiKey });
    }
    return this.client;
  }
}

// ─── Gemini Provider (native @google/genai SDK) ──────────────────────────────

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI | null = null;

  constructor(
    readonly model: string,
    private readonly apiKey: string,
  ) {}

  async complete(
    system: string,
    prompt: string,
    opts: { temperature?: number; maxTokens?: number } = {},
  ): Promise<string> {
    const client = this.getClient();
    const response = await client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        systemInstruction: system,
        temperature: opts.temperature ?? 0,
        maxOutputTokens: opts.maxTokens ?? 280,
      },
    });
    return response.text ?? '';
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }
    return this.client;
  }
}

// ─── Provider resolution (env-based auto-detect) ─────────────────────────────

export interface ResolveProviderOpts {
  provider?: string;
  model?: string;
  apiKey?: string;
  baseURL?: string;
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.0-flash',
};

/**
 * Resolve which LLM provider to use. Priority:
 *
 *  1. LLM_PROVIDER=openai   → OpenAI
 *  2. LLM_PROVIDER=anthropic → Anthropic
 *  3. LLM_PROVIDER=gemini   → Gemini
 *  4. LLM_MODEL contains "claude"  → Anthropic
 *  5. LLM_MODEL contains "gemini"  → Gemini
 *  6. Only ANTHROPIC_API_KEY set   → Anthropic
 *  7. Only GEMINI_API_KEY set      → Gemini
 *  8. Only OPENAI_API_KEY set      → OpenAI
 *  9. Default: OpenAI
 */
export function resolveProvider(overrides?: ResolveProviderOpts): LlmProvider | null {
  const explicit = (overrides?.provider ?? process.env.LLM_PROVIDER ?? '').trim().toLowerCase();
  const configuredModel = (overrides?.model ?? process.env.LLM_MODEL ?? '').trim();

  const hasOpenAI = !!(overrides?.apiKey ?? process.env.OPENAI_API_KEY);
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;

  let chosen = explicit;

  if (!chosen) {
    if (/claude/i.test(configuredModel)) chosen = 'anthropic';
    else if (/gemini/i.test(configuredModel)) chosen = 'gemini';
    else if (hasAnthropic && !hasOpenAI && !hasGemini) chosen = 'anthropic';
    else if (hasGemini && !hasOpenAI && !hasAnthropic) chosen = 'gemini';
    else if (hasOpenAI && !hasAnthropic && !hasGemini) chosen = 'openai';
    else chosen = 'openai';
  }

  const model = configuredModel || DEFAULT_MODELS[chosen] || DEFAULT_MODELS.openai;

  if (chosen === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    return new AnthropicProvider(model, key);
  }

  if (chosen === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    return new GeminiProvider(model, key);
  }

  // Default: openai
  const key = overrides?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) return null;
  const baseURL = overrides?.baseURL ?? process.env.LLM_BASE_URL;
  return new OpenAIProvider(model, key, baseURL);
}

/**
 * Resolve config metadata (provider name, model, api-key presence)
 * without constructing a client. Used by LlmJudge.resolveConfig for backwards compat.
 */
export function resolveProviderConfig(overrides?: ResolveProviderOpts): {
  provider: string;
  model: string;
  apiKey?: string;
  baseURL?: string;
} {
  const explicit = (overrides?.provider ?? process.env.LLM_PROVIDER ?? '').trim().toLowerCase();
  const configuredModel = (overrides?.model ?? process.env.LLM_MODEL ?? '').trim();

  const hasOpenAI = !!(overrides?.apiKey ?? process.env.OPENAI_API_KEY);
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;

  let chosen = explicit;
  if (!chosen) {
    if (/claude/i.test(configuredModel)) chosen = 'anthropic';
    else if (/gemini/i.test(configuredModel)) chosen = 'gemini';
    else if (hasAnthropic && !hasOpenAI && !hasGemini) chosen = 'anthropic';
    else if (hasGemini && !hasOpenAI && !hasAnthropic) chosen = 'gemini';
    else if (hasOpenAI && !hasAnthropic && !hasGemini) chosen = 'openai';
    else chosen = 'openai';
  }

  const model = configuredModel || DEFAULT_MODELS[chosen] || DEFAULT_MODELS.openai;

  if (chosen === 'anthropic') {
    return { provider: 'anthropic', model, apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (chosen === 'gemini') {
    return { provider: 'gemini', model, apiKey: process.env.GEMINI_API_KEY };
  }
  return {
    provider: 'openai',
    model,
    apiKey: overrides?.apiKey ?? process.env.OPENAI_API_KEY,
    baseURL: overrides?.baseURL ?? process.env.LLM_BASE_URL,
  };
}
