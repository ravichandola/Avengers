# Using checkpoints in tests (beginner guide)

**Part of:** [Common documentation](./README.md) · [Documentation home](../README.md)

Use this page if you are **new** to the framework and want **save-and-resume** for long browser flows. For saved login files (`.auth/`), portable code copies, and advanced options (`resumeKey`, `ResumeOptions`), see [**Auth & checkpoints**](./auth-and-checkpoints.md).

---

## What checkpoints do

1. During a test, after each **`resumable.step(...)`** completes successfully, the framework can write **cookies, localStorage, and the current URL** to files under **`.checkpoints/`** (next to your project root).
2. If the test **fails** halfway, you can run again with an env flag so the browser **restores** that saved state and **skips** steps that already passed — then continues from where you left off.

This is meant for **local development** or **retry after a failure**, not as a substitute for fixing flaky tests in CI.

---

## What you need

| Requirement | Notes |
|-------------|--------|
| **Browser test** | Spec name **`*.browser.spec.ts`** and a browser **project** (e.g. `--project=chrome`). Checkpoints use Playwright **`storageState`** — they do not apply the same way to desktop/mobile/API drivers. |
| **Import** | Always import **`test`** (and **`expect`**) from **`src/fixtures`**, not from `@playwright/test` alone, so you get the **`resumable`** fixture. |
| **Optional: `app.launch`** | The demo app may auto-launch from env; if your flow needs a specific URL, call **`app.launch({ url: '...' })`** before steps. |

---

## Step 1 — Add `resumable` to your test

Request the **`resumable`** fixture next to **`app`** (and **`pom`**, if you use page objects):

```typescript
import { test, expect } from '../../src/fixtures';

test('my long flow', async ({ app, resumable }) => {
  // ...
});
```

---

## Step 2 — Split the flow into named steps

Each logical chunk of work should be one **`await resumable.step('short label', async () => { ... })`**:

- The **label** shows up in Playwright’s report as a step.
- **Order matters** — the runner numbers steps `0`, `1`, `2`, … internally.

Example:

```typescript
await resumable.step('open shop', async () => {
  await app.navigate('https://example.com/shop');
});

await resumable.step('add item', async () => {
  await app.click('add-to-cart');
});

await resumable.step('open cart', async () => {
  await app.navigate('/cart');
});
```

Use your own selectors and POMs; the important part is **one `resumable.step` per phase** you might want to skip on resume.

---

## Step 3 — First run (normal)

Run tests **without** any special env:

```bash
npx playwright test path/to/your.spec.ts --project=chrome
```

While the test **passes** each step, checkpoint files are updated. If the test **fails** on step 4, a checkpoint exists after step 3.

---

## Step 4 — Re-run with resume (after a failure)

Set **`BROWSER_CHECKPOINT_RESUME=true`** so the next run **reloads** the last good checkpoint and **skips** completed steps:

```bash
BROWSER_CHECKPOINT_RESUME=true npx playwright test path/to/your.spec.ts --project=chrome
```

This repo also exposes a script (see `package.json`):

```bash
npm run test:chrome:resume -- your-test-name
```

Fix code or data, then re-run with resume until the test passes.

---

## When the test passes

The **`resumable`** fixture **clears** `.checkpoints/` for that test on **pass**. You start clean on the next full run.

---

## Files on disk

| Path | Purpose |
|------|---------|
| `.checkpoints/{id}.json` | Metadata: last completed step index, URL, optional mid-step label, optional `resumeKey`. |
| `.checkpoints/{id}.state.json` | Playwright **storageState** (cookies/storage). |

`{id}` is derived from the test id (worker index is included so parallel workers do not overwrite each other). You normally **do not commit** `.checkpoints/` (it is gitignored).

To force a full run from step 0: delete the **`.checkpoints`** folder or unset `BROWSER_CHECKPOINT_RESUME`.

---

## Very long steps (optional)

If **one** step is huge, you can save **inside** it with **`resumable.checkpoint('label')`** or **`resumable.checkpoint('label', async () => { ... })`**. That is an **advanced** pattern; see [**Auth & checkpoints**](./auth-and-checkpoints.md) → *Mid-step checkpoints* and [Browser POM & tests](../browser/pom-and-tests.md).

---

## Same idea with a step array (`runSteps`)

Some tests prefer a list of steps instead of chaining `resumable.step`:

```typescript
import { test, runSteps, Step, scopedCheckpointTestId } from '../../src/fixtures';
import { BrowserDriver } from '../../src/drivers/browser/browser-driver';

test('linear flow', async ({ app }, testInfo) => {
  const steps: Step[] = [
    { name: 'one', fn: async (d) => { /* ... */ } },
    { name: 'two', fn: async (d) => { /* ... */ } },
  ];

  await runSteps({
    testId: scopedCheckpointTestId(testInfo.testId),
    driver: app,
    steps,
    getContext: () => (app as BrowserDriver).getContext(),
  });
});
```

Behavior matches the **`resumable`** fixture for linear flows. Extra options (`resumeKey`, validation hooks, `Page`-based **`ResumeOptions`**) are documented in [**Auth & checkpoints**](./auth-and-checkpoints.md).

---

## Limitations (good to know early)

- Checkpoints save **browser** state, **not** your database. If the server wipes data but you still resume at a deep URL, the UI can break. For guardrails, read *When resume can lie* in [**Auth & checkpoints**](./auth-and-checkpoints.md).
- **`resumable`** does not wire those guardrails by default — use **`createResumableFlow`** + options from that doc when you need them.

---

## Where to go next

| Topic | Doc |
|--------|-----|
| Saved logins (reuse cookies without checkpoints) | [Auth & checkpoints](./auth-and-checkpoints.md) → *Saved auth profiles* |
| `resumeKey`, `validateResume`, `ResumeOptions` | [Auth & checkpoints](./auth-and-checkpoints.md) |
| Example spec in this repo | `tests/browser/resumable-checkout.browser.spec.ts` |
| Fixture list | [First test & setup](../configuration/first-test-and-setup.md), [Fixtures & `IDriver`](./fixtures-and-idriver.md) |

[← Common docs](./README.md) · [Documentation home](../README.md)
