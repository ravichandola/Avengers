# Desktop automation — Windows

Windows automation in this repository drives **native Windows applications** (Win32, WPF, and similar) through **`DesktopDriver`** and **`WindowsAdapter`**. Tests use the same **`IDriver`** surface as macOS (`click`, `fill`, `getTitle`, `getElements`, …) so your **spec structure** stays familiar; only the **selector semantics** and **runtime** change.

**New to Windows UI automation?** Read [**Windows automation from zero**](./windows-automation-from-zero.md) first — it explains layers, UIA, and how to write your first `*.desktop.spec.ts` in depth.

**Office / Graph / DPAPI (optional):** [.NET sidecar](./dotnet-sidecar.md)

**Shared concepts:** [Fixtures & `IDriver`](../common/fixtures-and-idriver.md) · **Stack diagram:** [Architecture overview §13.2](../architecture/overview.md#132-desktop-macos--windows) · **Desktop stack:** [architecture/desktop.md](../architecture/desktop.md)

---

## Table of contents

1. [When this guide applies](#1-when-this-guide-applies)
2. [Architecture on Windows (layers)](#2-architecture-on-windows-layers)
3. [Why each component exists](#3-why-each-component-exists)
4. [Prerequisites](#4-prerequisites)
5. [Configuration](#5-configuration)
6. [Launch and window state](#6-launch-and-window-state)
7. [Running tests](#7-running-tests)
8. [Writing tests](#8-writing-tests)
9. [Selectors and WindowsAdapter](#9-selectors-and-windowsadapter)
10. [Vision safety model](#10-vision-safety-model)
11. [Optional: .NET sidecar](#11-optional-net-sidecar)
12. [Disposable driver usage](#12-disposable-driver-usage)
13. [Troubleshooting](#13-troubleshooting)
14. [Related](#14-related)

---

## 1. When this guide applies

You run tests on **Windows** and automate **desktop apps**, not the browser projects (`*.browser.spec.ts`).

You share **one repo** with macOS desktop tests: same **`src/fixtures`**, same **`*.desktop.spec.ts`** naming; **Playwright project metadata** chooses **`platform: 'windows'`** vs **`'macos'`**.

---

## 2. Architecture on Windows (layers)

Data flows **down** from tests to the OS; elements, titles, and screenshots flow **up**.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  tests/**/*.desktop.spec.ts + tests/pom/desktop/**                      │
│  Uses fixture `app` → IDriver API                                       │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  playwright.config.ts — project `desktop-windows`                       │
│  metadata.platform = 'windows'  →  DriverFactory builds DesktopDriver   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  src/fixtures/index.ts                                                  │
│  Auto-launch from @app= tag / DESKTOP_APP_NAME / metadata.desktop       │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DesktopDriver (src/drivers/desktop/desktop-driver.ts)                  │
│  Single façade: focus, click, fill, getElements, screenshot, …           │
│  Delegates to internal WindowsAdapter when config.platform === windows  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  WindowsAdapter (src/drivers/desktop/windows-adapter.ts)                │
│  UIA + PowerShell; PID-scoped focus; optional vision hooks                │
│  Optional: lazy .NET sidecar for Office / Graph / DPAPI (see §11)       │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Windows OS + target application (HWND, input queue, UIA providers)     │
└─────────────────────────────────────────────────────────────────────────┘
```

**MCP (IDE-time, parallel track):** `mcp/desktop-bridge.ts` uses the **same** `WindowsAdapter` instance pattern for **`scan_app`**, **`get_elements`**, etc. It does **not** replace Playwright — it **helps you discover** selectors and generate POMs while authoring tests.

---

## 3. Why each component exists

| Piece                         | Responsibility on Windows                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **`desktop-windows` project** | Ensures tests run with **`metadata.platform: 'windows'`** so the factory never accidentally instantiates `MacOSAdapter`. |
| **`DesktopDriver`**           | Keeps **one** stable `IDriver` type for cross-platform desktop specs and shared POM bases.                               |
| **`WindowsAdapter`**          | Centralizes all **Win32/UIA/PowerShell** quirks so tests never shell out directly.                                       |
| **`VisionProvider`**          | Optional **screenshot + LLM** path when AX names are missing; used via driver wrapper / MCP tools.                       |
| **`.NET sidecar`**            | Optional **COM + Graph + DPAPI** in an isolated process — see [dotnet-sidecar.md](./dotnet-sidecar.md).                  |
| **MCP bridge**                | **Human/agent** loop: inspect live tree, screenshot, codegen — faster than blind trial-and-error.                        |

---

## 4. Prerequisites

1. **Windows host** — physical PC, VM, or Windows CI agent with an **interactive** session suitable for UIA (organization-dependent for headless CI).
2. **Permissions** — the user running tests must be allowed to drive UI automation; avoid **locked** sessions if your stack requires a visible desktop.
3. **PowerShell** — adapter runs encoded scripts; respect your org’s **execution policy** if locked down.
4. **Optional .NET 8 SDK** — only if you use the [Office / Graph sidecar](./dotnet-sidecar.md).

---

## 5. Configuration

### File naming

Use **`*.desktop.spec.ts`**. The **platform** is determined by the Playwright **project**, not the file name alone.

### Playwright project

In `playwright.config.ts`, **`desktop-windows`** sets:

```ts
metadata: {
  platform: "windows";
}
```

`DriverFactory` then creates **`DesktopDriver`**, which constructs **`WindowsAdapter`** on **`launch()`**.

### Environment and tags

| Mechanism                                                 | Effect                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| **`@app=Notepad`** in test title                          | Fixture passes **`name: 'Notepad'`** into launch when auto-launch applies |
| **`DESKTOP_APP_NAME`** in `.env` / `desktop.env`          | Default app when no `@app=` tag                                           |
| **`@windowState=maximized`** (or `normal` / `fullscreen`) | Overrides initial window state                                            |
| **`@platform=windows`** in title                          | Forces Windows adapter even if you duplicate project metadata (rare)      |

See [Environment variables](../configuration/environment.md) for file layering.

---

## 6. Launch and window state

| Option            | Purpose                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **`name`**        | **Required** for launch — string used to resolve the process/window (adapter-specific normalization, e.g. `.exe` handling) |
| **`pid`**         | Optional attachment when you already know the process id                                                                   |
| **`windowState`** | `normal` \| `maximized` \| `fullscreen` (fixture default is **`maximized`**)                                               |

Example:

```typescript
await app.launch({ name: "Notepad", windowState: "maximized" });
```

### Window-state behavior on Windows

- **`maximized`** (default): `ShowWindow(SW_MAXIMIZE)` on the resolved app window.
- **`fullscreen`**: borderless fullscreen sized to the monitor.
- **`normal`**: no post-launch window-state mutation.

---

## 7. Running tests

On **Windows**:

```bash
npx playwright test --project=desktop-windows
```

You can add a script in `package.json` (optional):

```json
"test:desktop-win": "npx playwright test --project=desktop-windows"
```

### CI

Use a **Windows** runner (`windows-latest`, self-hosted Windows, Azure DevOps Windows queue). **Linux agents cannot execute native Windows UIA tests.**

---

## 8. Writing tests

Same **fixture shape** as macOS:

```typescript
import { test, expect } from "../../src/fixtures";

test("opens Notepad @app=Notepad", async ({ app }) => {
  const title = await app.getTitle();
  expect(title.length).toBeGreaterThan(0);
});
```

If you **share** one spec file between macOS and Windows projects, guard with:

```typescript
test.skip(process.platform !== "win32", "Windows only");
```

(or the inverse for macOS-only flows).

---

## 9. Selectors and WindowsAdapter

**Selectors are not CSS.** They are matched against **UI Automation–backed** element data exposed by **`getElements()`** — typically **name**, **automation id**, **localized control type**, depending on adapter resolution logic in **`windows-adapter.ts`**.

**Workflow:**

1. Prefer **stable AutomationId** from your application team.
2. Use **`await app.getElements()`** in a scratch test or MCP **`get_elements`** to copy exact strings.
3. Wrap repeated flows in **POM** classes under **`tests/pom/desktop/`** extending **`DesktopPage`**.

---

## 10. Vision safety model

When vision fallback runs on desktop:

1. **Focus** is tied to the **connected PID**.
2. **Capture** is **window-scoped** when bounds exist (not arbitrary full-desktop clicks without context).
3. **Coordinates** map from image space to screen space using **window bounds + DPI scale**.
4. **Out-of-window** mapped coordinates are **rejected** to reduce misclick risk.

This reduces cross-app leakage when multiple windows overlap.

---

## 11. Optional: .NET sidecar

For **Excel file operations**, **Word PDF export**, **Microsoft Graph mail**, or **DPAPI** secret storage, build **`OfficeInterop`** and use **`getSidecar()`**, **`WindowsAdapter`** typed helpers, or MCP **`office_action`** / **`manage_secret`**.

**UI tests for ordinary apps do not need the sidecar.** See [.NET sidecar](./dotnet-sidecar.md).

---

## 12. Disposable driver usage

Outside Playwright fixtures you can use **`createDesktopApp`**:

```typescript
// Import depth depends on spec location, e.g. from tests/desktop/:
import { createDesktopApp } from "../../src/drivers/desktop/desktop-driver";

await using app = await createDesktopApp({
  name: "Notepad",
  windowState: "maximized",
});
await app.fill("text_editor", "Hello from automation");
```

`await using` triggers **`Symbol.asyncDispose`** on scope exit (TypeScript 5.2+).

---

## 13. Troubleshooting

| Issue                   | What to check                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Runner is macOS / Linux | Only **`--project=desktop-windows`** on a **Windows** host drives UIA                                                           |
| Element not found       | Dump **`getElements()`**; align string with **AutomationId** or **Name**                                                        |
| Flaky focus             | Driver **auto-focuses** before `click` / `fill` / `keyPress` and verifies foreground **PID**                                    |
| Sidecar errors          | Binary built? See **`npm run sidecar:build`** and [dotnet-sidecar.md § Troubleshooting](./dotnet-sidecar.md#13-troubleshooting) |

---

## 14. Related

- **Beginner walkthrough:** [Windows automation from zero](./windows-automation-from-zero.md)
- **macOS desktop:** [macOS](./macos.md)
- **MCP tools (scan, POM, Office):** [Desktop bridge (MCP)](./mcp-bridge.md)
- **First test & setup:** [First test & setup](../configuration/first-test-and-setup.md)
- **Architecture hub:** [Desktop stack](../architecture/desktop.md)

[← Desktop hub](./README.md) · [Documentation home](../README.md)
