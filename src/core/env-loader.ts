import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

export type EnvScope = 'browser' | 'api' | 'desktop' | 'mobile';

const ROOT = path.resolve(__dirname, '..', '..');
const initialEnv = new Set(Object.keys(process.env));

function loadIfExists(filename: string): void {
  const filePath = path.join(ROOT, filename);
  if (fs.existsSync(filePath)) {
    const parsed = dotenv.parse(fs.readFileSync(filePath));
    for (const [key, value] of Object.entries(parsed)) {
      // Keep shell-provided variables (e.g., DESKTOP_APP_NAME=Notes npx ...)
      // as highest priority, while still allowing later env files to override earlier ones.
      if (initialEnv.has(key)) continue;
      process.env[key] = value;
    }
  }
}

/**
 * Loads .env files in priority order:
 *   1. .env              (common — always loaded first)
 *   2. <scope>.env       (platform-specific — overrides common)
 *
 * Call once at config-load time. Safe to call multiple times.
 */
let loaded = false;
export function loadAllEnv(): void {
  if (loaded) return;
  loadIfExists('.env');
  for (const scope of ['browser', 'api', 'desktop', 'mobile'] as const) {
    loadIfExists(`${scope}.env`);
  }
  loaded = true;
}

export function detectScope(testFilePath?: string): EnvScope | undefined {
  if (!testFilePath) return undefined;
  if (testFilePath.includes('.browser.')) return 'browser';
  if (testFilePath.includes('.api.'))     return 'api';
  if (testFilePath.includes('.desktop.')) return 'desktop';
  if (testFilePath.includes('.mobile.'))  return 'mobile';
  return undefined;
}

const str = (key: string, fallback = ''): string =>
  process.env[key] ?? fallback;

const num = (key: string, fallback: number): number =>
  parseInt(process.env[key] ?? String(fallback), 10);

const bool = (key: string, fallback: boolean): boolean =>
  process.env[key] !== undefined ? process.env[key] === 'true' : fallback;

/**
 * Typed accessors for every env variable.
 * Common vars fall back to defaults; platform-specific vars fall back to common.
 */
export const env = {
  // ─── Common ──────────────────────────────────────────────────
  get headless()  { return bool('HEADLESS', false); },
  get timeout()   { return num('TIMEOUT', 60_000); },
  get retries()   { return num('RETRIES', 0); },
  get baseURL()   { return str('BASE_URL'); },
  get logLevel()  { return str('LOG_LEVEL', 'info'); },

  // ─── Browser ─────────────────────────────────────────────────
  get browserChannel():  string  { return str('BROWSER_CHANNEL', 'chrome'); },
  get browserHeadless(): boolean {
    return process.env.BROWSER_HEADLESS !== undefined
      ? bool('BROWSER_HEADLESS', false)
      : env.headless;
  },
  get browserBaseURL(): string   { return str('BROWSER_BASE_URL', env.baseURL); },
  get browserViewportW(): number { return num('BROWSER_VIEWPORT_WIDTH', 1280); },
  get browserViewportH(): number { return num('BROWSER_VIEWPORT_HEIGHT', 720); },
  get browserSlowMo():   number  { return num('BROWSER_SLOW_MO', 0); },

  /**
   * When true, `runSteps` resumes from `.checkpoints/` after a failed run
   * (restores cookies/localStorage + URL, skips completed steps).
   * Default false so CI and normal runs always start fresh unless you opt in.
   */
  get browserCheckpointResume(): boolean {
    return bool('BROWSER_CHECKPOINT_RESUME', false);
  },

  // ─── API ─────────────────────────────────────────────────────
  get apiBaseURL():   string           { return str('API_BASE_URL', env.baseURL); },
  get apiTimeout():   number           { return num('API_TIMEOUT', 30_000); },
  get apiAuthType():  string | undefined { return process.env.API_AUTH_TYPE; },
  get apiAuthToken(): string | undefined { return process.env.API_AUTH_TOKEN; },
  get apiAuthUser():  string | undefined { return process.env.API_AUTH_USERNAME; },
  get apiAuthPass():  string | undefined { return process.env.API_AUTH_PASSWORD; },
  get apiAuthKey():   string | undefined { return process.env.API_AUTH_KEY; },
  get apiAuthHeader(): string | undefined { return process.env.API_AUTH_HEADER; },

  // ─── Desktop ─────────────────────────────────────────────────
  get desktopAppName():    string  { return str('DESKTOP_APP_NAME'); },
  get desktopAppPath():    string  { return str('DESKTOP_APP_PATH'); },
  get desktopUseVision():  boolean { return bool('DESKTOP_USE_VISION', false); },

  // ─── LLM / Eval ────────────────────────────────────────────────
  get llmProvider():      string            { return str('LLM_PROVIDER'); },
  get llmModel():         string            { return str('LLM_MODEL'); },
  get anthropicApiKey():  string | undefined { return process.env.ANTHROPIC_API_KEY; },
  get geminiApiKey():     string | undefined { return process.env.GEMINI_API_KEY; },

  // ─── Mobile ──────────────────────────────────────────────────
  get mobileDeviceName():      string { return str('MOBILE_DEVICE_NAME'); },
  get mobilePlatformVersion(): string { return str('MOBILE_PLATFORM_VERSION'); },
  get mobileAutomationName():  string { return str('MOBILE_AUTOMATION_NAME', 'XCUITest'); },
  get mobileBundleId():        string { return str('MOBILE_BUNDLE_ID'); },
  get mobileAppPackage():      string { return str('MOBILE_APP_PACKAGE'); },
  get mobileAppActivity():     string { return str('MOBILE_APP_ACTIVITY'); },
  get mobileAppPath():         string { return str('MOBILE_APP_PATH'); },
  get appiumHost():            string { return str('APPIUM_HOST', 'localhost'); },
  get appiumPort():            number { return num('APPIUM_PORT', 4723); },
};
