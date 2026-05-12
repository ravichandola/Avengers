# Browser POM and tests

This guide explains how to **author page objects** for websites and **write browser tests** in this repo: file layout, the two POM bases (`DriverPage` vs `PageObject`), the **`narrator`** POM factory, the **`pom`** tab helper, and checkpoints.

**Shared fixture / `IDriver` concepts:** [Fixtures & `IDriver`](../common/fixtures-and-idriver.md). **Browser stack diagram:** [Architecture overview §13.1](../architecture/overview.md#131-browser-chromium--firefox--webkit).

---

## Test file and project

- Name browser specs **`*.browser.spec.ts`** so `playwright.config.ts` picks them up for browser projects.
- Import the test harness from **`src/fixtures`** (not `@playwright/test` directly) so you get **`app`**, **`pom`**, **`narrator`**, **`resumable`**, and shared **`expect`**:

```typescript
import { test, expect, narrator, pom } from '../../src/fixtures';
```

Run a file, for example:

```bash
npx playwright test --project=chrome tests/browser/my-flow.browser.spec.ts
```

---

## Hierarchy POMs (`pomPages`)

For `RootContainer` → `WebPage` / `Block` / `Container` trees (underscore locators, `verifyLocator`, optional `EnhancedPageObject` typings), import the **`pomPages`** namespace so you do not clash with scoped **`Block`** (`page-object` helpers):

```typescript
import { pomPages } from '../../../src/drivers/browser/pom';

class HomePage extends pomPages.WebPage {
  constructor(page: import('playwright').Page) {
    super(page);
  }
  protected baseUrl() {
    return 'https://example.com';
  }
  async shouldBeVisible() {
    return this;
  }
}
```

Utilities from the same import zip live under **`src/utils/`**: **`disposalContext`** + **`Server`** (test `afterEach` flushes test-scoped disposables when you use `test` from **`src/fixtures`**), **`createLocators(page)`**, and **`regexEscape`**.

## Two ways to model a page

The framework supports **two** page-object styles. Pick one per POM class (do not mix bases in a single class).

### 1. `DriverPage` — `IDriver` + `element()`

**Use when:** you want **one API** aligned with desktop/mobile (`click`, `fill`, `navigate` on selector strings) and optional **checkpoint / resume** flows that go through `BrowserDriver`.

- **Base:** `src/pom/driver-page.ts` — `DriverPage`
- **Constructor:** `(driver: IDriver)`
- **Locators:** `this.element('selector')` → `ElementRef` (wraps driver actions)
- **Navigation:** `this.navigate(url)` → `driver.navigate`

**Example (fragment):**

```typescript
// tests/pom/browser/shop-checkout-page.ts
import { DriverPage } from '../../../src/pom/driver-page';

export class ShopCheckoutPage extends DriverPage {
  readonly productList = this.element('.product-list');

  async browseProducts(): Promise<void> {
    await this.navigate('https://shop.example.com/products');
    await this.productList.waitFor();
  }
}
```

**Multi-tab / Playwright specifics:** inside a `DriverPage` you can reach the underlying browser via `BrowserDriver.pages` when needed (e.g. `waitForURL`, `openNewTab`). The sample **`PlaywrightSiteDriverPage`** unwraps `BrowserDriver` for those calls; reuse that pattern if you need raw `Page` APIs from a `DriverPage`.

### 2. `PageObject` — Playwright `Page` + `locator()`

**Use when:** you prefer **native Playwright `Locator`** fields (generated POMs often use this).

- **Base:** `src/drivers/browser/pom/page-object.ts` — `PageObject`
- **Constructor:** `(page: Page)`
- **Locators:** `this.locator('selector')` → Playwright `Locator`

**Example (fragment):**

```typescript
import { PageObject } from '../../../src/drivers/browser/pom/page-object';

export class MySitePage extends PageObject {
  readonly signIn = this.locator('a:has-text("Sign In")');

  async open(): Promise<void> {
    await this.navigate('https://example.com');
  }
}
```

---

## Where files live and exports

| Location | Purpose |
|---------|---------|
| `tests/pom/browser/*.ts` | Browser-specific POM classes |
| `tests/pom/index.ts` | Re-exports POMs + **`PomManager`** for short imports from specs |

In specs, prefer:

```typescript
import { ShopCheckoutPage, PlaywrightSiteDriverPage } from '../pom';
```

Framework types also ship from **`src/pom`** (e.g. `DriverPage`, `PomManager` for typing the **`pom`** fixture).

---

## Writing tests: `app`, `narrator`, `pom`, and assertions

### `app` fixture

`app` is an **`IDriver`** (`BrowserDriver` in browser projects). The fixture usually **auto-launches** the browser; you can still call `app.launch({ url })` to open or navigate to a URL.

**Default URL from `.env` (browser):** set `BROWSER_BASE_URL` or `BASE_URL` in `.env` / `browser.env`. Then:

- The fixture’s first `launch` uses that URL when project metadata does not supply a non-empty base URL (and Playwright config already maps env into metadata for stock projects).
- In tests, `await app.launch({})`, `await app.launch({ url: '' })`, or omitting `url` still opens that same URL via `resolveBrowserLaunchUrl()` inside `BrowserDriver.launch`—you do not have to repeat the string in every spec unless you want a different page.

```typescript
test('example', async ({ app }) => {
  await app.launch({ url: 'https://playwright.dev/' });
  await app.click('main');
  expect(await app.getTitle()).toMatch(/Playwright/i);
});
```

### `narrator` — **the** POM factory (`newPage`)

Import **`narrator`** from **`src/fixtures`** and build **every** page object with **`narrator.newPage(MyPom)`**. One API for **`DriverPage`** and **`PageObject`**: a **read-only lazy proxy** that instantiates on first property access or method call with the **current** tab (`PageObject`) or **`app`** (`DriverPage`). Writes to the proxy throw.

- **`narrator.page`** / **`narrator.pages()`** — active **`Page`** / **`PageManager`**.
- **`narrator.newPage(Class, { args?: [...] })`** — optional extra constructor arguments after `page` / `driver`.
- **`pom.newPage` / `pom.switchToTab` / …** refresh lazy POM caches automatically. With the standalone **`pages`** fixture, call **`narrator.resetPageInstances()`** after switching tabs.

**Requires** `test` from **`src/fixtures`**: **`app`** runs **`narrator.bind` / `unbind`** on browser projects.

```typescript
import { test, expect, narrator } from '../../src/fixtures';

test('flow', async ({ app }) => {
  await app.launch({ url: 'https://playwright.dev/' });
  const site = narrator.newPage(PlaywrightSiteDriverPage);
  await site.openDocsFromHeader();
});
```

### `pom` fixture (`PomManager`) — **tabs only**

**`pom`** does **not** build POMs (there is no **`pom.page`**). It only changes tabs on the same **`app`**:

- **`await pom.newPage(url?)`** — new active tab.
- **`await pom.newPagePom(Class, url?)`** — new tab, then **`narrator.newPage(Class)`** (lazy POM).
- **`pom.browserTabs`**, **`pom.switchToTab`**, **`switchToTabTitle`**, **`switchToTabURL`**

```typescript
import { test, expect, narrator, pom } from '../../src/fixtures';

test('two tabs', async ({ app, pom }) => {
  await app.launch({ url: 'https://playwright.dev/' });
  const site = narrator.newPage(PlaywrightSiteDriverPage);
  await site.openDocsFromHeader();
  await pom.newPage('https://playwright.dev/docs/pom');
  const pomDoc = narrator.newPage(PlaywrightDocsPage);
  await expect(pomDoc.getTitle()).resolves.toMatch(/pom/i);
});
```

No tracing/codegen proxy — lazy construction and frozen proxy only.

### When you need raw `Page` (e.g. `expect(page).toHaveURL`)

Playwright’s **`expect` for `Page`** / **`Locator`** comes from the same fixtures **`expect`**, but you need a **`Page`**. For a `DriverPage` flow, unwrap once:

```typescript
import { unwrapBrowserDriver } from '../helpers/unwrap-browser-driver';

const browserDriver = unwrapBrowserDriver(app);
await expect(browserDriver.pages.current()).toHaveURL(/\/docs\//);
```

For **`PageObject`** POMs, use **`page`** from the underlying class if you expose it, or drive assertions through locators on that POM.

---

## Checkpoint-friendly tests (`resumable`)

For long flows, use the **`resumable`** fixture so each **named step** can save storage + URL under `.checkpoints/` (see [Auth & checkpoints](../common/auth-and-checkpoints.md)). For **resume safety** when server data may not match the saved browser state (seed changes, disposable backend context), use **`createResumableFlow`** with **`resumeKey`**, **`validateResume`**, **`uiResumeValidator`**, and optionally **`onResumeInvalidated`** — the default **`resumable`** fixture does not pass those options.

Linear style:

```typescript
import { test, expect, narrator } from '../../src/fixtures';

test('long flow', async ({ app, resumable }) => {
  const shop = narrator.newPage(ShopCheckoutPage);
  await app.launch(/* … */);

  await resumable.step('browse', async () => {
    await shop.browseProducts();
  });
  await resumable.step('add to cart', async () => {
    await shop.addFirstProductToCart();
  });

  expect(await app.getTitle()).toContain('Cart');
});
```

On **pass**, the fixture clears checkpoints for that test. With **`BROWSER_CHECKPOINT_RESUME=true`**, a **retry** can skip completed steps.

Mid-step saves (long single step):

```typescript
await resumable.step('checkout', async () => {
  await resumable.checkpoint('after-cart', async () => {
    await shop.addFirstProductToCart();
    await shop.openCart();
  });
  await resumable.checkpoint('after-shipping', async () => {
    await shop.fillShipping();
  });
  await shop.pay();
});
```

On resume, earlier **`checkpoint(..., segment)`** blocks whose labels come **before** the saved **`subCheckpoint`** skip their **`segment`** only; keep fragile UI inside those segments. Details: [Auth & checkpoints](../common/auth-and-checkpoints.md).

---

## Selector conventions (browser driver)

When using **`DriverPage`** / **`app`** with string selectors, resolution follows **`BrowserDriver`** (XPath prefix, CSS-like tokens, then heuristics). Prefer **stable** selectors in real suites (`data-testid`, roles). Details: [Browser automation](./automation.md#selectors-how-click--fill-work).

---

## Related docs

| Doc | Topic |
|-----|--------|
| [Browser automation](./automation.md) | Projects, `app`, `pages` fixture vs `app`, network fixture |
| [Auth & checkpoints](../common/auth-and-checkpoints.md) | `runSteps`, resume, `.auth` profiles |
| [POM generator](../common/pom-generator.md) | Generating `PageObject` / DOM POMs from sites |

---

## Quick checklist

1. Add **`*.browser.spec.ts`** under `tests/browser/` (or your layout).
2. Implement **`DriverPage`** or **`PageObject`** under `tests/pom/browser/` and export from **`tests/pom/index.ts`**.
3. In the spec: **`test`, `expect`, `narrator`** from **`src/fixtures`**; add **`pom`** when you need tab helpers; add **`resumable`** for checkpoints.
4. Build POMs **only** with **`narrator.newPage(MyClass)`** — not **`pom.page`** (removed). Avoid raw **`new MyClass(page)`** unless you use the isolated **`pages`** fixture.
5. Use **`pom.newPage` / `pom.browserTabs`** or **`narrator.pages()`** for multi-tab flows on **`app`**. Keep the standalone **`pages`** fixture only when you need a **separate** browser context (see **`netflix.browser.spec.ts`**).
