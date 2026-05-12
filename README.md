# Desktop Agent v2 - Unified Automation Framework

One API. One config. Any platform. Browser, Desktop, Mobile, API testing through a single fixture-driven interface powered by Playwright Test.

## Deep dive (architecture & porting)

For a **top-level map** of the repo — who calls whom, what each layer does, environment and LLM/vision behavior, and a **checklist to port the design** to another framework — see **[docs/architecture/overview.md](./docs/architecture/overview.md)** (**§13** = browser / desktop / mobile / API diagrams). The documentation index is **[docs/README.md](./docs/README.md)**. Concepts shared by every platform: **[docs/common/fixtures-and-idriver.md](./docs/common/fixtures-and-idriver.md)**.

For **browser / desktop / mobile / functional API** flows, documentation lives under **[docs/](./docs/)** (**[docs/README.md](./docs/README.md)**).

---

## Load & performance testing (`performance-framework/`)

Performance work lives in **its own npm package**, isolated from Playwright **`*.spec.ts`** tests (see [*Performance testing for engineers* §8](./performance-framework/performance-docs/beginner/performance-testing-for-engineers.md)): you describe load in TypeScript (**`scenario()`**, **`get` / `post`**, **`load()`**, SLA and assertions); the tooling turns that into **Apache JMeter** (`.jmx`), runs workers, parses **`.jtl`**, and writes **HTML + JSON + Allure-compatible** artifacts per run under **`performance-framework/perf-output/<run-id>/`**.

### Prerequisites

| Need | Purpose |
|------|---------|
| **Node.js ≥ 20** | Required by `"engines"` on the package (`npm install`). |
| **Apache JMeter** | Execute generated plans (`jmeter -v`), or resolve via **`JMETER_HOME`** / **`APACHE_JMETER_HOME`** / **Homebrew macOS**: `JMETER_HOME="$(brew --prefix jmeter)/libexec"` (see **[performance-framework/README.md](./performance-framework/README.md)**). |

Browser report assets: **`prepare`** runs **`build:report-client`** after install so **`report.js`** exists beside **`report.css`**. If charts or the bundled report break, run `npm run build:report-client` from the package root.

### Where to read (documentation index)

| Doc | Contents |
|-----|----------|
| [**performance-docs/README.md**](./performance-framework/performance-docs/README.md) | Index of all package guides |
| [**Beginner track**](./performance-framework/performance-docs/beginner/README.md) | Concepts, stack, why this is separate from Playwright smoke tests |
| [**QUICKSTART**](./performance-framework/performance-docs/QUICKSTART.md) | First/second/third model, scenario + runner files, commands |
| [**WORKFLOW**](./performance-framework/performance-docs/WORKFLOW.md) | End-to-end: setup → runs → CI → debugging |
| [**ARCHITECTURE**](./performance-framework/performance-docs/ARCHITECTURE.md) | Hexagonal boundaries, adapters, reporting, ops |
| [**FROM-POSTMAN-TO-LOAD-TEST**](./performance-framework/performance-docs/FROM-POSTMAN-TO-LOAD-TEST.md) | Postman (OAuth / headers / POST) → DSL (**English + Hinglish**), workflow diagrams, JSONPlaceholder walkthrough |

### Layout inside `performance-framework/`

| Path | Role |
|------|------|
| **`examples/`** | Copy **`jsonplaceholder-load.scenario.ts`** + **`run-jsonplaceholder-load.ts`** for your API |
| **`src/`** | DSL (`dsl/`), JMeter **`adapters/jmeter/`**, **`reporting/`** (HTML client + reporters), **`cli/perf.ts`**, orchestration |
| **`performance-docs/`** | All markdown guides (**start here**) |
| **`perf-output/`** | **Generated only** — JTL, JMX, `index.html`, `report.json`; **never commit** (**[.gitignore](./performance-framework/.gitignore)**) |
| **`dashboard/`** | Optional Vite UI; **`npm install`** there before **`dev` / build** ([QUICKSTART note](./performance-framework/performance-docs/QUICKSTART.md)) |
| **`docker/`**, **`k8s/`**, **`ci/`** | Recipes for workers / orchestration / CI examples |

### Commands (run from package root)

```bash
cd performance-framework
npm install                    # installs deps + prepares report-client bundle

# Typical dev — no compile step (tsx loads TypeScript from src/)
npm run example:jsonplaceholder    # GET+POST demo → perf-output/<uuid>/
npm run dev:smoke                  # CLI run:smoke from source

# Compiled path (publish / CI that runs dist only)
npm run build                      # bundles report client + tsc → dist/
node dist/cli/perf.js run:smoke      # perf-fw CLI from dist

npm run lint
npm run check                      # TypeScript checks (including report client TS)
```

Interactive runs may open **`http://127.0.0.1:50552/`** for the HTML report (default **`PERF_REPORT_PORT`**). Non-interactive: **`CI=true`**, **`--ci`** where supported, or **`PERF_NO_REPORT_SERVER=1`** so the process does not wait on a server (see **[performance-framework/src/reporting/report-cli.ts](./performance-framework/src/reporting/report-cli.ts)** and the package README).

## Quick Start

```bash
npm install
npx playwright test --project=chrome     # Browser tests
npx playwright test --project=api        # API tests
npx playwright test --project=desktop-macos  # Desktop tests
DESKTOP_APP_NAME=Notes npx playwright test --project=desktop-macos tests/desktop/notes.desktop.spec.ts
```

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ Test Spec: test('login', async ({ app, pages, api }) => {  │
├────────────────────────────────────────────────────────────┤
│ Fixtures: test.extend({ app, pages, api })                 │
├────────────────────────────────────────────────────────────┤
│ DriverFactory → picks correct driver from config           │
├──────────┬──────────┬───────────────┬──────────────────────┤
│ Browser  │ Desktop  │    Mobile     │        API           │
│ Driver   │ Driver   │    Driver     │       Driver         │
├──────────┼──────────┼───────────────┼──────────────────────┤
│ Chromium │ macOS AX │ iOS/XCUITest  │ REST (fetch)         │
│ Firefox  │ Win UIA  │ Android/UIA2  │ GraphQL              │
│ WebKit   │          │ (via Appium)  │                      │
└──────────┴──────────┴───────────────┴──────────────────────┘
```

## Writing Tests

Every test uses the same `app` fixture regardless of target platform:

### Browser

```typescript
import { test, expect } from "../src/fixtures";

test("login on web", async ({ app }) => {
  await app.launch({ url: "https://myapp.com" });
  await app.fill("email_input", "user@test.com");
  await app.fill("password_input", "secret");
  await app.click("login_button");
});
```

### Desktop (same API)

```typescript
test("login on macOS app", async ({ app }) => {
  await app.launch({ name: "MyApp", windowState: "maximized" });
  await app.click("signin_button");
  await app.fill("email_field", "user@test.com");
  await app.click("submit");
});
```

Desktop window state options:

- `normal` — leave as-is
- `maximized` — default for desktop launches
- `fullscreen` — OS fullscreen

### Mobile (same API)

```typescript
test("login on iOS", async ({ app }) => {
  await app.launch({ bundleId: "com.company.app" });
  await app.click("sign_in");
  await app.fill("email_field", "user@test.com");
  await app.click("submit_button");
});
```

### API

```typescript
test("create user", async ({ api }) => {
  const res = await api.post("/users", { name: "John" });
  expect(res.status).toBe(201);
  expect(res.body.id).toBeTruthy();
});
```

### Multi-Tab (Browser)

```typescript
test("work across tabs", async ({ pages }) => {
  const page1 = pages.current();
  await page1.goto("https://app.com");

  await pages.openNewTab("https://app.com/settings");
  pages.switchTo(0); // back to first tab
  await pages.closeTab(1);
});
```

## Switching Browsers

Change one line in `playwright.config.ts` or run with a different project:

```bash
npm run test:chrome    # Google Chrome
npm run test:firefox   # Firefox
npm run test:webkit    # Safari/WebKit
npm run test:all-browsers  # All three
```

## Configuration

All configuration lives in `playwright.config.ts` as projects:

```typescript
projects: [
  { name: "chrome", use: { channel: "chrome" } },
  { name: "firefox", use: { browserName: "firefox" } },
  { name: "desktop-macos", metadata: { platform: "macos" } },
  {
    name: "mobile-ios",
    metadata: { platform: "ios", mobile: { deviceName: "iPhone 15" } },
  },
  {
    name: "api",
    metadata: { platform: "api", api: { baseURL: "https://api.example.com" } },
  },
];
```

## Available Scripts

| Script                      | What it runs             |
| --------------------------- | ------------------------ |
| `npm test`                  | All projects             |
| `npm run test:chrome`       | Browser tests on Chrome  |
| `npm run test:firefox`      | Browser tests on Firefox |
| `npm run test:webkit`       | Browser tests on WebKit  |
| `npm run test:all-browsers` | All three browsers       |
| `npm run test:desktop`      | macOS desktop tests      |
| `npm run test:mobile`       | iOS mobile tests         |
| `npm run test:api`          | API tests                |

## Project Structure

```
src/
  core/               # Types, IDriver interface, DriverFactory, config
  drivers/
    browser/          # BrowserDriver, PageManager, POM helpers, network monitor
    desktop/          # DesktopDriver + macOS/Windows adapters
    mobile/           # MobileDriver (Appium/WDIO)
    api/              # APIDriver (REST + GraphQL)
  fixtures/           # Playwright test.extend(): app, pages, api, network, ...
  utils/              # Logger, retry, sleep

tests/
  browser/            # *.browser.spec.ts
  desktop/            # *.desktop.spec.ts
  mobile/             # *.mobile.spec.ts
  api/                # *.api.spec.ts
  pom/                # Page objects per platform (often generated)

docs/
  pom-generator.md    # CLI: browser / desktop / mobile / API POM scaffolding
  browser-automation.md  # Browser tests, PageObject pattern, network fixture

performance-framework/    # Separate package: TypeScript DSL → JMeter → reports (see README there)
  examples/              # Scenario + runner you copy (JSONPlaceholder demo)
  performance-docs/       # QUICKSTART, WORKFLOW, Postman→load-test guide
  src/                   # DSL, adapters/jmeter/, reporting/, cli
```

For **scaffolding POMs** from a URL, XML, or AX tree, see **`docs/common/pom-generator.md`**. For **HTTP traces** on browser tests, see **`docs/browser/automation.md`** (network fixture + reporter). **Load testing** docs: **`performance-framework/performance-docs/README.md`**.

## Requirements

| Target            | Requirement                                   |
| ----------------- | --------------------------------------------- |
| Browser           | Playwright browsers: `npx playwright install` |
| Desktop (macOS)   | Accessibility permissions enabled             |
| Desktop (Windows) | .NET Framework                                |
| Mobile            | Appium server + `webdriverio` installed       |
| API               | None (uses native fetch)                      |
| Load / performance (`performance-framework`) | Node 20+, Apache JMeter (**`JMETER_HOME`** / `PATH`). See **`performance-framework/README.md`**. |

## Vision Fallback (GPT-4o)

When an element can't be found via standard locators, the framework automatically takes a screenshot and uses GPT-4o vision to locate the element visually. This works across **all platforms** (browser, desktop, mobile).

Set `OPENAI_API_KEY` to enable:

```env
OPENAI_API_KEY=sk-...
```

How it works:

1. `app.click("login_button")` tries standard locator (CSS, accessibility, etc.)
2. If it fails, captures a screenshot
3. Sends to GPT-4o: "Find the center coordinates of: login_button"
4. Gets back `{x: 450, y: 320}` and clicks at those coordinates

Notes about reliability:

- Desktop vision capture is PID-anchored: framework focuses the target app first, captures only that app window, translates image coordinates to screen coordinates using window bounds/DPI scale, and rejects out-of-bounds hallucinated points.
- If the vision provider is unavailable (quota/auth/network), vision-heavy tests can be marked as `skipped` instead of failing the whole suite.
- Keep at least one non-vision desktop flow test so CI remains stable even when vision API is temporarily unavailable.

Disable per-project in config:

```typescript
metadata: { platform: 'macos', vision: { enabled: false } }
```

## Notes Desktop Coverage

`tests/desktop/notes.desktop.spec.ts` includes:

- a vision-enabled flow (screen understanding + element detection)
- a core functionality flow (create note, type content, search token, verify app state)

Run only Notes tests:

```bash
DESKTOP_APP_NAME=Notes npx playwright test --project=desktop-macos tests/desktop/notes.desktop.spec.ts
```

## Environment Variables

```env
OPENAI_API_KEY=...       # Enables GPT-4o vision fallback (all platforms)
DESKTOP_APP_NAME=Notes   # Desktop app target; command-line value has highest priority
APPLE_TV_EMAIL=...       # For desktop login tests
APPLE_TV_PASSWORD=...
API_BASE_URL=...         # Override API base URL
APPIUM_RUNNING=true      # Enable mobile tests

# Load tests (performance-framework / JMeter runner)
JMETER_HOME=...                  # Where Apache JMeter is installed (or use PATH install)
PERF_REPORT_PORT=50552         # Optional HTML report preview server port
PERF_NO_REPORT_SERVER=1        # CI: skip local report server after a run
```

When running load tests (`cd performance-framework`), set **`JMETER_HOME`** per **[performance-framework/README.md](./performance-framework/README.md)**.

## Disposable desktop context

Desktop driver supports async disposal (`TS 5.2+`):

```typescript
import { createDesktopApp } from "./src/drivers/desktop/desktop-driver";

await using app = await createDesktopApp({
  name: "Notes",
  windowState: "maximized",
});
await app.click("New Note");
```

`close()` runs automatically when scope exits.
