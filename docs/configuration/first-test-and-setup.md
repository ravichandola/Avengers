# First test and setup

This guide gets you from **zero to a passing test** and explains how runs are routed to the right driver.

**Where to read next**

- Shared ideas (**`IDriver`**, fixtures, env): [**Fixtures & `IDriver`**](../common/fixtures-and-idriver.md)  
- Full system map: [**Architecture overview**](../architecture/overview.md)  
- All doc sections: [**Documentation home**](../README.md)  
- Env details: [**Environment variables**](./environment.md)  

## Prerequisites

- **Node.js** 18+ recommended  
- **npm** (or pnpm/yarn if you adapt commands)

For **browser** tests only, you also need Playwright browsers:

```bash
npx playwright install
```

For **desktop** tests (macOS): enable Accessibility in System Settings → Privacy & Security → Accessibility for your terminal/IDE.

For **desktop** screenshots: enable Screen Recording permission as well.

For **mobile** tests: Appium server + `webdriverio` installed. See [iOS](../mobile/ios.md) / [Android](../mobile/android.md).

For **LLM eval features**: at least one API key — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`. See [LLM providers](../common/llm-providers.md).

## Install

From the project root:

```bash
npm install
```

## Environment setup (summary)

The framework uses **layered env files**: common values in **`.env`**, plus optional **`browser.env`**, **`api.env`**, **`desktop.env`**, and **`mobile.env`**.

| File | Scope | Examples |
|------|-------|----------|
| `.env` | Shared (loaded first) | `BASE_URL`, `HEADLESS`, `TIMEOUT`, `RETRIES`, `LOG_LEVEL`, LLM keys |
| `browser.env` | Browser | `BROWSER_CHANNEL`, `BROWSER_BASE_URL`, `BROWSER_VIEWPORT_*` |
| `api.env` | API | `API_BASE_URL`, `API_TIMEOUT`, `API_AUTH_*` |
| `desktop.env` | Desktop | `DESKTOP_APP_NAME`, `DESKTOP_APP_PATH`, `DESKTOP_USE_VISION` |
| `mobile.env` | Mobile | `MOBILE_DEVICE_NAME`, `APPIUM_*`, `MOBILE_BUNDLE_ID` |

**Precedence:** values from a platform-specific file override `.env` for keys that were only set in `.env`. Variables you set in the **shell** override both (good for CI).

See **[Environment variables](./environment.md)** for the full rules and Playwright metadata.

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

**Optional:** scaffold a browser POM from a URL using [POM generator](../common/pom-generator.md). For HTTP tracing on a tab, use the **`network`** fixture in [Browser automation](../browser/automation.md).

## Write your first API test

Create `tests/api/my-first.api.spec.ts`:

```typescript
import { test, expect } from '../../src/fixtures';

test('fetch a JSON post', async ({ api }) => {
  const res = await api.get('/posts/1');
  expect(res.status).toBe(200);
  expect(res.body.id).toBe(1);
});
```

The **`api`** project uses a default base URL from **`API_BASE_URL`** (see `api.env` or `playwright.config.ts`). Run:

```bash
npx playwright test --project=api tests/api/my-first.api.spec.ts
```

More detail: [HTTP API testing](../api/http-testing.md).

## Write your first desktop test (macOS)

Desktop tests require a **Mac host**, **Accessibility** permission for your terminal/IDE, and usually an app name. Example pattern (adapt selectors to your app):

```typescript
import { test, expect } from '../../src/fixtures';

test('launch Notes @app=Notes', async ({ app }) => {
  await app.launch({ name: 'Notes', windowState: 'maximized' });
  const title = await app.getTitle();
  expect(title.length).toBeGreaterThan(0);
});
```

Save as **`*.desktop.spec.ts`** and run:

```bash
npx playwright test --project=desktop-macos tests/desktop/my-first.desktop.spec.ts
```

Full guide: [Desktop — macOS](../desktop/macos.md).

## Mobile: first run

Mobile needs Appium, device or simulator setup, and env vars. Follow [iOS](../mobile/ios.md) or [Android](../mobile/android.md) — do **not** skip prerequisites or sessions will fail immediately.

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
| **`checkpoint`** | **`CheckpointManager`** — filenames include worker index (`scopedCheckpointTestId`) |
| **`resumable`** | Same semantics as **`runSteps`**, plus **`checkpoint(name[, segment])`** for mid-step resume (browser **`BrowserDriver`** only). Advanced: **`resumeKey`**, **`validateResume`**, **`uiResumeValidator`** via **`createResumableFlow`** / **`runSteps`** — see [Auth & checkpoints](../common/auth-and-checkpoints.md) |

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

- **Eval framework:** [Eval framework](../common/eval-framework.md) — LLM-as-judge, rule-based evals, alignment testing  
- **LLM providers:** [LLM providers](../common/llm-providers.md) — OpenAI, Anthropic, Gemini setup  
- **POM generator:** [POM generator](../common/pom-generator.md) — auto-generate page objects  
- **MCP bridge:** [Desktop bridge (MCP)](../desktop/mcp-bridge.md) — Cursor integration for desktop automation  
- **Browsers:** [Browser automation](../browser/automation.md)  
- **Desktop:** [macOS](../desktop/macos.md) / [Windows](../desktop/windows.md)  
- **Mobile:** [iOS](../mobile/ios.md) / [Android](../mobile/android.md)  
- **HTTP:** [HTTP API testing](../api/http-testing.md)  
- **Auth & resume:** [Using checkpoints in tests](../common/checkpoints-in-tests.md) (beginner) · [Auth & checkpoints](../common/auth-and-checkpoints.md) (full reference)  
- **Architecture:** [Architecture overview](../architecture/overview.md) — full system design and porting guide  
