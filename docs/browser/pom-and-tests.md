# Browser POM and tests

This guide explains how to **author page objects** for websites and **write browser tests** in this repo: file layout, the two POM bases (`DriverPage` vs `PageObject`), the **`pom`** fixture (`PomManager`), tabs, and checkpoints.

**Shared fixture / `IDriver` concepts:** [Fixtures & `IDriver`](../common/fixtures-and-idriver.md). **Browser stack diagram:** [Architecture overview §13.1](../architecture/overview.md#131-browser-chromium--firefox--webkit).

---

## Test file and project

- Name browser specs **`*.browser.spec.ts`** so `playwright.config.ts` picks them up for browser projects.
- Import the test harness from **`src/fixtures`** (not `@playwright/test` directly) so you get **`app`**, **`pom`**, **`resumable`**, and shared **`expect`**:

```typescript
import { test, expect } from '../../src/fixtures';
```

Run a file, for example:

```bash
npx playwright test --project=chrome tests/browser/my-flow.browser.spec.ts
```

---

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
import { ShopCheckoutPage, PlaywrightSiteDriverPage, PomManager } from '../pom';
```

Framework types also ship from **`src/pom`** (e.g. `DriverPage`, `PomManager`).

---

## Writing tests: `app`, `pom`, and assertions

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

### `pom` fixture (`PomManager`)

**`pom`** builds page objects against the **same** `app` driver. You avoid repeating `new MyPage(app)` everywhere.

- **`pom.page(DriverPageClass)`** — `new PageClass(this.driver)` (works with vision-wrapped drivers).
- **`pom.page(PageObjectClass)`** — binds to the **active tab**: `new PageClass(browserDriver.pages.current())`.

Tabs / context:

- **`await pom.newPage(url?)`** — opens a new tab and makes it active (wraps `PageManager.openNewTab`).
- **`await pom.newPagePom(PageObjectClass, url?)`** — new tab + `PageObject` instance in one step.
- **`pom.browserTabs`** — full **`PageManager`**: `switchTo`, `switchToURL`, `switchToTitle`, `openNewTab`, etc.

**Example:**

```typescript
test('flow', async ({ app, pom }) => {
  await app.launch({ url: 'https://playwright.dev/' });
  const site = pom.page(PlaywrightSiteDriverPage);

  await site.openDocsFromHeader();

  await pom.newPage('https://playwright.dev/docs/pom');
  const pomDoc = pom.page(PlaywrightDocsPage); // active tab
  // …
});
```

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

For long flows, use the **`resumable`** fixture so each **named step** can save storage + URL under `.checkpoints/` (see [Auth & checkpoints](../common/auth-and-checkpoints.md)).

Linear style:

```typescript
test('long flow', async ({ app, pom, resumable }) => {
  const shop = pom.page(ShopCheckoutPage);
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
3. In the spec: **`test, expect`** from **`src/fixtures`**; use **`{ app, pom }`** (and **`resumable`** if you need checkpoints).
4. Use **`pom.page(MyClass)`** instead of scattering `new MyClass(app)` / `new MyClass(pages.current())`.
5. Use **`pom.newPage` / `pom.browserTabs`** for multi-tab flows tied to **`app`**.
