# Desktop Bridge MCP Server

The desktop-bridge is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that gives Cursor (or any MCP-compatible client) real-time access to desktop applications. It bridges the gap between AI assistants and native app automation — Cursor can scan live apps, read their Accessibility trees, take screenshots, and generate Page Object Models.

---

## 1. What problem it solves

When writing desktop automation tests, you need to know:
- What app is running and what's its title?
- What UI elements exist (buttons, text fields, menus)?
- What selectors to use (Accessibility names/labels)?
- What the screen looks like right now?

The MCP bridge answers all of these from inside Cursor, without leaving the IDE. Cursor calls these tools during chat to auto-generate POM classes and test files.

---

## 2. File location

```
mcp/
├── desktop-bridge.ts     # The MCP server (all 7 tools)
└── tsconfig.json         # TypeScript config for the MCP server

.cursor/
└── mcp.json              # Tells Cursor how to launch the MCP server
```

---

## 3. How Cursor uses it

The `.cursor/mcp.json` configuration tells Cursor to launch the bridge:

```json
{
  "mcpServers": {
    "desktop-bridge": {
      "command": "npx",
      "args": [
        "ts-node",
        "--project",
        "mcp/tsconfig.json",
        "mcp/desktop-bridge.ts"
      ]
    }
  }
}
```

When you open the project in Cursor and enable MCP, the bridge starts automatically. Cursor can then call any of the 7 tools during Agent Mode conversations.

---

## 4. The 7 MCP tools

### Tool 1: `scan_app`

**Connect to a desktop app** and return its window title, PID, and platform.

| Parameter | Type | Description |
|-----------|------|-------------|
| `appName` | string | Application name (e.g. "Notes", "Calculator", "TV") |

**Example response:**
```json
{ "appName": "Notes", "title": "Notes", "platform": "darwin" }
```

**Use case:** Verify an app is running before scanning its elements.

---

### Tool 2: `get_elements`

**Read the Accessibility tree** of a running desktop app. Returns structured `UIElement` objects.

| Parameter | Type | Description |
|-----------|------|-------------|
| `appName` | string | Application name |
| `max` | number (optional) | Max elements to return (default: 100) |

**Example response (truncated):**
```json
[
  { "id": "ax-1", "name": "New Note", "role": "button", "enabled": true, "bounds": { "x": 10, "y": 50, "width": 80, "height": 30 } },
  { "id": "ax-2", "name": "Search", "role": "textField", "enabled": true, "bounds": { "x": 200, "y": 10, "width": 200, "height": 25 } }
]
```

**Use case:** Discover available selectors for POM generation and test writing.

---

### Tool 3: `screenshot`

**Capture a screenshot** of the desktop. Returns base64-encoded PNG.

| Parameter | Type | Description |
|-----------|------|-------------|
| `appName` | string | Application to bring to front before capturing |

**Returns:** Base64 PNG image.

**Prerequisites:** Screen Recording permission must be granted to the terminal/IDE.

---

### Tool 4: `describe_screen`

**Screenshot + GPT-4o vision** to describe what's on screen in natural language.

| Parameter | Type | Description |
|-----------|------|-------------|
| `appName` | string | Application to screenshot and describe |

**Requires:** `OPENAI_API_KEY` in environment.

**Use case:** When you need a human-readable description of the current app state for context.

---

### Tool 5: `locate_element`

**Vision-based element location** — describe an element in natural language, get its center coordinates.

| Parameter | Type | Description |
|-----------|------|-------------|
| `appName` | string | Application to search in |
| `description` | string | Natural-language description (e.g. "the Save button", "email text field") |

**Example response:**
```json
{ "x": 450, "y": 320 }
```

**Requires:** `OPENAI_API_KEY` in environment.

**Use case:** When AX tree selectors are insufficient and you need coordinate-based interaction.

---

### Tool 6: `generate_pom`

**Scan an app's Accessibility tree and generate a DesktopPage POM** class file.

| Parameter | Type | Description |
|-----------|------|-------------|
| `appName` | string | Application to scan |
| `className` | string | POM class name (e.g. "NotesScreen") |
| `updateIndex` | boolean (optional) | Append export to `tests/pom/index.ts` (default: true) |

**Output:** Writes `tests/pom/desktop/<kebab-class-name>.ts` with a `DesktopPage` subclass containing all AX elements as `ElementRef` properties.

**Example generated code:**
```typescript
import { DesktopPage } from '../../../src/drivers/desktop/pom/desktop-page';
import { DesktopDriver } from '../../../src/drivers/desktop/desktop-driver';

export class NotesScreen extends DesktopPage {
  readonly newNote = this.element("New Note");       // button
  readonly search = this.element("Search");          // textField
  readonly noteBody = this.element("Note Body");     // textArea

  constructor(driver: DesktopDriver) {
    super(driver);
  }
}
```

---

### Tool 7: `generate_test`

**Scaffold a Playwright desktop test** spec file that imports a POM.

| Parameter | Type | Description |
|-----------|------|-------------|
| `appName` | string | Application name (used in test title and `@app` tag) |
| `className` | string | POM class name to import |
| `intent` | string | Short description of what the test verifies |
| `fileName` | string (optional) | Output file name (default: `<kebab-app>.desktop.spec.ts`) |

**Output:** Writes `tests/desktop/<name>.desktop.spec.ts` with test scaffolding.

---

## 5. How to test manually

### Start the MCP server standalone

```bash
npx ts-node --project mcp/tsconfig.json mcp/desktop-bridge.ts
```

The server communicates via stdio (JSON-RPC). You can use [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test tools interactively.

### Test from Cursor

1. Open the project in Cursor
2. Check that MCP is enabled (Settings → MCP)
3. In Agent Mode, ask: "Scan the Notes app and show me its elements"
4. Cursor calls `scan_app` then `get_elements` automatically

### Verify permissions (macOS)

- **Accessibility:** System Settings → Privacy & Security → Accessibility → enable your terminal/IDE
- **Screen Recording:** System Settings → Privacy & Security → Screen Recording → enable your terminal/IDE

---

## 6. How to extend with new tools

### Step 1: Define the tool in `mcp/desktop-bridge.ts`

```typescript
server.tool(
  'my_new_tool',
  'Description of what the tool does.',
  {
    appName: z.string().describe('Application name'),
    myParam: z.string().describe('What this parameter is for'),
  },
  async ({ appName, myParam }) => {
    try {
      await ensureConnected(appName);
      // Your logic here
      return {
        content: [{ type: 'text' as const, text: 'result' }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err}` }],
        isError: true,
      };
    }
  },
);
```

### Step 2: Use shared state

The bridge maintains:
- `adapter` — `MacOSAdapter` or `WindowsAdapter` (auto-detected by platform)
- `vision` — `VisionProvider` for screenshot + GPT-4o vision
- `connectedApp` — currently connected app name
- `ensureConnected(appName)` — idempotent connection helper

### Step 3: Test

Restart Cursor (or reload MCP) to pick up the new tool. The tool will appear in Cursor's MCP tool list and can be called during agent conversations.

---

## 7. Internals

The bridge uses these framework components:

| Component | From | Used for |
|-----------|------|----------|
| `MacOSAdapter` | `src/drivers/desktop/macos-adapter.ts` | AX tree, clicks, screenshots on macOS |
| `WindowsAdapter` | `src/drivers/desktop/windows-adapter.ts` | UIA, PowerShell on Windows |
| `VisionProvider` | `src/vision/vision-provider.ts` | Screenshot → GPT-4o for describe/locate |
| `UIElement` | `src/core/types.ts` | Structured element data |

The POM generation helpers (`buildPomSource`, `buildTestSource`, etc.) are self-contained in the bridge file — they construct TypeScript source strings and write them to disk.
