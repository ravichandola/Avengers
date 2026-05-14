# Windows desktop automation — start here (beginner)

This guide is for you if you know **Playwright** or **testing** in general, but **not** how **native Windows apps** are automated, or how **this repository** wires everything together.

**What you will have after reading this:** a clear picture of **layers**, **what each piece is for**, and a **repeatable path** from “I have a Windows machine” to “I have a passing `*.desktop.spec.ts` test.”

**Related deep dives (read next):**

| Topic                                      | Document                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| Windows-specific config, launch, runners   | [Windows — desktop automation](./windows.md)                                          |
| Optional Office / Graph / DPAPI sidecar    | [.NET sidecar](./dotnet-sidecar.md)                                                   |
| Cursor MCP: scan app, AX tree, POM codegen | [Desktop bridge (MCP)](./mcp-bridge.md)                                               |
| How `app` is created, `IDriver` contract   | [Fixtures & `IDriver`](../common/fixtures-and-idriver.md)                             |
| Full stack diagram                         | [Architecture overview §13.2](../architecture/overview.md#132-desktop-macos--windows) |

---

## Table of contents

1. [What “Windows automation” means here](#1-what-windows-automation-means-here)
2. [How this differs from browser automation](#2-how-this-differs-from-browser-automation)
3. [The stack — layer by layer](#3-the-stack--layer-by-layer)
4. [Why each layer exists](#4-why-each-layer-exists)
5. [Concepts you must know: UIA and “selectors”](#5-concepts-you-must-know-uia-and-selectors)
6. [End-to-end path: from zero to your first test](#6-end-to-end-path-from-zero-to-your-first-test)
7. [Recommended workflow with Cursor (MCP)](#7-recommended-workflow-with-cursor-mcp)
8. [Page objects (POM) on Windows](#8-page-objects-pom-on-windows)
9. [Vision fallback (when AX is not enough)](#9-vision-fallback-when-ax-is-not-enough)
10. [Office / email / secrets (optional sidecar)](#10-office--email--secrets-optional-sidecar)
11. [CI and runners](#11-ci-and-runners)
12. [Troubleshooting cheat sheet](#12-troubleshooting-cheat-sheet)
13. [Glossary](#13-glossary)

---

## 1. What “Windows automation” means here

**Windows desktop automation** means: your test code drives **real Win32 / WPF / UWP-style applications** the same way a user would — **keyboard**, **mouse**, **window focus**, reading **what controls exist** — but **without** opening a browser document (that is a different Playwright project in this repo).

In **desktop-agent**, that work is done through:

- **Playwright Test** — runs the spec file, reports results, parallel workers (same harness you use for browser tests).
- **A desktop driver** — implements the shared **`IDriver`** contract (`click`, `fill`, `getTitle`, …).
- **A Windows adapter** — translates those calls into **Windows UI Automation (UIA)** and **PowerShell** (implementation detail in `windows-adapter.ts`).

You **do not** embed C# in your tests. You write **TypeScript**. Optional **.NET sidecar** processes exist only for **Office / Graph / DPAPI** (see [dotnet-sidecar.md](./dotnet-sidecar.md)).

---

## 2. How this differs from browser automation

| Aspect                  | Browser (`*.browser.spec.ts`)             | Desktop Windows (`*.desktop.spec.ts`)                             |
| ----------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| **What you automate**   | A page inside Chromium / Firefox / WebKit | **Native OS windows** (Notepad, your LOB app, etc.)               |
| **Primary “locator”**   | CSS, role, text, test-id                  | **Accessibility-style names** / labels the adapter maps to UIA    |
| **Playwright’s `page`** | Central object                            | **Not used** for native UI; you use fixture **`app`** (`IDriver`) |
| **Where it runs**       | Any OS with browser binaries              | **Windows** session for real UIA (VM or physical PC)              |
| **Permissions**         | Browser sandbox                           | Interactive desktop, automation rights                            |

Same mental model: **arrange → act → assert**. Different **plumbing** under `app.click(...)`.

---

## 3. The stack — layer by layer

Think of data and commands flowing **down** from your test to the OS, and **state** (titles, elements, screenshots) flowing **back up**.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  YOUR TESTS                                                             │
│  tests/**/*.desktop.spec.ts                                             │
│  tests/pom/desktop/*.ts (optional Page Objects)                         │
│                                                                         │
│  You call: app.launch(...), app.click('Save'), app.getElements(), …     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PLAYWRIGHT TEST + FIXTURES                                           │
│  playwright.config.ts  →  project metadata.platform = 'windows'       │
│  src/fixtures/index.ts  →  builds `app`, auto-launch, auto-close       │
│                                                                         │
│  Reason: one entry point so every platform shares `test` / `expect`.   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DRIVER FACTORY + CONFIG (optional vision wrap)                        │
│  src/core/driver-factory.ts, src/core/config.ts, env-loader             │
│                                                                         │
│  Reason: pick DesktopDriver, merge retry/vision from env.               │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DESKTOP FACADE — IDriver                                               │
│  src/drivers/desktop/desktop-driver.ts → DesktopDriver                  │
│                                                                         │
│  Reason: one class for tests; inside it switches macOS vs Windows.      │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                    platform === 'windows'
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  WINDOWS ADAPTER                                                        │
│  src/drivers/desktop/windows-adapter.ts → WindowsAdapter                │
│  UIA + PowerShell (+ optional lazy .NET sidecar for Office/DPAPI)       │
│                                                                         │
│  Reason: Node/TS cannot host Office COM or DPAPI cleanly; UIA via PS.   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  OPERATING SYSTEM + TARGET APP                                          │
│  HWND, focus, input injection, UIA tree                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

**Optional parallel branch (only when you call it):**

```text
WindowsAdapter  ──lazy import──▶  dotnet-bridge.ts  ──stdio JSON──▶  OfficeInterop.exe
                                                                 (Excel/Word/Graph/DPAPI)
```

That branch is **not** in the hot path for normal `click` / `fill` / Notepad tests.

---

## 4. Why each layer exists

| Layer                         | Primary responsibility                                    | Why not “just one script”?                                                   |
| ----------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Spec file**                 | Express **business behavior** and assertions              | Keeps OS details out of scenarios                                            |
| **Playwright project**        | Select **OS platform** (`desktop-windows`) and metadata   | Same spec file name can target macOS or Windows **by project**, not by edits |
| **Fixtures (`app`)**          | **Lifecycle**: create driver, launch, dispose             | Prevents leaks; uniform `async ({ app })` ergonomics                         |
| **DesktopDriver**             | Stable **`IDriver`** API for **both** macOS and Windows   | Tests stay portable at the **call** level                                    |
| **WindowsAdapter**            | **Windows-only** primitives: find window, UIA tree, input | Encapsulates PowerShell / UIA quirks                                         |
| **VisionProvider** (optional) | Screenshot + LLM for locate/describe                      | When AX names are missing or flaky                                           |
| **DotNet sidecar** (optional) | Office COM, Graph, DPAPI                                  | Isolated process; not required for basic UI tests                            |
| **MCP desktop-bridge**        | **IDE-time** discovery and codegen                        | Humans/agents inspect live apps without writing boilerplate                  |

---

## 5. Concepts you must know: UIA and “selectors”

**UI Automation (UIA)** is Microsoft’s accessibility API. Most well-behaved Windows controls expose:

- **Name** — what a screen reader might say
- **AutomationId** — stable ID when developers set it
- **Control type** — button, edit, list, …

This framework’s **`getElements()`** returns a normalized list (**`UIElement`**): roles, names, bounds, etc. Your **`click('Something')`**-style selector is matched against those fields **inside `WindowsAdapter`** (not CSS).

**Practical advice:**

1. Prefer **AutomationId** in the app under test (ask devs).
2. If you only have fuzzy names, use **`get_elements`** via MCP or `await app.getElements()` and **copy the exact string** that works.
3. Treat **dynamic** names (e.g. including timestamps) as **bad selectors** — negotiate test hooks with the app team.

---

## 6. End-to-end path: from zero to your first test

### Step A — Machine and repo

1. **Windows 10/11** (local or VM) with a **logged-in interactive session** (UI automation does not run usefully on a headless “no desktop” session in the way Linux headless browsers do).
2. Clone the repo, **`npm install`**, **`npx playwright install`** (browser step is optional if you only run desktop).
3. Copy env guidance from [First test & setup](../configuration/first-test-and-setup.md) and [Environment variables](../configuration/environment.md). For vision features, you need provider keys (e.g. `OPENAI_API_KEY`).

### Step B — Pick the Playwright project

Run Windows desktop tests with:

```bash
npx playwright test --project=desktop-windows
```

`playwright.config.ts` ties **`desktop-windows`** to **`metadata.platform: 'windows'`**. That single flag is what makes **`DriverFactory`** choose **`WindowsAdapter`** under the hood.

### Step C — File naming

Create **`tests/desktop/my-first.desktop.spec.ts`**.

The **`*.desktop.spec.ts`** suffix is what matches the desktop projects’ `testMatch`.

### Step D — Minimal test body

```typescript
import { test, expect } from "../../src/fixtures";

test("Notepad shows a title @app=Notepad", async ({ app }) => {
  const title = await app.getTitle();
  expect(title.length).toBeGreaterThan(0);
});
```

**Why `@app=Notepad` in the title?** The fixture reads that tag and passes **`name: 'Notepad'`** into **`app.launch(...)`** automatically when `autoLaunch` is true. You can also set **`DESKTOP_APP_NAME`** in env or call **`await app.launch({ name: 'Notepad' })`** explicitly if you disabled auto-launch patterns.

### Step E — Run it

```bash
npx playwright test --project=desktop-windows tests/desktop/my-first.desktop.spec.ts
```

If the app is not installed, or the name does not match what the adapter resolves, you will get a clear connection error — fix the **display name / process image name** (see [windows.md](./windows.md)).

---

## 7. Recommended workflow with Cursor (MCP)

When you **do not** yet know the right selector strings:

1. **Run the target app** on Windows manually.
2. In Cursor, use the **desktop-bridge** MCP server ([mcp-bridge.md](./mcp-bridge.md)).
3. Call **`scan_app`** → **`get_elements`** to dump the tree.
4. Optionally **`generate_pom`** to scaffold **`tests/pom/desktop/...`**.
5. Import that POM in your spec and call **intent-named methods** (`await screen.saveDocument()` rather than raw `click` chains in every test).

**Reason:** MCP is an **accelerator** for discovery; Playwright still runs the **authoritative** test on CI.

---

## 8. Page objects (POM) on Windows

**Pattern:**

- **`DesktopPage`** (`src/drivers/desktop/pom/desktop-page.ts`) — base class for desktop POMs.
- **`tests/pom/desktop/<feature>-screen.ts`** — one class per screen or flow.
- **`constructor(driver: DesktopDriver)`** — receives the same driver type POMs use on macOS for symmetry.

**Reason:** When the AX tree changes in one place, you update **one POM**, not twenty tests.

---

## 9. Vision fallback (when AX is not enough)

If **`click('Foo')`** keeps failing because the control has no stable UIA name, the stack can use **screenshot + multimodal LLM** (see **`VisionProvider`**, **`VisionDriverWrapper`** in architecture docs).

**Safety model (Windows):** focus is tied to **PID**, capture is **window-scoped**, coordinates are **bounds- and DPI-aware**. Read [windows.md § Vision safety](./windows.md#vision-safety-model).

**Reason:** Vision is **slower** and **costs API tokens** — treat as fallback, not default.

---

## 10. Office / email / secrets (optional sidecar)

**Not** required for Notepad-style UI tests.

If you need **Excel file IO**, **Word PDF export**, **Graph mail**, or **DPAPI secret storage**, build the **.NET sidecar** and call **`getSidecar()`** or MCP tools **`office_action`** / **`manage_secret`**. Full detail: [dotnet-sidecar.md](./dotnet-sidecar.md).

---

## 11. CI and runners

- Use a **Windows** CI image (`windows-latest`, self-hosted Windows agent).
- Ensure the job runs in a context where **UI sessions** exist (some CI setups need RDP / interactive session tricks for full UIA — consult your org’s Windows test infra guide).
- Linux containers **cannot** substitute for native Windows UIA tests.

---

## 12. Troubleshooting cheat sheet

| Symptom                              | Likely cause                      | What to do                                                                                   |
| ------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `Process not found` / cannot connect | Wrong **`name`**, app not running | Match **Task Manager** process name / window title conventions in [windows.md](./windows.md) |
| Element not found                    | Selector string ≠ UIA name        | `get_elements` / MCP dump; prefer **AutomationId**                                           |
| Clicks go to wrong window            | Focus race                        | Driver **auto-focuses** before actions; avoid overlapping manual clicks during tests         |
| Works locally, fails in CI           | Headless / locked session         | Use interactive Windows agent                                                                |
| Vision errors                        | Missing key / quota               | Set provider env vars; reduce vision usage                                                   |
| Office tool errors                   | Sidecar not built                 | `npm run sidecar:build` on Windows                                                           |

---

## 13. Glossary

| Term                 | Meaning                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| **UIA**              | UI Automation — Windows accessibility API for trees and patterns       |
| **`IDriver`**        | Shared interface implemented by browser, desktop, mobile, API drivers  |
| **`DesktopDriver`**  | Facade that picks **Mac** vs **Windows** adapter                       |
| **`WindowsAdapter`** | Windows-specific UIA / PowerShell implementation                       |
| **Fixture `app`**    | Your test’s live driver instance (auto-closed after the test)          |
| **`@app=` tag**      | Playwright title tag read by fixtures to choose launch name            |
| **MCP**              | Model Context Protocol — IDE tools talking to `desktop-bridge.ts`      |
| **Sidecar**          | Separate **OfficeInterop.exe** process for optional Office/Graph/DPAPI |

---

[← Desktop hub](./README.md) · [Documentation home](../README.md)
