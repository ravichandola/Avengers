# .NET sidecar — Office, Graph, and DPAPI automation

This document describes the **optional** **.NET 8** sidecar (`OfficeInterop`) used for **Microsoft-specific** work that does not belong in the main **Node / TypeScript** automation path: **Excel** (file + live COM), **Word** COM, **Microsoft Graph** mail, and **DPAPI** secret storage.

**It is not required** for normal **UI Automation** tests (Notepad, line-of-business Win32/WPF apps, `click` / `fill` / `getElements`, etc.). If the sidecar executable is missing, **only** sidecar entry points fail; **UIA + PowerShell + vision** keep working.

**Audience:** engineers wiring **Office** workflows, **Graph** mail from tests or MCP, or **machine-local secret blobs** on Windows.

**Beginner context:** [Windows automation from zero](./windows-automation-from-zero.md) · **MCP tools:** [Desktop bridge](./mcp-bridge.md) · **Windows UI:** [windows.md](./windows.md)

---

## Table of contents

1. [Role in the architecture](#1-role-in-the-architecture)
2. [Why a separate process](#2-why-a-separate-process)
3. [Layer diagram and ownership](#3-layer-diagram-and-ownership)
4. [Process lifecycle](#4-process-lifecycle)
5. [Wire protocol (stdio JSON)](#5-wire-protocol-stdio-json)
6. [RPC methods reference](#6-rpc-methods-reference)
7. [TypeScript bridge](#7-typescript-bridge)
8. [WindowsAdapter extensions](#8-windowsadapter-extensions)
9. [MCP integration](#9-mcp-integration)
10. [Build, publish, and paths](#10-build-publish-and-paths)
11. [Microsoft Graph and `mailbox`](#11-microsoft-graph-and-mailbox)
12. [Security and DPAPI](#12-security-and-dpapi)
13. [Troubleshooting](#13-troubleshooting)
14. [Source map](#14-source-map)

---

## 1. Role in the architecture

The repository splits **desktop UI** from **Office/COM/Graph/DPAPI** deliberately:

| Concern                                             | Primary implementation                              | Runs in         |
| --------------------------------------------------- | --------------------------------------------------- | --------------- |
| Window focus, UIA tree, SendKeys-style input        | `WindowsAdapter` + PowerShell                       | Node.js process |
| Screenshot + multimodal locate/describe             | `VisionProvider`                                    | Node.js process |
| Excel **workbook file** read/write without Excel UI | **ClosedXML** in sidecar                            | .NET process    |
| Excel **macros**, Word automation                   | **COM interop** in sidecar                          | .NET process    |
| Send mail / read inbox via **Graph API**            | **Microsoft.Graph** + **Azure.Identity** in sidecar | .NET process    |
| Encrypt/decrypt with **user-scoped DPAPI**          | `ProtectedData` in sidecar                          | .NET process    |

**Reason:** COM apartments, Office licensing, and DPAPI are **Windows-desktop concerns**. Spawning a **small executable** keeps the main TypeScript stack **cross-platform at build time** and avoids loading Office assemblies into **every** test worker.

---

## 2. Why a separate process

1. **Isolation** — A bad COM object or hung Excel does not corrupt the Node test runner’s memory space.
2. **Optional dependency** — macOS and Linux developers never need the `.exe`; CI that only runs UIA can skip `dotnet publish`.
3. **Clear failure mode** — Missing binary → **one** predictable error from `DotNetBridge`, not obscure native addon load failures.
4. **Single channel** — **stdin/stdout** lines are easy to log, replay, and reason about compared to embedding CLR in Node.

---

## 3. Layer diagram and ownership

```mermaid
flowchart TB
  subgraph ts [TypeScript — same repo]
    WD[DesktopDriver]
    WA[WindowsAdapter]
    DB[dotnet-bridge.ts — DotNetBridge / getSidecar]
    MCP[mcp/desktop-bridge.ts — office_action / manage_secret]
  end
  subgraph net [.NET 8 — optional]
    EXE[OfficeInterop.exe]
    EX[ExcelService — ClosedXML + COM]
    WO[WordService — COM]
    OU[OutlookService — Graph SDK]
    SE[SecretsService — DPAPI]
  end
  WD --> WA
  WA -. lazy dynamic import .-> DB
  MCP -. dynamic import .-> DB
  DB -->|spawn stdio| EXE
  EXE --> EX
  EXE --> WO
  EXE --> OU
  EXE --> SE
```

**Ownership rules (as implemented):**

- **`DesktopDriver`** does **not** know about the sidecar — keeps the façade stable.
- **`WindowsAdapter`** exposes **typed** helpers that delegate to **`getSidecar().call(...)`** via **dynamic `import()`** so **`dotnet-bridge`** is not loaded on macOS bundles.
- **MCP** tools call **`getSidecar()`** directly for agent-driven workflows.

---

## 4. Process lifecycle

1. **No process** at Node startup.
2. On **first** `DotNetBridge.call()` or first **`getSidecar()`** use, the bridge checks for **`OfficeInterop.exe`**, spawns it with **hidden window**, pipes **stdin/stdout**.
3. The sidecar prints **one** JSON line `{"ready":true}` (camelCase) before accepting work. The bridge waits (bounded timeout) for that signal.
4. Each request is **one JSON object** on a **single line** (newline-delimited JSON).
5. Each response is **one JSON line** with **`ok`** / **`data`** or **`ok: false`** / **`error`**.
6. **`dispose()`** closes readline, ends stdin, kills the process — used rarely because the singleton is usually process-lifetime.

---

## 5. Wire protocol (stdio JSON)

**Request shape:**

```json
{
  "method": "excel.read_cell",
  "args": { "file": "C:\\tmp\\book.xlsx", "cell": "A1" }
}
```

**Success response:**

```json
{ "ok": true, "data": { "value": "hello" } }
```

**Error response:**

```json
{
  "ok": false,
  "method": "excel.read_cell",
  "error": "Could not find file '...'."
}
```

**Serialization:** UTF-8; property names are **camelCase** in both directions (case-insensitive deserialize on the C# side).

**Ping:**

```json
{ "method": "ping", "args": {} }
```

→ `data: { "pong": true }` — useful for smoke tests.

---

## 6. RPC methods reference

### Excel

| Method             | Purpose                                                  | Notable args                   | Returns (inside `data`) |
| ------------------ | -------------------------------------------------------- | ------------------------------ | ----------------------- |
| `excel.read_cell`  | Read one cell from **first worksheet**                   | `file`, `cell` (e.g. `A1`)     | `{ value: string }`     |
| `excel.write_cell` | Write one cell, save workbook                            | `file`, `cell`, `value`        | `{ written: true }`     |
| `excel.read_range` | Read rectangular range as string grid                    | `file`, `range` (e.g. `A1:C3`) | `{ rows: string[][] }`  |
| `excel.run_macro`  | Open workbook in **Excel COM**, run VBA/macro name, save | `file`, `macro`                | `{ ran: true }`         |

**Implementation note:** Read/write/range use **ClosedXML** (pure .NET, no Excel install). **`excel.run_macro`** requires **Excel installed** and may show transient COM behavior — use only when necessary.

### Word

| Method             | Purpose                                          | Args                       | Returns                      |
| ------------------ | ------------------------------------------------ | -------------------------- | ---------------------------- |
| `word.open`        | Validate file exists (does not start Word)       | `file`                     | `{ opened: true, file }`     |
| `word.insert_text` | Open doc, replace **bookmark** text, save, close | `file`, `bookmark`, `text` | `{ inserted: true }`         |
| `word.export_pdf`  | Open doc, export PDF, close                      | `file`, `output`           | `{ exported: true, output }` |

**Requires:** Word installed for `word.insert_text` / `word.export_pdf`.

### Outlook / Microsoft Graph

| Method               | Purpose                  | Args                                                                                    | Returns               |
| -------------------- | ------------------------ | --------------------------------------------------------------------------------------- | --------------------- |
| `outlook.send_email` | POST send mail via Graph | `tenantId`, `clientId`, `clientSecret`, `to`, `subject`, `body`; optional **`mailbox`** | `{ sent: true }`      |
| `outlook.list_inbox` | GET messages             | same creds + optional `top` (default 10); optional **`mailbox`**                        | `{ messages: [...] }` |

**Important:** Without **`mailbox`**, the client uses the **`/me`** send/list surface, which matches **delegated** (user) flows. For **client credentials** (app-only), supply **`mailbox`** (UPN or user id) so the sidecar calls **`/users/{mailbox}/...`**. Never commit secrets — use CI secret stores or DPAPI + env indirection.

### Secrets (DPAPI)

| Method            | Purpose                                                          | Args            | Returns                  |
| ----------------- | ---------------------------------------------------------------- | --------------- | ------------------------ |
| `secrets.encrypt` | Protect UTF-8 string, write `%APPDATA%\desktop-agent\<name>.enc` | `name`, `value` | `{ stored: true, name }` |
| `secrets.decrypt` | Read file, unprotect                                             | `name`          | `{ value: string }`      |

**Scope:** **CurrentUser** DPAPI — secrets are **not** portable across Windows users or machines.

---

## 7. TypeScript bridge

**File:** `src/drivers/desktop/dotnet-bridge.ts`

**Exports:**

- **`class DotNetBridge`** — `call(method, args)`, `dispose()`, `[Symbol.asyncDispose]`
- **`getSidecar()`** — process-wide singleton (stateless RPC; one channel is enough)

**Executable resolution:** After `dotnet publish`, the bridge prefers:

`sidecar/OfficeInterop/bin/Release/net8.0-windows/publish/OfficeInterop.exe`

and falls back to the non-publish build output path if present.

**Fixture note:** Playwright’s **`app`** fixture is typed as **`IDriver`** / **`DesktopDriver`**. It does **not** automatically expose **`excelReadCell`** — either:

- Call **`getSidecar().call(...)`** from tests or helpers, or
- Use a harness that holds **`WindowsAdapter`** directly, or
- Use MCP **`office_action`** from Cursor.

Typed convenience methods live on **`WindowsAdapter`** (see below).

---

## 8. WindowsAdapter extensions

**File:** `src/drivers/desktop/windows-adapter.ts` (additive section at end of class)

Examples: **`excelReadCell`**, **`wordExportPdf`**, **`secretsSave`**, **`outlookListInbox`**, …

Each uses **`await import('./dotnet-bridge')`** then **`getSidecar().call(...)`** so the bridge module loads **only** when you first touch Office/secret APIs.

---

## 9. MCP integration

**Tools (stdio MCP server):**

| Tool                | When to use                                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| **`office_action`** | Agent supplies `action` enum + `args` record for any row in §6                 |
| **`manage_secret`** | High-level **save** / **load** mapped to `secrets.encrypt` / `secrets.decrypt` |

**Platform guard:** On non-Windows, both tools return a short **Windows-only** message with **`isError: true`** — no native crash.

Details and parameter schemas: [mcp-bridge.md](./mcp-bridge.md).

---

## 10. Build, publish, and paths

**Prerequisites:** Windows machine (or cross-publish setup your org supports), **.NET 8 SDK**.

**Scripts (from repo root `package.json`):**

| Script                      | Command purpose                                                              |
| --------------------------- | ---------------------------------------------------------------------------- |
| **`npm run sidecar:build`** | `dotnet publish` Release, not self-contained (`-p:SelfContained=false`)      |
| **`npm run sidecar:clean`** | `dotnet clean` the project                                                   |
| **`npm run sidecar:ping`**  | `dotnet run` — should print **`{"ready":true}`** then exit when stdin closes |

**Git:** `sidecar/*/bin/` and `sidecar/*/obj/` are ignored — binaries are **local build artifacts**.

---

## 11. Microsoft Graph and `mailbox`

Graph **application permissions** with a client secret typically **do not** have a **`Me`** identity. Pass:

```json
"mailbox": "automation-bot@contoso.com"
```

in **`office_action`** `args` (or extend your own harness) so the sidecar targets **`Users[mailbox]`** instead of **`Me`** for **send** and **list inbox**.

---

## 12. Security and DPAPI

- **DPAPI blobs** are **opaque** on disk (`*.enc`) — they are **not** plaintext secrets.
- **Sidecar stderr** should not be used to print secret values (current services avoid that).
- **Graph credentials** belong in **secret managers** / pipeline variables — never in repo or POM source.
- **`manage_secret` load** returns the **plaintext** to the MCP client — treat MCP session logs as sensitive when using that tool.

---

## 13. Troubleshooting

| Problem                        | Likely cause                                        | Fix                                              |
| ------------------------------ | --------------------------------------------------- | ------------------------------------------------ |
| `sidecar not found`            | No publish/build on this machine                    | Run **`npm run sidecar:build`** on Windows       |
| `Sidecar did not signal ready` | Exe crashed on start (missing VC runtime, bad tfm)  | Run **`sidecar:ping`** in a console; read stderr |
| COM errors on macro / Word     | Office not installed / repair                       | Install Office; retry                            |
| Graph 401/403                  | Wrong tenant/app registration or missing permission | Azure Portal: API permissions, admin consent     |
| `Me` not allowed               | App-only context                                    | Add **`mailbox`** (see §11)                      |
| Decrypt fails                  | Different Windows user                              | DPAPI is per-user; re-save under the test user   |

---

## 14. Source map

| Path                                         | Role                                           |
| -------------------------------------------- | ---------------------------------------------- |
| `sidecar/OfficeInterop/OfficeInterop.csproj` | SDK project, packages, `net8.0-windows`        |
| `sidecar/OfficeInterop/Program.cs`           | stdin loop, dispatch, ready line               |
| `sidecar/OfficeInterop/RpcRequest.cs`        | DTO for inbound line                           |
| `sidecar/OfficeInterop/ExcelService.cs`      | ClosedXML + Excel COM macro                    |
| `sidecar/OfficeInterop/WordService.cs`       | Word COM                                       |
| `sidecar/OfficeInterop/OutlookService.cs`    | Graph + optional mailbox routing               |
| `sidecar/OfficeInterop/SecretsService.cs`    | DPAPI file helpers                             |
| `src/drivers/desktop/dotnet-bridge.ts`       | Spawn, queue, JSON lines                       |
| `src/drivers/desktop/windows-adapter.ts`     | Typed wrappers + lazy import                   |
| `mcp/desktop-bridge.ts`                      | **`office_action`**, **`manage_secret`** tools |

---

[← Desktop hub](./README.md) · [Documentation home](../README.md)
