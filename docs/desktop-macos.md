# Desktop automation — macOS

Native macOS UI automation uses **Accessibility (AX)** via adapters (AppleScript / system bridges). Your tests still use the same **`app`** fixture and **`IDriver`** methods.

## When is this guide for you?

You automate **Mac apps** (e.g. Apple TV, Notes, Safari dialogs) on **macOS hosts**.

## Prerequisites

1. **Run tests on macOS** — desktop macOS projects are meant for a Mac runner (local Mac or macOS CI).
2. **Accessibility permission** — grant the terminal app (Terminal, iTerm, VS Code, Cursor) **Accessibility** access:
   - **System Settings → Privacy & Security → Accessibility**
   - Enable your IDE/terminal so it can control other apps.
3. **Optional:** For some flows, **Screen Recording** may be required depending on OS version and APIs used.

## Configuration

### File naming

Use **`*.desktop.spec.ts`**. Both `desktop-macos` and `desktop-windows` projects match this pattern; **platform** is chosen by **which project** you run.

### Playwright project

`desktop-macos` sets:

```ts
metadata: { platform: 'macos' }
```

That makes `DriverFactory` build a **`DesktopDriver`** with macOS adapters.

### Launch options (`launch`)

| Option | Purpose |
|--------|---------|
| **`name`** | **Required** — application name as understood by the adapter (e.g. `'TV'` for Apple TV) |
| `pid` | Optional attach by process id if your adapter supports it |

Example:

```typescript
await app.launch({ name: 'TV' });
```

## Running tests

From project root **on a Mac**:

```bash
npm run test:desktop
# equivalent to:
npx playwright test --project=desktop-macos
```

Single file:

```bash
npx playwright test --project=desktop-macos tests/desktop/apple-tv.desktop.spec.ts
```

### Skipping non-macOS runners

Example pattern from the sample suite:

```typescript
test.skip(process.platform !== 'darwin', 'macOS only');
```

Use this so Linux/Windows CI does not fail when desktop specs are collected.

## Writing tests

```typescript
import { test, expect } from '../../src/fixtures';

test.skip(process.platform !== 'darwin', 'macOS only');

test('open Apple TV', async ({ app }) => {
  await app.launch({ name: 'TV' });
  const title = await app.getTitle();
  expect(title.length).toBeGreaterThan(0);
});
```

### Selectors on macOS

Desktop adapters map your **string selector** to AX queries (labels, roles, etc.). Names like `signin_button` are **semantic** — your adapter layer must resolve them to real UI. Prefer stable accessibility labels in the app under test.

### Login flows & secrets

Use environment variables (never hardcode passwords):

```typescript
const email = process.env.APPLE_TV_EMAIL;
const password = process.env.APPLE_TV_PASSWORD;
test.skip(!email || !password, 'Set APPLE_TV_EMAIL and APPLE_TV_PASSWORD');

await app.launch({ name: 'TV' });
await app.click('signin_button');
await app.fill('apple_id_email_input', email!);
await app.fill('apple_id_password_input', password!);
await app.click('login_button');
```

Run:

```bash
APPLE_TV_EMAIL='you@example.com' APPLE_TV_PASSWORD='***' \
  npx playwright test --project=desktop-macos
```

## Vision fallback

If configured, failed structured steps may fall back to vision-based coordinates. Requires **`OPENAI_API_KEY`** when vision is enabled.

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| “App name required” | Pass `name:` to `launch()` |
| No UI interaction | Accessibility permission for your runner app |
| Wrong window | Ensure app is installed; use correct bundle/display name for `name` |
| Tests run on Linux CI | Skip or use a macOS runner for `.desktop.spec.ts` |

## Related

- **Windows desktop:** [desktop-windows.md](./desktop-windows.md)  
- **Unified API:** [getting-started.md](./getting-started.md)  
