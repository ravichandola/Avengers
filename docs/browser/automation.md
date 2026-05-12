# Browser automation (Chrome, Firefox, Safari / WebKit)

Browser tests use Playwright under the hood but expose a **unified `app` fixture** so your tests stay consistent with desktop/mobile patterns.

## When is this guide for you?

You automate **websites** and run tests on **Chromium (Chrome)**, **Firefox**, or **WebKit** (Safari engine).

**Shared concepts:** [`IDriver`](../../src/core/base-driver.ts), fixtures, env — [Fixtures & `IDriver`](../common/fixtures-and-idriver.md). **Stack diagram:** [Architecture overview §13.1](../architecture/overview.md#131-browser-chromium--firefox--webkit).

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

For multi-tab flows **on the same `app` / `BrowserDriver`**, use **`narrator.newPage`** for POMs and **`pom.newPage` / `pom.browserTabs`** for tabs — [Browser POM & tests](./pom-and-tests.md).

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

### PageObject-based POMs (Playwright locators)

When you want **native Playwright `Locator`** fields instead of `IDriver` + `element()`, extend **`PageObject`** and pass the current tab from **`pages`**:

```typescript
import { test, expect } from '../../src/fixtures';
import { NetflixBrowsePage } from '../pom/browser/netflix-browse-page';

test('browse with PageObject', async ({ pages }) => {
  const netflix = new NetflixBrowsePage(pages.current());
  await netflix.open();
  expect(await netflix.getCurrentURL()).toContain('netflix.com');
});
```

Use **`pages.create(MyPageObject)`** if you prefer the factory on `PageManager`. Generated browser POMs are documented in [POM generator](../common/pom-generator.md) (`DriverPage` vs `PageObject`).

## Network capture (`network` fixture)

Browser projects expose a **`network`** fixture backed by **`NetworkMonitor`** (`src/drivers/browser/network/`). It records requests and responses on a Playwright **`Page`**, redacts sensitive headers, caps memory, and can attach artifacts to the HTML report.

1. Call **`network.start(page)`** as early as possible (before navigation you care about).
2. Assertions can use **`network.getRequestCount()`**, **`getEntriesByPattern(/regex/)`**, **`getFailedRequests()`**, **`getSummary(...)`**.
3. **Attachments:** If the test **fails** or the title includes **`@network`**, the fixture attaches **`network-log`** (JSON) and **`network-summary`** (plain text). Optionally attach again from the test with **`test.info().attach(...)`**.

```typescript
test('checkout flow @network', async ({ pages, network }) => {
  const page = pages.current();
  network.start(page);
  await page.goto('https://example.com');
  const apis = network.getEntriesByPattern(/\/api\//);
  expect(apis.length).toBeGreaterThan(0);
});
```

**Reporter:** `playwright.config.ts` registers **`./src/drivers/browser/network/network-reporter.ts`**, which prints a concise network summary to the console when those attachments are present.

This uses Playwright’s request/response events (in-process). It does not require a separate Chrome DevTools MCP.

## Generating browser POMs from a URL

See **[POM generator](../common/pom-generator.md)** for `scripts/generate-pom.ts` (default `DriverPage` output, optional `--enhanced` + `PageObject`).

## Authentication without logging in every time

Use **`AuthManager`** with **`setupProfile`** once, then **`app.launch({ authProfile: 'myuser' })`**. Full steps and examples: [Auth & checkpoints](../common/auth-and-checkpoints.md).

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
