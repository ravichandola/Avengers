# Desktop documentation

Desktop automation drives **native macOS or Windows** apps through **`DesktopDriver`** and platform adapters.

| Guide                                                                 | What you will learn                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [**Windows automation from zero**](./windows-automation-from-zero.md) | **Beginner:** layers, UIA vs browser, first test, MCP workflow, glossary   |
| [**macOS**](./macos.md)                                               | Accessibility permissions, launching apps, examples                        |
| [**Windows**](./windows.md)                                           | UIA / PowerShell, architecture layers, runners, sidecar pointer            |
| [.NET sidecar](./dotnet-sidecar.md)                                   | Optional Office / Graph / DPAPI process, RPC, build, security              |
| [**Desktop bridge (MCP)**](./mcp-bridge.md)                           | MCP server for Cursor: scan apps, AX trees, vision, POM codegen, tools 8–9 |

**Architecture:** [Desktop stack](../architecture/desktop.md)  
**Shared concepts:** [Fixtures & `IDriver`](../common/fixtures-and-idriver.md)

**Projects:** `desktop-macos`, `desktop-windows` · **specs:** `*.desktop.spec.ts`

[← Documentation home](../README.md)
