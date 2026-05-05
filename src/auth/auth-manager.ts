import { Browser, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { IDriver } from '../core/base-driver';
import { BrowserDriver } from '../drivers/browser/browser-driver';
import { resolveConfig } from '../core/config';
import { logger } from '../utils/logger';

const AUTH_DIR = path.resolve(process.cwd(), '.auth');

/**
 * Login function receives the unified IDriver — no raw page calls needed.
 * Use driver.navigate(), driver.fill(), driver.click(), driver.waitFor(), etc.
 */
export type LoginFunction = (driver: IDriver) => Promise<void>;

/**
 * AuthManager handles multi-user auth persistence.
 * Profiles are stored as .auth/{name}.json containing cookies, localStorage, sessionStorage.
 * Once saved, tests skip login entirely by restoring storageState.
 */
export class AuthManager {
  static getDir(): string {
    return AUTH_DIR;
  }

  static profilePath(name: string): string {
    return path.join(AUTH_DIR, `${name}.json`);
  }

  static async exists(name: string): Promise<boolean> {
    const p = AuthManager.profilePath(name);
    return fs.existsSync(p);
  }

  /**
   * Save current browser context state (cookies, localStorage) as a named profile.
   */
  static async saveProfile(name: string, context: BrowserContext): Promise<void> {
    AuthManager.ensureDir();
    const filePath = AuthManager.profilePath(name);
    await context.storageState({ path: filePath });
    logger.info('Auth', `Saved profile: ${name} → ${filePath}`);
  }

  /**
   * Returns the file path for a saved profile (for use with storageState option).
   * Throws if profile doesn't exist.
   */
  static async loadProfile(name: string): Promise<string> {
    const filePath = AuthManager.profilePath(name);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Auth profile "${name}" not found at ${filePath}. Run setupProfile() first.`);
    }
    logger.info('Auth', `Loaded profile: ${name}`);
    return filePath;
  }

  /**
   * Run a login function once and persist the resulting state.
   * The loginFn receives an IDriver — use the same unified API (navigate, fill, click, waitFor).
   * On subsequent calls, if profile already exists, login is skipped.
   */
  static async setupProfile(
    name: string,
    loginFn: LoginFunction,
    browser: Browser,
    options?: { force?: boolean; baseURL?: string }
  ): Promise<string> {
    const filePath = AuthManager.profilePath(name);

    if (!options?.force && fs.existsSync(filePath)) {
      logger.info('Auth', `Profile "${name}" already exists, skipping login`);
      return filePath;
    }

    AuthManager.ensureDir();
    logger.info('Auth', `Setting up profile "${name}" (running login flow)...`);

    const config = resolveConfig({ platform: 'chromium' });
    const driver = new BrowserDriver(config, browser);
    await driver.launch({ url: options?.baseURL });

    try {
      await loginFn(driver);
      const ctx = driver.getContext();
      if (!ctx) throw new Error('No browser context available after login');
      await ctx.storageState({ path: filePath });
      logger.info('Auth', `Profile "${name}" saved successfully`);
    } finally {
      await driver.close();
    }

    return filePath;
  }

  /**
   * Delete a saved profile.
   */
  static async deleteProfile(name: string): Promise<void> {
    const filePath = AuthManager.profilePath(name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info('Auth', `Deleted profile: ${name}`);
    }
  }

  /**
   * List all saved profiles.
   */
  static listProfiles(): string[] {
    if (!fs.existsSync(AUTH_DIR)) return [];
    return fs.readdirSync(AUTH_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  }

  /**
   * Clear all saved profiles.
   */
  static async clearAll(): Promise<void> {
    if (fs.existsSync(AUTH_DIR)) {
      const files = fs.readdirSync(AUTH_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(AUTH_DIR, file));
      }
      logger.info('Auth', 'Cleared all profiles');
    }
  }

  private static ensureDir(): void {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
  }
}
