# Browser documentation

Browser automation uses **Playwright** (Chromium / Chrome, Firefox, WebKit). Specs must be named **`*.browser.spec.ts`** and run with a browser **project** (for example `--project=chrome`).

| Guide | What you will learn |
|--------|---------------------|
| [**Browser automation**](./automation.md) | Projects, `app` / `pages`, selectors, **`network`** fixture, auth profiles |
| [**Browser POM & tests**](./pom-and-tests.md) | `DriverPage` vs `PageObject`, **`pom`** fixture, multi-tab, **`resumable`**, launch URL |

**Architecture (how it is built):** [Browser stack](../architecture/browser.md)  
**Shared concepts:** [Fixtures & `IDriver`](../common/fixtures-and-idriver.md)

[← Documentation home](../README.md)
