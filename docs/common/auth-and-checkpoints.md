# Advanced: saved browser auth & resume-from-failure

These features sit on top of browser automation: **named login profiles** (`.auth/*.json`) and **step checkpoints** (`.checkpoints/*`) for resuming long flows.

## Saved auth profiles (`AuthManager`)

### Why use it?

Logging in through the UI on every run is slow and flaky. After one successful login, Playwright can persist **cookies + localStorage** to a file and reload it next time.

### Where files live

- **Directory:** `.auth/` (created automatically; listed in `.gitignore`)
- **Format:** Playwright **`storageState`** JSON  
- **Naming:** `.auth/{profileName}.json`

### Setup API

`AuthManager` lives in **`src/auth/auth-manager.ts`**.

| Method | Purpose |
|--------|---------|
| `setupProfile(name, loginFn, browser)` | Runs **`loginFn(driver)`** once with a **`BrowserDriver`**, saves state |
| `exists(name)` | Whether profile file exists |
| `loadProfile(name)` | Returns path string for `storageState` |
| `saveProfile(name, context)` | Save from an existing context |
| `deleteProfile(name)` | Remove a profile |

**Important:** `loginFn` receives **`IDriver`**, not a raw Playwright `page` — use **`driver.navigate`**, **`driver.fill`**, **`driver.click`**, etc.

### Using a profile in tests

```typescript
await app.launch({
  url: 'https://app.example.com/home',
  authProfile: 'admin',
});
```

Or pass a raw file path:

```typescript
await app.launch({
  url: 'https://app.example.com',
  storageStatePath: '/path/to/state.json',
});
```

### First-time bootstrap

```typescript
import { AuthManager } from '../../src/auth/auth-manager';

await AuthManager.setupProfile('admin', async (driver) => {
  await driver.navigate('https://app.example.com/login');
  await driver.fill('email', process.env.ADMIN_EMAIL!);
  await driver.fill('password', process.env.ADMIN_PASSWORD!);
  await driver.click('submit');
  await driver.waitFor('dashboard');
}, browser);
```

(`browser` comes from Playwright’s **`{ browser }`** fixture in a test that has browser context.)

## Drop-in copy (`src/session/copyable/`)

To reuse checkpoints **outside** this repo, copy the folder **`src/session/copyable/`** (TypeScript sources + `COPY_AND_INTEGRATE.md`). It only needs Playwright + Node. Same logic powers `runSteps` here via a thin wrapper.

Imports from this package:

```typescript
import {
  runResumableSteps,
  resumeEnabledFromEnv,
  newContextFromStorageFile,
  PortableCheckpointManager,
} from '../../src/session';
```

Or copy the folder and import from `./copyable` in your project.

## Resume-from-failure (`runSteps` + `CheckpointManager`)

### Idea

For long UI flows, **`runSteps`** runs numbered steps and **checkpoints** browser **storage state + URL** after each successful step. If step **3** fails, a checkpoint exists after step **2**. When you **opt in** to resume, the next run **reloads** that storage state, **opens the saved URL**, and **continues from step 3** (skipping steps 0–2).

### Resume opt-in (`BROWSER_CHECKPOINT_RESUME`)

Playwright has no built-in `--history` flag. Use an environment variable (or npm script):

```bash
# Retry after fixing the failure — skip steps that already passed
BROWSER_CHECKPOINT_RESUME=true npx playwright test resumable-checkout --project=chrome
```

```bash
npm run test:chrome:resume -- resumable-checkout
```

If **`BROWSER_CHECKPOINT_RESUME` is not `true`**, each run starts from **step 0** with a normal browser context. Checkpoints are still **written** after each successful step so the next **resume** run has fresh data.

### Files

- **Metadata:** `.checkpoints/{sanitizedTestId}.json`
- **State:** `.checkpoints/{sanitizedTestId}.state.json`

Both are gitignored.

### Usage pattern

```typescript
import { test, expect, runSteps, Step } from '../../src/fixtures';
import { BrowserDriver } from '../../src/drivers/browser/browser-driver';

test('checkout flow', async ({ app }, testInfo) => {
  await app.launch({ url: 'https://shop.example.com' });

  const steps: Step[] = [
    { name: 'add item', fn: async (d) => { await d.click('add-to-cart'); } },
    { name: 'open cart', fn: async (d) => { await d.navigate('/cart'); } },
    // ...
  ];

  await runSteps({
    testId: testInfo.testId,
    driver: app,
    steps,
    getContext: () => (app as BrowserDriver).getContext(),
  });
});
```

On **full success**, checkpoints are **cleared**. If you need to force a clean slate, delete `.checkpoints/` between runs.

### Fixture: `checkpoint`

Tests can inject **`checkpoint`** (a **`CheckpointManager`** for the current test id) for custom flows outside **`runSteps`**.

## Vision fallback (optional)

If **`OPENAI_API_KEY`** is set and vision is enabled, failed UI actions may use GPT-4o against screenshots. Treat this as a **fallback**, not the primary locator strategy.

## Related

- [Browser automation](../browser/automation.md)  
- [First test & setup](../configuration/first-test-and-setup.md)  
