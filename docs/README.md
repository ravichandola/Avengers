# Desktop Agent — Documentation

Welcome. This framework gives you **one TypeScript API** (`IDriver`) for **browser**, **desktop (macOS / Windows)**, **mobile (iOS / Android)**, and **HTTP APIs**. You pick a **Playwright project** that matches your target, import **`test` from `src/fixtures`**, and use the same patterns everywhere.

**New here?** Start with [Configuration: first test & setup](./configuration/first-test-and-setup.md), then skim [Common: fixtures & shared API](./common/fixtures-and-idriver.md).

---

## 1. Configuration (install, env, run your first test)

| Guide | What you will learn |
|--------|---------------------|
| [**First test & setup**](./configuration/first-test-and-setup.md) | Install, prerequisites, how runs are routed, first browser test, naming rules |
| [**Environment variables**](./configuration/environment.md) | `.env` layers, shells vs files, per-platform keys, quick reference |

---

## 2. Common (shared features — all platforms)

| Guide | What you will learn |
|--------|---------------------|
| [**Fixtures & `IDriver`**](./common/fixtures-and-idriver.md) | `DriverFactory`, vision vs API drivers, fixture matrix, POM bases (`DriverPage`, `ElementRef`), links to each stack |
| [**Auth & checkpoints**](./common/auth-and-checkpoints.md) | Saved login profiles (`.auth/`), resume checkpoints (`.checkpoints/`), optional `resumeKey` + `validateResume` + `uiResumeValidator`, worker-scoped filenames, mid-step `resumable.checkpoint`, `resumable` fixture, copyable portable module |
| [**Eval framework**](./common/eval-framework.md) | Rule-based and LLM-as-judge evals, alignment, self-consistency |
| [**LLM providers**](./common/llm-providers.md) | OpenAI, Anthropic, Gemini — env vars and switching models |
| [**POM generator**](./common/pom-generator.md) | Scaffold page objects from DOM, AX, mobile XML, or API schemas |

---

## 3. Architecture

| Guide | What you will learn |
|--------|---------------------|
| [**Architecture hub**](./architecture/README.md) | How this section is organized |
| [**Full system architecture**](./architecture/overview.md) | Layers, execution flow, `IDriver`, factory, POM, LLM vs vision, config, porting, source map, glossary |
| [**Browser (architecture)**](./architecture/browser.md) | How Playwright fits in — context, `BrowserDriver`, optional network & checkpoints |
| [**Desktop (architecture)**](./architecture/desktop.md) | `DesktopDriver`, macOS vs Windows adapters |
| [**Mobile (architecture)**](./architecture/mobile.md) | Appium + WebdriverIO path |
| [**API (architecture)**](./architecture/api.md) | `APIDriver`, no vision wrapper |

---

## 4. Browser (guides)

| Guide | What you will learn |
|--------|---------------------|
| [**Browser hub**](./browser/README.md) | Projects, file naming, where to read next |
| [**Browser automation**](./browser/automation.md) | Chrome / Firefox / WebKit, auth, multi-tab, selectors, `network` fixture |
| [**Browser POM & tests**](./browser/pom-and-tests.md) | `DriverPage` vs `PageObject`, `pom` fixture, tabs, `resumable`, launch URL |

**Projects:** `chrome`, `firefox`, `webkit` · **specs:** `*.browser.spec.ts`

---

## 5. Desktop (guides)

| Guide | What you will learn |
|--------|---------------------|
| [**Desktop hub**](./desktop/README.md) | macOS vs Windows projects |
| [**macOS**](./desktop/macos.md) | Native apps, Accessibility, launching apps |
| [**Windows**](./desktop/windows.md) | UIA / PowerShell bridge, running on Windows agents |
| [**Desktop bridge (MCP)**](./desktop/mcp-bridge.md) | MCP server for Cursor — scan apps, generate POMs from chat |

**Projects:** `desktop-macos`, `desktop-windows` · **specs:** `*.desktop.spec.ts`

---

## 6. Mobile (guides)

| Guide | What you will learn |
|--------|---------------------|
| [**Mobile hub**](./mobile/README.md) | iOS vs Android projects |
| [**iOS**](./mobile/ios.md) | Appium, XCUITest, bundle IDs |
| [**Android**](./mobile/android.md) | Appium, UiAutomator2, package / activity |

**Projects:** `mobile-ios`, `mobile-android` · **specs:** `*.mobile.spec.ts`

---

## 7. API (guides)

| Guide | What you will learn |
|--------|---------------------|
| [**API hub**](./api/README.md) | When to use `api` vs `app` on API project |
| [**HTTP API testing**](./api/http-testing.md) | REST, GraphQL, auth headers, base URL |

**Project:** `api` · **specs:** `*.api.spec.ts`

---

## Suggested reading order

1. [First test & setup](./configuration/first-test-and-setup.md)  
2. [Fixtures & `IDriver`](./common/fixtures-and-idriver.md)  
3. [Architecture overview](./architecture/overview.md) — at least sections 1–5 and your platform’s §13  
4. Your platform hub: [Browser](./browser/README.md), [Desktop](./desktop/README.md), [Mobile](./mobile/README.md), or [API](./api/README.md)  
5. [Auth & checkpoints](./common/auth-and-checkpoints.md) when you need sessions or resume  
6. [Eval](./common/eval-framework.md) / [LLM providers](./common/llm-providers.md) when you use judges or vision-related config  

---

## Quick commands

```bash
npm install
npx playwright install    # browser binaries

npm test                  # all Playwright projects
npm run test:chrome       # browser — Chrome
npm run test:desktop      # desktop-macos
npm run test:mobile       # mobile-ios
npm run test:api          # api project
npm run build             # TypeScript compile
npm run pom:gen           # POM generator CLI
```

---

## Test file naming (important)

| Pattern | Typical projects |
|---------|------------------|
| `*.browser.spec.ts` | `chrome`, `firefox`, `webkit` |
| `*.desktop.spec.ts` | `desktop-macos`, `desktop-windows` |
| `*.mobile.spec.ts` | `mobile-ios`, `mobile-android` |
| `*.api.spec.ts` | `api` |

Tests live under `tests/` (see `playwright.config.ts` → `testDir`).

---

## Where things live in code

- **Fixtures:** `src/fixtures/index.ts`  
- **Driver contract:** `src/core/base-driver.ts`  
- **Playwright config:** `playwright.config.ts`  
- **Env loading:** `src/core/env-loader.ts`  

If something fails, open the **platform guide** for prerequisites (Appium, Accessibility permissions, etc.).
