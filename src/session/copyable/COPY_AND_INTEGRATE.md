# Resumable checkpoints — copy into your framework

## What to copy

Copy this whole directory **`copyable/`** (these files):

- `checkpoint-manager.ts`
- `playwright-resume.ts`
- `run-resumable-steps.ts`
- `index.ts`

## Requirements

- Node.js (fs)
- Playwright (`playwright` or `@playwright/test` — you only need `BrowserContext` types at compile time)

## Integration sketch

1. Pick a stable **`testId`** string per test (e.g. Playwright `testInfo.testId`).
2. After each step, checkpoints write under **`.checkpoints/`** (add to `.gitignore`).
3. On retry, set **`BROWSER_CHECKPOINT_RESUME=true`** (or use `resumeEnabledFromEnv()`).
4. Implement **`onResume`**: reload `storageState` into a **new** context, attach your `Page`, then open `checkpoint.url`.

Example with a raw Playwright `Browser` (use one mutable `driver` object so **`onResume`** can replace `page` / `context`).

```typescript
import { test } from '@playwright/test';
import type { BrowserContext, Page } from 'playwright';
import {
  runResumableSteps,
  resumeEnabledFromEnv,
  newContextFromStorageFile,
} from './copyable'; // path to copied folder

test('long flow', async ({ browser }, testInfo) => {
  const driver: { context: BrowserContext; page: Page } = {
    context: await browser.newContext(),
    page: null as unknown as Page,
  };
  driver.page = await driver.context.newPage();

  await runResumableSteps({
    testId: testInfo.testId,
    resumeEnabled: resumeEnabledFromEnv(),
    driver,
    steps: [
      { name: 'login', fn: async (d) => { await d.page.goto('https://example.com/login'); /* ... */ } },
      { name: 'dashboard', fn: async (d) => { /* ... */ } },
    ],
    getContext: () => driver.context,
    getUrl: async (d) => d.page.url(),
    navigate: async (d, url) => {
      await d.page.goto(url, { waitUntil: 'domcontentloaded' });
    },
    onResume: async (d, cp) => {
      d.context = await newContextFromStorageFile({
        browser,
        storagePath: cp.statePath,
        closePrevious: d.context,
      });
      d.page = await d.context.newPage();
      await d.page.goto(cp.url, { waitUntil: 'domcontentloaded' });
    },
  });
});
```

5. **`driver`** is whatever your steps need; after **`onResume`**, update the same object fields your **`fn`**s read (for example `page` / `context`).

## API summary

| Export | Role |
|--------|------|
| `CheckpointManager` | Save/load/clear `.json` + `.state.json` |
| `newContextFromStorageFile` | Playwright context from file |
| `runResumableSteps` | Loop steps + checkpoint + optional resume |
| `resumeEnabledFromEnv` | `process.env.BROWSER_CHECKPOINT_RESUME === 'true'` |
