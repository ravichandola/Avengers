# Environment variables

The framework merges **shell variables** and **optional `.env` files** before Playwright runs. You typically keep secrets and machine-specific URLs in ignored files rather than in source control.

## Load order

**Implementation:** `src/core/env-loader.ts` (called from `playwright.config.ts`).

1. **Shell / CI** — anything already in `process.env` when Node starts stays authoritative for those keys (dotenv will **not** overwrite them). Use this for CI secrets: `API_BASE_URL=https://staging.example.com npx playwright test`.
2. **`.env`** — loaded first from the repo root (if the file exists).
3. **Scoped files** (each optional): `browser.env`, `api.env`, `desktop.env`, `mobile.env` — loaded in that order after `.env`.

Later files only fill in keys that are **still unset** after earlier steps (except shell keys, which always win).

## File cheat sheet

| File | Typical contents |
|------|------------------|
| `.env` | Shared: `BASE_URL`, `HEADLESS`, `TIMEOUT`, `RETRIES`, `LOG_LEVEL`, optional LLM keys (`OPENAI_API_KEY`, …) |
| `browser.env` | `BROWSER_CHANNEL`, `BROWSER_BASE_URL`, `BROWSER_VIEWPORT_*`, `BROWSER_SLOW_MO`, `BROWSER_CHECKPOINT_RESUME` |
| `api.env` | `API_BASE_URL`, `API_TIMEOUT`, `API_AUTH_*` |
| `desktop.env` | `DESKTOP_APP_NAME`, `DESKTOP_APP_PATH`, `DESKTOP_USE_VISION` |
| `mobile.env` | `MOBILE_DEVICE_NAME`, `MOBILE_PLATFORM_VERSION`, `APPIUM_HOST`, `APPIUM_PORT`, bundle id / package |

All of these filenames are listed in `.gitignore` where they contain secrets — **do not commit** real credentials.

## Browser launch URL

If you call `app.launch({})`, omit `url`, or pass `url: ''`, **`BrowserDriver`** may still navigate using **`BROWSER_BASE_URL`** or **`BASE_URL`** (see `resolveBrowserLaunchUrl` in `env-loader.ts`). That avoids repeating the same URL in every spec when you only test one web app.

## Playwright metadata vs env

`playwright.config.ts` **projects** carry **`metadata`** (platform, default app name, API base URL, …). Fixtures read `testInfo.project.metadata` and merge with env. Prefer **env** for secrets and per-machine URLs; use **metadata** for defaults that ship with the repo.

## Where to go next

- [First test & setup](./first-test-and-setup.md) — minimal `.env` example and commands  
- [Fixtures & `IDriver`](../common/fixtures-and-idriver.md) — how the harness uses this config  

[← Configuration hub](./README.md)
