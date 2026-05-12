import { Browser, BrowserContext } from "playwright";
import { AuthManager } from "../../auth/auth-manager";
import { logger } from "../../utils/logger";

export interface ContextOptions {
  viewport?: { width: number; height: number };
  storageState?: string;
  authProfile?: string;
  locale?: string;
  colorScheme?: "light" | "dark" | "no-preference";
  permissions?: string[];
  geolocation?: { latitude: number; longitude: number };
}

/**
 * Multi-context / multi-browser-session manager.
 * Incognito, different auth states, parallel user sessions.
 *
 * ```ts
 * const ctxMgr = new ContextManager(browser);
 * await ctxMgr.create('admin', { authProfile: 'admin' });
 * await ctxMgr.create('guest');
 *
 * const adminCtx = ctxMgr.get('admin');
 * const guestCtx = ctxMgr.get('guest');
 *
 * ctxMgr.switch('guest');
 * ```
 */
export class ContextManager {
  private contexts = new Map<string, BrowserContext>();
  private _currentName: string | null = null;

  constructor(private readonly browser: Browser) {}

  async create(
    name: string,
    options?: ContextOptions,
  ): Promise<BrowserContext> {
    if (this.contexts.has(name)) {
      throw new Error(
        `Context "${name}" already exists. Use switch() or close() first.`,
      );
    }

    let storageState: string | undefined = options?.storageState;
    if (!storageState && options?.authProfile) {
      const exists = await AuthManager.exists(options.authProfile);
      if (exists) {
        storageState = await AuthManager.loadProfile(options.authProfile);
      }
    }

    const ctx = await this.browser.newContext({
      viewport: options?.viewport ?? { width: 1280, height: 720 },
      storageState,
      locale: options?.locale,
      colorScheme: options?.colorScheme,
      permissions: options?.permissions,
      geolocation: options?.geolocation,
    });

    this.contexts.set(name, ctx);
    this._currentName = name;
    logger.info("ContextManager", `Created context: ${name}`);
    return ctx;
  }

  get(name: string): BrowserContext {
    const ctx = this.contexts.get(name);
    if (!ctx) throw new Error(`Context "${name}" not found`);
    return ctx;
  }

  switch(name: string): BrowserContext {
    const ctx = this.get(name);
    this._currentName = name;
    logger.info("ContextManager", `Switched to context: ${name}`);
    return ctx;
  }

  current(): BrowserContext {
    if (!this._currentName) throw new Error("No active context");
    return this.get(this._currentName);
  }

  currentName(): string | null {
    return this._currentName;
  }

  async close(name: string): Promise<void> {
    const ctx = this.contexts.get(name);
    if (!ctx) return;

    await ctx.close();
    this.contexts.delete(name);
    logger.info("ContextManager", `Closed context: ${name}`);

    if (this._currentName === name) {
      const remaining = [...this.contexts.keys()];
      this._currentName = remaining.length > 0 ? remaining[0] : null;
    }
  }

  async closeAll(): Promise<void> {
    for (const [name, ctx] of this.contexts) {
      await ctx.close();
      logger.info("ContextManager", `Closed context: ${name}`);
    }
    this.contexts.clear();
    this._currentName = null;
  }

  list(): string[] {
    return [...this.contexts.keys()];
  }

  has(name: string): boolean {
    return this.contexts.has(name);
  }
}
