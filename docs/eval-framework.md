# Eval Framework — LLM-as-Judge & Rule-Based Evaluation

This guide covers the complete evaluation system built into Desktop Agent, following the [Chrome AI Evals](https://developer.chrome.com/docs/ai/evals/judge-basic) pattern. The eval framework lives in `src/eval/` and is available from any Page Object Model (POM) via `DriverPage`.

---

## 1. What is LLM-as-judge and why binary PASS/FAIL?

**LLM-as-judge** uses a language model to evaluate whether a candidate output meets specific criteria — like a QA grader reviewing test results. Instead of fuzzy scores, we use **binary PASS/FAIL** because:

- **Deterministic thresholds** — no ambiguity about "good enough"
- **Alignment-testable** — you can compare judge labels to human labels
- **Self-consistency** — with temperature 0, identical inputs should always produce the same label
- **Composable** — combine with rule-based evals for hybrid pipelines

The pattern comes from [Chrome AI Evals Guide (Part 1)](https://developer.chrome.com/docs/ai/evals/judge-basic) and [Part 2](https://developer.chrome.com/docs/ai/evals/judge-basic-2).

---

## 2. Module structure

```
src/eval/
├── types.ts          # Shared types: EvalLabel, EvalResult, JudgeRequest, AlignmentEntry, etc.
├── llm-provider.ts   # LlmProvider interface + OpenAI / Anthropic / Gemini implementations
├── judge.ts          # LlmJudge class — builds prompts, calls provider, parses JSON response
├── rule-based.ts     # Deterministic evaluators (JSON format, word count, domain, pattern, etc.)
├── eval-runner.ts    # EvalRunner — alignment testing, bootstrap stress, self-consistency
└── index.ts          # Re-exports everything
```

### Who calls whom

```
DriverPage (src/pom/driver-page.ts)
  └── LlmJudge (src/eval/judge.ts)
        └── LlmProvider (src/eval/llm-provider.ts)
              ├── OpenAIProvider   → openai npm package
              ├── AnthropicProvider → @anthropic-ai/sdk
              └── GeminiProvider   → @google/genai

DriverPage
  └── EvalRunner (src/eval/eval-runner.ts)
        └── LlmJudge (reuses the same judge instance)
```

---

## 3. LLM Provider layer — switching models via `.env`

The provider layer (`src/eval/llm-provider.ts`) abstracts away SDK differences. You just set env vars:

```bash
# Use Claude
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Use Gemini
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza...

# Use OpenAI (default)
OPENAI_API_KEY=sk-...
```

Auto-detection resolves the provider when `LLM_PROVIDER` is not set — see [llm-providers.md](./llm-providers.md) for the full priority table.

**Default models:**

| Provider | Default model | Env for API key |
|----------|--------------|-----------------|
| OpenAI | `gpt-4o-mini` | `OPENAI_API_KEY` |
| Anthropic | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` |
| Gemini | `gemini-2.0-flash` | `GEMINI_API_KEY` |

Override the model with `LLM_MODEL`:

```bash
LLM_MODEL=gpt-4o
LLM_MODEL=claude-opus-4-20250514
LLM_MODEL=gemini-2.0-flash
```

---

## 4. Rule-based evals

Rule-based evals are **deterministic** — no LLM, no API key needed. They live in `src/eval/rule-based.ts`.

### Available evaluators

| Function | What it checks |
|----------|---------------|
| `evalJsonFormat(requiredKeys)` | Valid JSON with all required keys non-empty |
| `evalMaxWords(field, maxWords)` | A JSON field doesn't exceed word count |
| `evalPattern(field, regex, desc)` | A JSON field matches a regex pattern |
| `evalDomain(domain)` | URL field belongs to expected domain |
| `evalNonEmpty(field)` | A JSON field is non-empty |

### Composing rule-based evals

Use `composeRuleEvals()` to chain evaluators — fails on first FAIL:

```typescript
import { evalDomain, evalNonEmpty, composeRuleEvals } from '../src/eval';

const landingPageEval = composeRuleEvals(
  evalDomain('netflix.com'),
  evalNonEmpty('title'),
);

const candidate = JSON.stringify({ url: 'https://www.netflix.com', title: 'Netflix' });
const result = landingPageEval(candidate);
// result.label === 'PASS'
```

Use `runAllRuleEvals()` to run all evaluators without short-circuiting:

```typescript
import { evalDomain, evalNonEmpty, runAllRuleEvals } from '../src/eval';

const results = runAllRuleEvals(candidate, [
  evalDomain('netflix.com'),
  evalNonEmpty('title'),
]);
// results: EvalResult[] — one per evaluator
```

---

## 5. LLM Judge

### JudgeRequest shape

```typescript
interface JudgeRequest {
  criteria: string;           // Rubric — when to PASS, when to FAIL
  candidateOutput: string;    // The actual output being evaluated
  context?: string;           // Extra context for the judge
  systemInstruction?: string; // Override the default system prompt
  examples?: JudgeFewShotExample[];  // Few-shot examples
  temperature?: number;       // Default: 0
  maxTokens?: number;         // Default: 280
}
```

### Writing good criteria/rubric

The criteria string is the most important part. Be explicit about what constitutes PASS and FAIL:

```typescript
const criteria = `
You are evaluating whether a browser landing page loaded correctly.

PASS if BOTH conditions are met:
  1. The URL hostname contains the expected domain (netflix.com).
     Subpaths, country variants (/in, /browse) are fine.
  2. The page title is non-empty and reasonably related to the site.

FAIL if ANY condition is violated:
  - URL hostname does not contain the expected domain.
  - Title is empty or completely unrelated to the site.
`;
```

### Few-shot examples

Few-shot examples ground the judge's behavior with concrete input/output pairs:

```typescript
const examples: JudgeFewShotExample[] = [
  {
    input: '{"url":"https://www.netflix.com","title":"Netflix"}',
    result: {
      rationale: 'URL is on netflix.com and title says Netflix — both conditions met.',
      label: EvalLabel.PASS,
    },
  },
  {
    input: '{"url":"https://www.google.com","title":"Google"}',
    result: {
      rationale: 'URL is google.com, not the expected netflix.com domain.',
      label: EvalLabel.FAIL,
    },
  },
];
```

### Using the judge standalone

```typescript
import { LlmJudge, EvalLabel } from '../src/eval';

const judge = new LlmJudge();
const outcome = await judge.evaluate({
  criteria: 'PASS if the output is valid JSON with a "name" key.',
  candidateOutput: '{"name": "Alice"}',
});

if ('data' in outcome) {
  console.log(outcome.data.label);     // 'PASS'
  console.log(outcome.data.rationale); // 'Valid JSON with name key present.'
}
```

### Using the judge from a POM (DriverPage)

Every POM that extends `DriverPage` inherits `judgePassFail()`:

```typescript
import { DriverPage } from '../src/pom/driver-page';

class NetflixPage extends DriverPage {
  async judgeLandingQuality(): Promise<{ passed: boolean; rationale: string }> {
    const url = await this.getURL();
    const title = await this.getTitle();
    const candidate = JSON.stringify({ url, title });

    const outcome = await this.judgePassFail({
      criteria: '...your rubric...',
      candidateOutput: candidate,
      examples: [/* few-shot examples */],
    });

    if ('data' in outcome) {
      return { passed: outcome.data.label === EvalLabel.PASS, rationale: outcome.data.rationale };
    }
    return { passed: false, rationale: 'unavailable' in outcome ? outcome.unavailable : outcome.parseError };
  }
}
```

---

## 6. EvalRunner — alignment, bootstrap, self-consistency

`EvalRunner` wraps `LlmJudge` for batch evaluation workflows.

### Alignment testing

Compare judge labels to human-labeled ground truth:

```typescript
import { LlmJudge, EvalRunner } from '../src/eval';
import type { AlignmentEntry } from '../src/eval';

const judge = new LlmJudge();
const runner = new EvalRunner(judge);

const dataset: AlignmentEntry[] = JSON.parse(fs.readFileSync('alignment-dataset.json', 'utf8'));
const { results, metrics } = await runner.runAlignment(dataset);

console.log(`Alignment score: ${metrics.alignmentScore}%`);
// Each result: { id, humanLabel, judgeLabel, judgeRationale, aligned }
```

### Bootstrap stress test

Resample the dataset with replacement N times to check stability:

```typescript
const bootstrap = await runner.runBootstrap(dataset, {
  iterations: 10,
  sampleSize: 30,
  varianceThreshold: 5,
});
console.log(`Mean: ${bootstrap.mean}, Variance: ${bootstrap.variance}`);
console.log(`Stable: ${bootstrap.stable}`);
```

### Self-consistency

Run the same entries multiple times — with temperature 0, labels should be identical:

```typescript
const { results, allConsistent } = await runner.runSelfConsistency(dataset.slice(0, 3), 3);
console.log(`All consistent: ${allConsistent}`);
```

### Rule-based batch

Run deterministic evals across many candidates:

```typescript
const { results, metrics } = EvalRunner.runRuleBatch(
  ['{"url":"https://netflix.com","title":"Netflix"}', '{"url":"https://bad.com","title":""}'],
  composeRuleEvals(evalDomain('netflix.com'), evalNonEmpty('title')),
);
console.log(`Pass rate: ${metrics.passRate}%`);
```

---

## 7. How DriverPage exposes the eval API to all POMs

`DriverPage` (`src/pom/driver-page.ts`) is the shared base for browser, desktop, and mobile page objects. It provides:

| Method | What it does |
|--------|-------------|
| `judgePassFail(request)` | Single binary verdict via LLM judge |
| `runAlignment(dataset)` | Alignment dataset test |
| `runBootstrap(dataset, opts)` | Bootstrap stress test |
| `runConsistency(entries, runs)` | Self-consistency check |
| `runRuleBatch(candidates, evalFn)` | Deterministic batch eval |
| `isLLMJudgeConfigured()` | Check if an API key is set |

Any POM that extends `DriverPage` (or `DesktopPage`, `MobileScreen`, etc.) automatically gets all of these. Page-specific POMs only need to provide criteria and candidate data.

---

## 8. Alignment dataset format

An alignment dataset is a JSON array of `AlignmentEntry` objects:

```json
[
  {
    "id": "landing-pass-001",
    "input": { "site": "netflix.com" },
    "candidateOutput": "{\"url\":\"https://www.netflix.com/in\",\"title\":\"Netflix India\"}",
    "humanLabel": "PASS",
    "humanRationale": "URL belongs to netflix.com and title is non-empty.",
    "criteria": "PASS if URL contains netflix.com AND title is non-empty...",
    "context": "Browser smoke validation — landing page quality check.",
    "examples": [
      {
        "input": "{\"url\":\"https://www.netflix.com\",\"title\":\"Netflix\"}",
        "result": { "rationale": "Both conditions met.", "label": "PASS" }
      },
      {
        "input": "{\"url\":\"https://www.google.com\",\"title\":\"Google\"}",
        "result": { "rationale": "Wrong domain.", "label": "FAIL" }
      }
    ]
  }
]
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier for the entry |
| `input` | object | yes | Original input (for traceability) |
| `candidateOutput` | string | yes | The output being judged |
| `humanLabel` | `"PASS"` / `"FAIL"` | yes | Ground truth label |
| `humanRationale` | string | no | Why the human assigned that label |
| `criteria` | string | yes | The rubric / criteria |
| `context` | string | no | Extra context for the judge |
| `examples` | array | no | Few-shot examples |

Sample dataset: `scripts/examples/alignment-dataset.sample.json`

---

## 9. How to write a new eval (step by step)

### Step 1: Decide rule-based or LLM

| Use rule-based when... | Use LLM judge when... |
|------------------------|----------------------|
| Check is deterministic (regex, JSON schema, domain) | Check requires understanding/interpretation |
| No API key needed | Criteria are semantic, not structural |
| Fast, free, no rate limits | Flexible rubric, few-shot grounding |

### Step 2: Write the criteria

```typescript
const criteria = `
PASS if the summary accurately captures the main points and is under 100 words.
FAIL if the summary misses key points, contains fabricated info, or exceeds 100 words.
`;
```

### Step 3: Create few-shot examples (for LLM judge)

At least 2 examples — one PASS, one FAIL. Include the rationale.

### Step 4: Build the eval in your POM or test

```typescript
// In a POM method:
async judgeSummaryQuality(summary: string): Promise<JudgeOutcome> {
  return this.judgePassFail({
    criteria,
    candidateOutput: summary,
    examples: [/* ... */],
  });
}
```

### Step 5: Build an alignment dataset

Create 10-50 human-labeled entries covering edge cases. Save as JSON.

### Step 6: Run alignment and consistency tests

```typescript
test('alignment: judge matches human labels', async () => {
  const dataset = JSON.parse(fs.readFileSync('my-dataset.json', 'utf8'));
  const judge = new LlmJudge();
  const runner = new EvalRunner(judge);
  const { metrics } = await runner.runAlignment(dataset);
  expect(metrics.alignmentScore!).toBeGreaterThanOrEqual(80);
});
```

---

## 10. How to test evals

### Run the eval test suite

```bash
npx playwright test tests/browser/evals.browser.spec.ts --project=chrome
```

This runs:
1. Rule-based eval (no API key needed)
2. LLM judge single verdict (needs API key)
3. Alignment dataset test (needs API key + dataset file)
4. Self-consistency test (needs API key + dataset file)

Tests auto-skip when API keys or dataset files are missing.

### Unit testing a rule-based eval

```typescript
import { evalDomain, EvalLabel } from '../src/eval';

const check = evalDomain('github.com');
expect(check('{"url":"https://github.com/foo"}').label).toBe(EvalLabel.PASS);
expect(check('{"url":"https://evil.com"}').label).toBe(EvalLabel.FAIL);
```

---

## 11. Environment variables reference

| Variable | Purpose | Example |
|----------|---------|---------|
| `LLM_PROVIDER` | Force a provider (`openai`, `anthropic`, `gemini`) | `anthropic` |
| `LLM_MODEL` | Override the model name | `claude-sonnet-4-20250514` |
| `LLM_BASE_URL` | Custom base URL (OpenAI-compatible only) | `https://my-proxy.com/v1` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `ANTHROPIC_API_KEY` | Anthropic API key | `sk-ant-...` |
| `GEMINI_API_KEY` | Google Gemini API key | `AIza...` |

---

## 12. Reference links

- [Chrome AI Evals — Basic Judge (Part 1)](https://developer.chrome.com/docs/ai/evals/judge-basic)
- [Chrome AI Evals — Basic Judge (Part 2)](https://developer.chrome.com/docs/ai/evals/judge-basic-2)
- [Chrome AI Evals — Rule-Based](https://developer.chrome.com/docs/ai/evals/rule-based)
- [LLM Providers guide](./llm-providers.md) — how to switch between OpenAI, Anthropic, Gemini
