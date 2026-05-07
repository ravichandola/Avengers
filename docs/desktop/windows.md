# Desktop automation — Windows

Windows automation uses **UI Automation–style** interaction via **PowerShell / FlaUI-style adapters** in this framework. Tests still use **`app`** and the same **`IDriver`** surface as macOS.

## When is this guide for you?

You run tests on **Windows** and automate **desktop apps** (Win32, WPF, etc.), not the browser projects.

**Shared concepts:** [Fixtures & `IDriver`](../common/fixtures-and-idriver.md). **Stack diagram:** [Architecture overview §13.2](../architecture/overview.md#132-desktop-macos--windows).

## Prerequisites

1. **Windows host** — run Playwright on a Windows machine or VM.
2. **Permissions** — the user running tests must be allowed to drive UI automation (session not locked if your stack requires an interactive desktop).
3. **Optional:** Install any runtime your adapter expects (e.g. PowerShell execution policy for scripts).

## Configuration

### File naming

Use **`*.desktop.spec.ts`**. The **platform** is determined by the Playwright **project**:

- `desktop-windows` → `metadata.platform: 'windows'`

### Playwright project

In `playwright.config.ts`, **`desktop-windows`** sets:

```ts
metadata: { platform: 'windows' }
```

`DriverFactory` then creates **`DesktopDriver`** with the **Windows** adapter.

### Launch options

| Option | Purpose |
|--------|---------|
| **`name`** | **Required** — window/application identification string your adapter uses |
| `pid` | Optional process attachment when supported |
| `windowState` | Optional: `normal` \| `maximized` \| `fullscreen` (default is `maximized`) |

Example:

```typescript
await app.launch({ name: 'Notepad', windowState: 'maximized' });
```

### Window-state behavior on Windows

- `maximized` (default): uses `ShowWindow(SW_MAXIMIZE)` on the resolved app window.
- `fullscreen`: applies borderless fullscreen (monitor-sized, caption/border removed).
- `normal`: no post-launch window-state change.

## Running tests

On **Windows**:

```bash
npx playwright test --project=desktop-windows
```

You can add an npm script mirroring macOS, e.g. in `package.json`:

```json
"test:desktop-win": "npx playwright test --project=desktop-windows"
```

### CI tip

Use a **Windows** runner (GitHub Actions `windows-latest`, Azure DevOps Windows agent, etc.). Linux agents cannot run native Windows UI tests.

## Writing tests

Same shape as macOS:

```typescript
import { test, expect } from '../../src/fixtures';

test('opens Notepad', async ({ app }) => {
  await app.launch({ name: 'Notepad' });
  await app.fill('text_editor', 'Hello from automation');
});
```

Selector strings map through your **Windows adapter** (automation id, name, etc.). Coordinate with how **`WindowsAdapter`** resolves targets in code.

### Platform-specific skips (optional)

If you share one repo between Mac and Windows CI:

```typescript
test.skip(process.platform !== 'win32', 'Windows only');
```

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Runner is macOS / Linux | Use `--project=desktop-windows` only on Windows |
| Element not found | Prefer stable **AutomationId** in the app; align selector naming with adapter |
| Flaky focus | Driver now auto-focuses before click/fill/keyPress and verifies foreground ownership by PID |

## Vision safety model

For vision fallback on desktop:

1. Window focus is PID-verified.
2. Capture is window-scoped (not whole desktop).
3. Coordinates are translated from image-space to screen-space using bounds + DPI scale.
4. Out-of-window coordinates are rejected.

This reduces cross-app misclick risk when multiple windows are visible.

## Disposable driver usage

```typescript
import { createDesktopApp } from '../src/drivers/desktop/desktop-driver';

await using app = await createDesktopApp({ name: 'Notepad', windowState: 'maximized' });
await app.fill('text_editor', 'Hello from automation');
```

## Related

- **macOS desktop:** [macOS](./macos.md)  
- **First test & setup:** [First test & setup](../configuration/first-test-and-setup.md)  
