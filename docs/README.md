# Desktop Agent — Documentation

Welcome. This framework gives you **one Playwright-style API** across browser, desktop (macOS / Windows), mobile (iOS / Android), and HTTP APIs. You write tests in TypeScript, pick a **project** in Playwright that matches your platform, and use shared **fixtures** (`app`, `api`, `auth`, …).

---

## Master index

## Top-to-bottom reading order

Use this if you want a single linear path through all docs.

1. [**Getting started**](./getting-started.md)
2. [**Architecture & porting**](./ARCHITECTURE.md)
3. [**Browser automation**](./browser-automation.md)
4. [**Desktop - macOS**](./desktop-macos.md)
5. [**Desktop - Windows**](./desktop-windows.md)
6. [**Mobile - iOS**](./mobile-ios.md)
7. [**Mobile - Android**](./mobile-android.md)
8. [**API testing**](./api-testing.md)
9. [**Auth & checkpoints**](./advanced-auth-and-checkpoints.md)
10. [**POM generator**](./pom-generator.md)
11. [**Desktop bridge MCP**](./desktop-bridge-mcp.md)
12. [**Eval framework**](./eval-framework.md)
13. [**LLM providers**](./llm-providers.md)

---

### Getting started

| Guide | What you'll learn |
|--------|-------------------|
| [**Getting started**](./getting-started.md) | Install, env vars, project layout, first test, first eval |

### Architecture & design

| Guide | What you'll learn |
|--------|-------------------|
| [**Architecture & porting**](./ARCHITECTURE.md) | Top-to-bottom layers, call chains, LLM vs vision, source file map, how to port |

### Eval framework & LLM providers

| Guide | What you'll learn |
|--------|-------------------|
| [**Eval framework**](./eval-framework.md) | LLM-as-judge, rule-based evals, alignment testing, bootstrap, self-consistency, how to write new evals |
| [**LLM providers**](./llm-providers.md) | OpenAI / Anthropic / Gemini provider layer, auto-detection, env vars, how to add a provider |

### Tooling

| Guide | What you'll learn |
|--------|-------------------|
| [**POM generator**](./pom-generator.md) | Scaffold POMs: browser DOM (`DOMScanner` / `--enhanced`), desktop AX, mobile XML, API JSON |
| [**Desktop bridge MCP**](./desktop-bridge-mcp.md) | MCP server for Cursor — scan apps, read AX trees, generate POMs from chat |

### Platform guides

| Guide | What you'll learn |
|--------|-------------------|
| [**Browser automation**](./browser-automation.md) | Chrome / Firefox / WebKit, auth profiles, multi-tab, selectors, **`network`** fixture, `PageObject` pattern |
| [**Desktop — macOS**](./desktop-macos.md) | Native apps, Accessibility, Apple TV–style flows |
| [**Desktop — Windows**](./desktop-windows.md) | UIA / PowerShell bridge, running tests on Windows |
| [**Mobile — iOS**](./mobile-ios.md) | Appium, XCUITest, bundle IDs, simulators |
| [**Mobile — Android**](./mobile-android.md) | Appium, UiAutomator2, packages & activities |
| [**API testing**](./api-testing.md) | REST, GraphQL, auth headers, base URL |

### Advanced

| Guide | What you'll learn |
|--------|-------------------|
| [**Auth & checkpoints**](./advanced-auth-and-checkpoints.md) | `.auth` profiles, checkpoint resume, `runSteps` |

---

## Quick commands

```bash
npm install
npx playwright install   # browser binaries

npm test                          # all projects
npm run test:chrome             # browser (Chrome project)
npm run test:desktop            # desktop-macos project
npm run test:mobile             # mobile-ios project
npm run test:api                # api project
npm run build                   # TypeScript compile
npm run pom:gen                 # auto-generate POM
```

## Test file naming (important)

Playwright **projects** filter tests by filename pattern:

| Pattern | Example | Typical projects |
|---------|---------|------------------|
| `*.browser.spec.ts` | `login.browser.spec.ts` | `chrome`, `firefox`, `webkit` |
| `*.desktop.spec.ts` | `notepad.desktop.spec.ts` | `desktop-macos`, `desktop-windows` |
| `*.mobile.spec.ts` | `login.mobile.spec.ts` | `mobile-ios`, `mobile-android` |
| `*.api.spec.ts` | `users.api.spec.ts` | `api` |

Put files under `tests/` (see `playwright.config.ts` → `testDir`).

## Need help?

- Configuration lives in **`playwright.config.ts`** (projects, timeouts, metadata).
- Shared test API: **`src/fixtures/index.ts`** (`app`, `pages`, `api`, `auth`, `checkpoint`, **`network`** on browser projects).
- Unified driver contract: **`src/core/base-driver.ts`** (`IDriver`).
- LLM provider setup: set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` in `.env`.
- Cursor rules: `.cursor/rules/desktop-automation.mdc` and `.cursor/rules/eval-framework.mdc`.

If something fails, check the platform guide for prerequisites (Appium, Accessibility permissions, etc.).
