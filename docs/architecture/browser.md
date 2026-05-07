# Browser stack (architecture)

Web automation uses **Playwright** underneath: one shared **`Browser`** from the test worker, a **`BrowserContext`**, and one or more **`Page`** instances managed by **`PageManager`** when you need multiple tabs.

## Flow (summary)

1. The **`app`** fixture creates a **`BrowserDriver`** bound to Playwright’s **`browser`** instance.  
2. **`BrowserDriver`** opens a **context** (viewport, optional `storageState`) and a default **page**.  
3. Your POM calls **`IDriver`** methods (`click`, `fill`, `navigate`, …). **`BrowserDriver`** maps those to the **active** `Page` (`PageManager.current()`).  
4. Optional: **`network`** fixture listens to request/response events on a `Page`.  
5. Optional: **checkpoints** write `storageState` + URL under `.checkpoints/` for resume; optional **`resumeKey`** / **`validateResume`** (or **`uiResumeValidator`**) catch browser–server drift (see [Auth & checkpoints](../common/auth-and-checkpoints.md)).

## Diagram (same as overview §13.1)

See the mermaid diagram under **§13.1** in [**overview.md**](./overview.md#131-browser-chromium--firefox--webkit).

## Key source files

| File | Role |
|------|------|
| `src/drivers/browser/browser-driver.ts` | `IDriver` → Playwright context + pages |
| `src/drivers/browser/page-manager.ts` | Tabs, `openNewTab`, dialog helper attachment |
| `src/drivers/browser/resolve-selector.ts` | String selector → locator strategy |
| `src/drivers/browser/network/*` | Optional HTTP capture |
| `src/session/copyable/*` | Portable checkpoint / resume helpers |

## User guides (how to write tests)

- [Browser automation](../browser/automation.md) — projects, selectors, auth, **`network`**  
- [Browser POM & tests](../browser/pom-and-tests.md) — `DriverPage` vs `PageObject`, **`pom`** fixture  

[← Architecture hub](./README.md) · [Documentation home](../README.md)
