# Getting started

This guide gets you from zero to a passing test, and explains how the pieces fit together.

## Prerequisites

- **Node.js** 18+ recommended  
- **npm** (or pnpm/yarn if you adapt commands)

For **browser** tests only, you also need Playwright browsers:

```bash
npx playwright install
```

For **desktop** tests (macOS): enable Accessibility in System Settings → Privacy & Security → Accessibility for your terminal/IDE.

For **desktop** screenshots: enable Screen Recording permission as well.

For **mobile** tests: Appium server + `webdriverio` installed. See [mobile-ios.md](./mobile-ios.md) / [mobile-android.md](./mobile-android.md).

For **LLM eval features**: at least one API key — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`. See [llm-providers.md](./llm-providers.md).

## Install

From the project root:

```bash
npm install
```

## Environment setup

The framework uses a **layered .env system** — common settings `.env` me, platform-specific apni file me:

| File | Scope | What goes here |
|------|-------|----------------|
| `.env` | **Common** (always loaded first) | `BASE_URL`, `HEADLESS`, `TIMEOUT`, `RETRIES`, `LOG_LEVEL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` |
| `browser.env` | Browser tests | `BROWSER_CHANNEL`, `BROWSER_BASE_URL`, `BROWSER_VIEWPORT_*`, `BROWSER_SLOW_MO` |
| `api.env` | API tests | `API_BASE_URL`, `API_TIMEOUT`, `API_AUTH_*` |
| `desktop.env` | Desktop tests | `DESKTOP_APP_NAME`, `DESKTOP_APP_PATH`, `DESKTOP_USE_VISION` |
| `mobile.env` | Mobile tests | `MOBILE_DEVICE_NAME`, `MOBILE_PLATFORM_VERSION`, `APPIUM_*`, `MOBILE_BUNDLE_ID` |

**Precedence:** platform-specific file values override `.env` values. Shell-provided variables (e.g. `DESKTOP_APP_NAME=Notes npx playwright test`) always win over file values.

All env files are gitignored — never commit secrets.

### Quick setup

```bash
# Create your .env with at minimum:
cat > .env << 'EOF'
HEADLESS=true
TIMEOUT=60000
BASE_URL=https://example.com
BROWSER_BASE_URL=https://example.com
EOF

# For LLM eval features, add one of:
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GEMINI_API_KEY=AIza...

# For LLM provider control (optional):
# LLM_PROVIDER=anthropic
# LLM_MODEL=claude-sonnet-4-20250514
```

## How runs are routed

1. You run **`npx playwright test`** (or an `npm run test:*` script).
2. `playwright.config.ts` loads **all `.env` files** via `env-loader`.
3. Each project has **`testMatch`** (e.g. only `*.browser.spec.ts`).
4. Fixtures **auto-launch** the right driver using project metadata — **no `launch()` call needed in tests**.

So: **filename + project name** decide which engine runs, and the framework handles launch.

## Running tests by platform

```bash
# Browser
npx playwright test --project=chrome
npx playwright test --project=firefox
npx playwright test --project=webkit
npm run test:all-browsers     # all three at once

# Desktop (macOS)
npx playwright test --project=desktop-macos
# or with a specific app:
DESKTOP_APP_NAME=Notes npx playwright test --project=desktop-macos

# Mobile (iOS)
npx playwright test --project=mobile-ios

# API
npx playwright test --project=api

# Everything
npm test
```

## Write your first browser test

Create `tests/browser/my-first.browser.spec.ts`:

```typescript
import { test, expect } from '../../src/fixtures';

test('open example.com', async ({ app }) => {
  await app.navigate('https://example.com');
  const title = await app.getTitle();
  expect(title).toContain('Example');
});
```

Run it:

```bash
npx playwright test --project=chrome tests/browser/my-first.browser.spec.ts
```

## Write your first eval test

Evals don't need a browser — they test LLM judge quality. Create `tests/browser/my-eval.browser.spec.ts`:

```typescript
import { test, expect } from '../../src/fixtures';
import { LlmJudge, EvalLabel } from '../../src/eval';

test('llm judge says valid JSON passes', async () => {
  test.skip(!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY,
    'No LLM API key configured');

  const judge = new LlmJudge();
  const outcome = await judge.evaluate({
    criteria: 'PASS if the output is valid JSON with a "name" key. FAIL otherwise.',
    candidateOutput: '{"name": "Alice", "age": 30}',
  });

  expect('data' in outcome).toBe(true);
  if ('data' in outcome) {
    expect(outcome.data.label).toBe(EvalLabel.PASS);
  }
});
```

## Test file naming conventions

Playwright **projects** filter tests by filename pattern:

| Pattern | Example | Projects |
|---------|---------|----------|
| `*.browser.spec.ts` | `login.browser.spec.ts` | `chrome`, `firefox`, `webkit` |
| `*.desktop.spec.ts` | `notepad.desktop.spec.ts` | `desktop-macos`, `desktop-windows` |
| `*.mobile.spec.ts` | `login.mobile.spec.ts` | `mobile-ios`, `mobile-android` |
| `*.api.spec.ts` | `users.api.spec.ts` | `api` |

Put files under `tests/` (see `playwright.config.ts` → `testDir`).

## Unified API snapshot (`IDriver`)

Most UI automation goes through **`app`** — already launched and ready:

| Method | Typical use |
|--------|-------------|
| `navigate(url)` | Go to URL (browser) |
| `click(selector)` | Click element |
| `fill(selector, value)` | Type into field |
| `waitFor(selector)` | Wait for element |
| `getURL()` / `getTitle()` | Assertions |
| `screenshot()` | Capture screen |
| `launch(options)` | **Only for overrides** (auth profile, etc.) |
| `close()` | Cleanup (fixture handles this automatically) |

## Fixtures cheat sheet

| Fixture | When to use |
|---------|-------------|
| **`app`** | Always for unified UI/API-shaped flows (`IDriver`) — **auto-launched** |
| **`pages`** | Browser-only multi-tab helpers (`PageManager`) |
| **`api`** | HTTP tests (`get`/`post`/…) — **auto-configured** from `api.env` |
| **`auth`** | `AuthManager` — save/load `.auth/*.json` profiles |
| **`checkpoint`** | Per-test checkpoint manager for resume experiments |

## Useful npm scripts

| Script | What it runs |
|--------|-------------|
| `npm test` | All Playwright projects |
| `npm run test:chrome` | Browser tests (Chrome) |
| `npm run test:all-browsers` | Chrome + Firefox + WebKit |
| `npm run test:desktop` | Desktop macOS |
| `npm run test:mobile` | Mobile iOS |
| `npm run test:api` | API project |
| `npm run build` | TypeScript compile to `dist/` |
| `npm run pom:gen` | Auto-generate POM from live scan |

## Next steps

- **Eval framework:** [eval-framework.md](./eval-framework.md) — LLM-as-judge, rule-based evals, alignment testing
- **LLM providers:** [llm-providers.md](./llm-providers.md) — OpenAI, Anthropic, Gemini setup
- **POM generator:** [pom-generator.md](./pom-generator.md) — auto-generate page objects
- **MCP bridge:** [desktop-bridge-mcp.md](./desktop-bridge-mcp.md) — Cursor integration for desktop automation
- **Browsers:** [browser-automation.md](./browser-automation.md)
- **Desktop:** [desktop-macos.md](./desktop-macos.md) / [desktop-windows.md](./desktop-windows.md)
- **Mobile:** [mobile-ios.md](./mobile-ios.md) / [mobile-android.md](./mobile-android.md)
- **HTTP:** [api-testing.md](./api-testing.md)
- **Auth & resume:** [advanced-auth-and-checkpoints.md](./advanced-auth-and-checkpoints.md)
- **Architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md) — full system design and porting guide
