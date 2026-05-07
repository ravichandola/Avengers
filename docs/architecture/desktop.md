# Desktop stack (architecture)

Desktop tests use one **`DesktopDriver`** façade. Behind it, the **platform** metadata (`macos` or `windows`) selects an **adapter** that knows how to drive native UI on that OS.

## macOS

- **Adapter:** `MacOSAdapter` — Accessibility, AppleScript / System Events, process targeting.  
- **Typical use:** launch by app **name**, interact via AX-oriented selectors (semantic names your layer maps to real UI).

## Windows

- **Adapter:** `WindowsAdapter` — UIA-oriented automation via PowerShell / bridge code in this repo.  
- **Typical use:** run tests on a **Windows** CI agent or workstation; do not expect the same adapter to run on macOS.

## POM layer

- **`DesktopPage`** extends **`DriverPage`** for shared ergonomics.  
- **`DesktopBlock`** scopes selectors (toolbar, panel, etc.).

## Diagram

See **§13.2** in [**overview.md**](./overview.md#132-desktop-macos--windows).

## Key source files

| File | Role |
|------|------|
| `src/drivers/desktop/desktop-driver.ts` | Chooses macOS vs Windows adapter |
| `src/drivers/desktop/macos-adapter.ts` | macOS implementation |
| `src/drivers/desktop/windows-adapter.ts` | Windows implementation |
| `src/drivers/desktop/pom/*` | Desktop POM bases |

## User guides

- [macOS](../desktop/macos.md)  
- [Windows](../desktop/windows.md)  
- [Desktop bridge (MCP)](../desktop/mcp-bridge.md)  

[← Architecture hub](./README.md) · [Documentation home](../README.md)
