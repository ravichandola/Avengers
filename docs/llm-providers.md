# LLM Providers — Multi-Model Abstraction Layer

The LLM provider layer (`src/eval/llm-provider.ts`) gives the eval framework a clean interface to multiple model backends. You configure one set of env vars and the right SDK is used automatically.

---

## 1. Architecture

```
LlmProvider (interface)
  │
  ├── OpenAIProvider      → openai npm package (chat.completions.create)
  ├── AnthropicProvider   → @anthropic-ai/sdk (messages.create)
  └── GeminiProvider      → @google/genai (models.generateContent)
```

### The interface

```typescript
interface LlmProvider {
  readonly name: string;   // 'openai' | 'anthropic' | 'gemini'
  readonly model: string;  // e.g. 'gpt-4o-mini'
  complete(
    system: string,
    prompt: string,
    opts: { temperature?: number; maxTokens?: number },
  ): Promise<string>;
}
```

Every provider maps `system` + `prompt` to the correct SDK format:

| Provider | System prompt | User prompt |
|----------|--------------|-------------|
| OpenAI | `messages[0].role = 'system'` | `messages[1].role = 'user'` |
| Anthropic | Top-level `system` parameter | `messages[0].role = 'user'` |
| Gemini | `config.systemInstruction` | `contents` string |

---

## 2. Provider auto-detection logic

When you call `resolveProvider()`, it picks the right provider using this priority:

| Priority | Condition | Provider chosen |
|----------|-----------|----------------|
| 1 | `LLM_PROVIDER=openai` | OpenAI |
| 2 | `LLM_PROVIDER=anthropic` | Anthropic |
| 3 | `LLM_PROVIDER=gemini` | Gemini |
| 4 | `LLM_MODEL` contains "claude" | Anthropic |
| 5 | `LLM_MODEL` contains "gemini" | Gemini |
| 6 | Only `ANTHROPIC_API_KEY` is set | Anthropic |
| 7 | Only `GEMINI_API_KEY` is set | Gemini |
| 8 | Only `OPENAI_API_KEY` is set | OpenAI |
| 9 | Default (multiple keys or none) | OpenAI |

**Key insight:** if you only set one API key, the provider is auto-detected. No need to set `LLM_PROVIDER` at all.

---

## 3. Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_PROVIDER` | No | Force provider: `openai`, `anthropic`, or `gemini` |
| `LLM_MODEL` | No | Override model name (e.g. `gpt-4o`, `claude-sonnet-4-20250514`, `gemini-2.0-flash`) |
| `LLM_BASE_URL` | No | Custom base URL — **OpenAI-compatible only** (e.g. Azure, local proxy) |
| `OPENAI_API_KEY` | For OpenAI | OpenAI API key |
| `ANTHROPIC_API_KEY` | For Anthropic | Anthropic API key |
| `GEMINI_API_KEY` | For Gemini | Google AI Studio / Gemini API key |

---

## 4. Default models

| Provider | Default model | When used |
|----------|--------------|-----------|
| OpenAI | `gpt-4o-mini` | `LLM_MODEL` not set, provider resolved to OpenAI |
| Anthropic | `claude-sonnet-4-20250514` | `LLM_MODEL` not set, provider resolved to Anthropic |
| Gemini | `gemini-2.0-flash` | `LLM_MODEL` not set, provider resolved to Gemini |

---

## 5. Example `.env` configurations

### OpenAI (simplest)

```bash
OPENAI_API_KEY=sk-...
# That's it — OpenAI with gpt-4o-mini is the default
```

### Anthropic (Claude)

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
# Auto-detected since only ANTHROPIC_API_KEY is set
```

### Anthropic with explicit model

```bash
LLM_PROVIDER=anthropic
LLM_MODEL=claude-opus-4-20250514
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### Gemini

```bash
GEMINI_API_KEY=AIza...
# Auto-detected since only GEMINI_API_KEY is set
```

### Multiple keys — explicit provider needed

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=anthropic
# Without LLM_PROVIDER, would default to OpenAI
```

### OpenAI-compatible proxy

```bash
OPENAI_API_KEY=sk-custom-...
LLM_BASE_URL=https://my-proxy.example.com/v1
LLM_MODEL=my-custom-model
```

---

## 6. How to add a new provider

Adding a fourth provider (e.g. Mistral, Cohere) takes ~30 lines:

### Step 1: Install the SDK

```bash
npm install @mistralai/mistralai
```

### Step 2: Implement `LlmProvider`

In `src/eval/llm-provider.ts`:

```typescript
import { Mistral } from '@mistralai/mistralai';

export class MistralProvider implements LlmProvider {
  readonly name = 'mistral';
  private client: Mistral | null = null;

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
    const response = await client.chat.complete({
      model: this.model,
      temperature: opts.temperature ?? 0,
      maxTokens: opts.maxTokens ?? 280,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    });
    return response.choices?.[0]?.message?.content ?? '';
  }

  private getClient(): Mistral {
    if (!this.client) {
      this.client = new Mistral({ apiKey: this.apiKey });
    }
    return this.client;
  }
}
```

### Step 3: Add to `resolveProvider()`

Add detection logic in the `resolveProvider()` function:

```typescript
if (chosen === 'mistral') {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) return null;
  return new MistralProvider(model, key);
}
```

### Step 4: Update default models

```typescript
const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.0-flash',
  mistral: 'mistral-large-latest',  // add this
};
```

### Step 5: Add auto-detection (optional)

If model name contains "mistral", auto-select. Add to the detection chain:

```typescript
else if (/mistral/i.test(configuredModel)) chosen = 'mistral';
```

### Step 6: Export from index files

Add exports to `src/eval/index.ts` and `src/index.ts`.

---

## 7. Using providers directly (advanced)

You can use providers outside the eval framework:

```typescript
import { resolveProvider } from '../src/eval';

const provider = resolveProvider();
if (provider) {
  const response = await provider.complete(
    'You are a helpful assistant.',
    'Summarize this in one sentence: ...',
    { temperature: 0.3, maxTokens: 100 },
  );
  console.log(response);
}
```

Or instantiate a specific provider:

```typescript
import { AnthropicProvider } from '../src/eval';

const claude = new AnthropicProvider('claude-sonnet-4-20250514', process.env.ANTHROPIC_API_KEY!);
const text = await claude.complete('system', 'prompt', { temperature: 0 });
```

---

## 8. How judge.ts uses providers

`LlmJudge` internally calls `resolveProvider()` to get the right provider, then delegates:

```typescript
// Inside LlmJudge.evaluate():
const provider = this.getProvider();  // resolveProvider() with config
const raw = await provider.complete(systemInstruction, prompt, {
  temperature: request.temperature ?? 0,
  maxTokens: request.maxTokens ?? 280,
});
return LlmJudge.parseResponse(raw);  // extract JSON { rationale, label }
```

The judge doesn't know or care which model is behind the provider — it just gets text back and parses the JSON.
