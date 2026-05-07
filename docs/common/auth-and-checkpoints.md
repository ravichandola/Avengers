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
  uiResumeValidator,
  createResumableFlow,
  runSteps,
} from '../../src/session';
```

(`uiResumeValidator`, **`createResumableFlow`**, and **`runSteps`** are in-repo; copied projects use **`runResumableSteps`** options or copy the helper from **`src/session/resumable-steps.ts`**.)

Or copy the folder and import from `./copyable` in your project.

## Resume-from-failure (`runSteps` + `CheckpointManager`)

### Idea

For long UI flows, **`runSteps`** (or the **`resumable`** fixture) runs numbered steps and **checkpoints** browser **storage state + URL** after each successful step. If step **3** fails, a checkpoint exists after step **2**. When you **opt in** to resume, the next run **reloads** that storage state, **opens the saved URL**, and **continues from step 3** (skipping steps 0–2).

You can also save **mid-step** labels with **`resumable.checkpoint`** so a resume continues **inside** the same step after that label (see below).

The portable **`runResumableSteps`** helper respects **`subCheckpoint`** in metadata for **which step index** to run next; it does not inject mid-step APIs into your **`Step.fn`** — use **`createResumableFlow`** / **`resumable`** for **`checkpoint()`**. It also supports **`resumeKey`**, **`validateResume`**, and **`onResumeInvalidated`** (same semantics as below).

### When resume can lie (browser saved, server data gone)

Checkpoints only persist **browser** `storageState` and **URL**. They do **not** recreate database rows, drafts, or server-side disposable context. If you resume deep in a flow but the backend no longer has the entities those earlier steps created, the page may error, show an empty state, or become hard to automate.

Use one or more of:

| Mechanism | When to use |
|-----------|-------------|
| **`resumeKey`** | Optional string stored in checkpoint metadata on every save (e.g. seed version, build id, `E2E_DATASET` from CI). If the value on disk **≠** the value you pass on the next run, the checkpoint is **cleared before** any browser restore — early steps run again on the new dataset. |
| **`validateResume`** | After restore, run a quick check (API or UI). Return **`false`** → checkpoint cleared, flow runs from **step 0**. |
| **`uiResumeValidator(...)`** | Helper exported from **`src/fixtures`** / **`src/session`**: wraps a **UI-only** probe; **throws** or **`false`** → treated as failed validation (no DB access required). |
| **`onResumeInvalidated`** | Optional callback when validation fails: e.g. **`navigate`** to home so step 0 does not start on a broken deep link. |

**`createResumableFlow`** and **`runSteps`** accept these options. The built-in **`resumable`** fixture does **not** wire them; call **`createResumableFlow`** yourself when you need this behavior (or extend your own fixture).

### Playwright-native contract (`Page`)

For specs that prefer **`Page`** over **`IDriver`**, use **`ResumeOptions`** + **`resumeOptionsForDriver(app, opts)`** — same behavior, typed around `{ page }`:

```typescript
import { createResumableFlow, resumeOptionsForDriver, scopedCheckpointTestId } from '../../src/fixtures';

const flow = await createResumableFlow({
  testId: scopedCheckpointTestId(testInfo.testId),
  driver: app,
  getContext: () => bd.getContext(),
  ...resumeOptionsForDriver(app, {
    resumeKey: process.env.E2E_SEED_VERSION,
    validateResume: async ({ page }) => page.getByRole('heading', { name: 'Cart' }).isVisible(),
    uiResumeValidator: async ({ page }) => (await page.locator('.line-item').count()) > 0,
    onResumeInvalidated: async ({ page }) => {
      await page.goto('https://shop.example.com');
    },
  }),
});
```

Disk metadata is still **`CheckpointData`**; **`checkpointDataToResumableBrowser`** / **`resumableBrowserToCheckpointData`** map to/from **`ResumableBrowserCheckpoint`** (your **`BrowserCheckpoint`** shape plus **`step`** / **`subCheckpoint`**). See **`src/session/checkpoint-contracts.ts`**.

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

Checkpoint filenames use a **sanitized id** derived from the string you pass as `testId` (see below).

- **Metadata:** `.checkpoints/{sanitizedTestId}.json` — JSON with `step`, `url`, `statePath`, `timestamp`, and optionally **`subCheckpoint`** (mid-step resume label) and **`resumeKey`** (environment / dataset fingerprint).
- **State:** `.checkpoints/{sanitizedTestId}.state.json` — Playwright **`storageState`**.

Both are gitignored.

### Parallel runs & worker-scoped IDs

Playwright’s `testInfo.testId` is stable per test definition but **not unique per worker**. If two workers (or CI shards sharing one output directory) wrote the same filenames, they would overwrite each other’s checkpoint files.

Use **`scopedCheckpointTestId(testInfo.testId)`** when passing `testId` to **`runSteps`**, **`createResumableFlow`**, or **`CheckpointManager`** manually. It appends the worker index:

`{testId}-w${process.env.TEST_WORKER_INDEX ?? '0'}`

The built-in **`checkpoint`** and **`resumable`** fixtures already use this helper (see `playwright.config.ts` comment). Exported from **`src/fixtures`** and **`src/session`**.

### Mid-step checkpoints (`resumable.checkpoint`)

By default, storage is saved **after** each whole **`resumable.step`**. For very long steps, call **`await resumable.checkpoint(name)`** or **`await resumable.checkpoint(name, async () => { … })`** **inside** the step callback so you can resume **after that label** without restarting the step from the top.

- **`checkpoint(name, segment?)`** — With **`segment`**, runs `segment` then saves metadata with **`subCheckpoint: name`**. When resuming past that label, **earlier** checkpoints in the same step skip their **`segment`** (browser state is restored first via **`onResume`**).
- **`checkpoint(name)`** — Saves at that label only.

Place non-idempotent work inside **`checkpoint('label', async () => { … })`** blocks **in order**. Plain statements **before** the first matching checkpoint still run on every attempt; see the **`resumable`** section in [Browser POM & tests](../browser/pom-and-tests.md).

Calls must happen **inside** `resumable.step(...)`; otherwise an error is thrown.

### Corrupt metadata

If the metadata `.json` is unreadable (truncated copy, bad merge, wrong encoding), **`hasCheckpoint()`** logs a **warning** including the underlying error, clears the checkpoint files, and returns **`null`** so the next run starts clean.

### Usage pattern (`runSteps`)

```typescript
import {
  test,
  expect,
  runSteps,
  Step,
  scopedCheckpointTestId,
  uiResumeValidator,
} from '../../src/fixtures';
import { BrowserDriver } from '../../src/drivers/browser/browser-driver';

test('checkout flow', async ({ app }, testInfo) => {
  await app.launch({ url: 'https://shop.example.com' });

  const steps: Step[] = [
    { name: 'add item', fn: async (d) => { await d.click('add-to-cart'); } },
    { name: 'open cart', fn: async (d) => { await d.navigate('/cart'); } },
    // ...
  ];

  await runSteps({
    testId: scopedCheckpointTestId(testInfo.testId),
    driver: app,
    steps,
    getContext: () => (app as BrowserDriver).getContext(),
    // Optional: invalidate resume when CI seed / tenant changes
    resumeKey: process.env.E2E_SEED_VERSION,
    // Optional: after restore, prove the UI still matches this flow (no DB required)
    validateResume: uiResumeValidator(async (d) => {
      await d.waitFor('cart-heading', { timeout: 5000 });
      return true;
    }),
    onResumeInvalidated: async (d) => {
      await d.navigate('https://shop.example.com');
    },
  });
});
```

On **full success**, checkpoints are **cleared**. If you need to force a clean slate, delete `.checkpoints/` between runs.

**Types:** `CreateResumableFlowOptions`, `RunStepsOptions` — extend/pass the same fields to **`createResumableFlow`** when you are not using **`runSteps`**.

### Fixture: `checkpoint`

Tests can inject **`checkpoint`** — a **`CheckpointManager`** scoped with **`scopedCheckpointTestId(testInfo.testId)`** — for custom flows outside **`runSteps`**.

## Vision fallback (optional)

If **`OPENAI_API_KEY`** is set and vision is enabled, failed UI actions may use GPT-4o against screenshots. Treat this as a **fallback**, not the primary locator strategy.

## Related

- [Browser automation](../browser/automation.md)  
- [First test & setup](../configuration/first-test-and-setup.md)  
