# Browser automation (Chrome, Firefox, Safari / WebKit)

Browser tests use Playwright under the hood but expose a **unified `app` fixture** so your tests stay consistent with desktop/mobile patterns.

## When is this guide for you?

You automate **websites** and run tests on **Chromium (Chrome)**, **Firefox**, or **WebKit** (Safari engine).

## Configuration

### File naming

Tests must match **`*.browser.spec.ts`** so they are picked up by browser projects in `playwright.config.ts`.

### Projects (`playwright.config.ts`)

Three browser projects are defined:

| Project | Browser |
|---------|---------|
| `chrome` | Chromium + **channel: chrome** (installed Chrome) |
| `firefox` | Firefox |
| `webkit` | WebKit |

Common `use` options include `headless`, `viewport`. The **`app` fixture** reads `metadata` from the project for `headless`, `viewport`, and `channel` when you add them to the project’s `use` or `metadata` in config.

### Install browsers

```bash
npx playwright install
```

## Running tests

```bash
# All browser projects (all *.browser.spec.ts in tests/)
npm run test:all-browsers

# One engine
npm run test:chrome
npm run test:firefox
npx playwright test --project=webkit
```

Run a single file:

```bash
npx playwright test --project=chrome tests/browser/netflix.browser.spec.ts
```

### Headless vs headed

In `playwright.config.ts`, browser projects set `headless: false` by default (visible window). For CI, set `headless: true` in the project’s `use` or via env patterns you prefer.

## Writing tests with `app`

```typescript
import { test, expect } from '../../src/fixtures';

test('visit a page', async ({ app }) => {
  await app.launch({ url: 'https://www.example.com' });
  expect(await app.getURL()).toMatch(/example\.com/);
  expect((await app.getTitle()).length).toBeGreaterThan(0);
});
```

### Launch options (browser)

| Option | Purpose |
|--------|---------|
| `url` | Initial navigation after context is created |
| `authProfile` | Name of a saved file under `.auth/{name}.json` (see advanced doc) |
| `storageStatePath` | Direct path to a Playwright `storageState` JSON file |

## Selectors (how `click` / `fill` work)

The browser driver resolves a string into a Playwright locator (see `BrowserDriver`):

- **XPath** if the string starts with `//` or `xpath=`
- **CSS** if it looks like `#id`, `.class`, or `[attr=...]`
- Otherwise it tries several strategies: `data-testid`, `id`, `name`, `aria-label`, and `text=`

**Tip:** In production tests, prefer **`data-testid`** or **role-based** stable attributes. The built-in “try many selectors” mode is convenient but can be ambiguous on complex UIs.

## Multi-tab workflows (`pages` fixture)

For **multiple tabs in one test**, the framework provides **`pages`** — a `PageManager` over a **separate** browser context from `app` in the default fixture setup. The sample `netflix.browser.spec.ts` uses **`pages`** for tab switching.

Typical pattern:

```typescript
test('two tabs', async ({ pages }) => {
  await pages.current().goto('https://example.com');
  await pages.openNewTab('https://example.org');
  pages.switchTo(0);
  expect(pages.current().url()).toContain('example.com');
});
```

**Note:** `pages` is optimized for **multi-tab** demos. For most flows, prefer driving everything through **`app`** and one tab unless you explicitly need parallel tabs.

## Authentication without logging in every time

Use **`AuthManager`** with **`setupProfile`** once, then **`app.launch({ authProfile: 'myuser' })`**. Full steps and examples: [advanced-auth-and-checkpoints.md](./advanced-auth-and-checkpoints.md).

## Vision fallback

If `OPENAI_API_KEY` is set and vision is enabled in config, failed structural lookups can fall back to GPT-4o vision (wrapper around the driver). This is optional and depends on your environment policy.

## LLM-as-a-judge (browser)

`DriverPage` includes a binary judge helper modeled as a strict PASS/FAIL evaluator with structured JSON output:

```json
{ "rationale": "...", "label": "PASS|FAIL" }
```

Use `judgePassFail()` from a browser POM (`extends DriverPage`) to evaluate subjective quality checks with a rubric + few-shot examples.

```typescript
const verdict = await this.judgePassFail({
  context: 'Browser smoke validation for home page quality.',
  criteria: 'PASS if URL/domain/title are correct; FAIL otherwise.',
  candidateOutput: JSON.stringify({ url, title }),
  examples: [
    {
      input: '{"url":"https://www.netflix.com","title":"Netflix"}',
      result: { rationale: 'Domain and title match.', label: EvalLabel.PASS }
    }
  ]
});
```

Environment:

- Set one of `OPENAI_API_KEY` or `GEMINI_API_KEY`
- Optional: `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`
- Keep judge temperature at `0` for deterministic CI behavior

## Debugging

- Run with **PWDEBUG=1** for Playwright inspector:  
  `PWDEBUG=1 npx playwright test --project=chrome`
- Use **trace**: enable in `playwright.config.ts` (`trace: 'on-first-retry'`) if you add retries.

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Test not running | Filename must be `*.browser.spec.ts`; check `--project` |
| Wrong browser | Use `--project=firefox` etc. |
| Chrome not found | Install Chrome or switch project to plain Chromium |
| Flaky navigation | Increase timeout in test or config; wait for network idle if needed (extend driver if required) |
