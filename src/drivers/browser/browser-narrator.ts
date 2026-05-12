import type { Page } from 'playwright';

import type { IDriver } from '../../core/base-driver';
import { tryUnwrapBrowserDriver } from '../../core/unwrap-browser-driver';
import { DriverPage } from '../../pom/driver-page';
import type { BrowserDriver } from './browser-driver';
import { createLazyReadonlyPom } from './lazy-readonly-pom';
import type { PageManager } from './page-manager';
import { PageObject } from './pom/page-object';

/**
 * **Browser narrator** — keeps your test’s “script” coherent: which tab is in focus, which
 * `IDriver` is speaking, and lazy page objects that bind to that line when first used.
 *
 * Bound automatically for browser projects when you use **`test` from `src/fixtures`**.
 * Import **`narrator`** and call **`narrator.newPage(MyPom)`** for lazy, read-only POMs.
 *
 * ```ts
 * import { test, narrator } from '../../src/fixtures';
 *
 * test('flow', async ({ app }) => {
 *   const login = narrator.newPage(LoginPage);
 *   await login.signIn.click();
 * });
 * ```
 */
export class BrowserNarrator {
  private idriver: IDriver | null = null;
  private browser: BrowserDriver | null = null;
  private readonly resetters = new Set<() => void>();

  /**
   * Wire the active {@link IDriver} (vision-wrapped or not). Called from fixtures for browser tests.
   */
  bind(driver: IDriver): void {
    this.unbind();
    this.idriver = driver;
    this.browser = tryUnwrapBrowserDriver(driver);
  }

  isBound(): boolean {
    return this.idriver !== null && this.browser !== null;
  }

  /** Clear lazy POM caches, drop bindings — runs after each test from fixtures. */
  unbind(): void {
    this.resetPageInstances();
    this.resetters.clear();
    this.idriver = null;
    this.browser = null;
  }

  /**
   * Playwright page for the active tab (same as `BrowserDriver.pages.current()`).
   */
  get page(): Page {
    if (!this.browser) {
      throw new Error('narrator.page: bind a browser driver (use test from src/fixtures in *.browser.spec.ts)');
    }
    return this.browser.pages.current();
  }

  /**
   * Tab / POM helpers for the current browser context (open tab, switch, dialogs, …).
   */
  pages(): PageManager {
    if (!this.browser) {
      throw new Error('narrator.pages: bind a browser driver (use test from src/fixtures in *.browser.spec.ts)');
    }
    return this.browser.pages;
  }

  /**
   * Lazy readonly POM — first access instantiates with current {@link page} (or {@link DriverPage}: current `app`).
   * After tab switches, call {@link resetPageInstances} so the next access uses the new tab
   * (handled for you when switching via {@link PomManager}).
   */
  newPage<T extends PageObject>(
    ctor: new (page: Page, ...args: unknown[]) => T,
    options?: { args?: unknown[] },
  ): Readonly<T>;

  newPage<T extends DriverPage>(
    ctor: new (driver: IDriver, ...args: unknown[]) => T,
    options?: { args?: unknown[] },
  ): Readonly<T>;

  newPage<T extends PageObject | DriverPage>(
    ctor: new (pageOrDriver: Page | IDriver, ...args: unknown[]) => T,
    options?: { args?: unknown[] },
  ): Readonly<T> {
    if (!this.idriver || !this.browser) {
      throw new Error('narrator.newPage: bind a browser driver (use test from src/fixtures in *.browser.spec.ts)');
    }

    const extraArgs = options?.args ?? [];

    if (PageObject.prototype.isPrototypeOf(ctor.prototype)) {
      return createLazyReadonlyPom({
        kind: 'pageobject',
        ctor: ctor as new (page: Page, ...args: unknown[]) => T,
        getPage: () => this.browser!.pages.current(),
        extraArgs,
        registerReset: (fn) => this.resetters.add(fn),
      });
    }

    if (DriverPage.prototype.isPrototypeOf(ctor.prototype)) {
      return createLazyReadonlyPom({
        kind: 'driverpage',
        ctor: ctor as new (driver: IDriver, ...args: unknown[]) => T,
        getDriver: () => this.idriver!,
        extraArgs,
        registerReset: (fn) => this.resetters.add(fn),
      });
    }

    throw new Error(
      `narrator.newPage: ${(ctor as { name?: string }).name ?? 'Class'} must extend PageObject or DriverPage`,
    );
  }

  /**
   * Drop cached lazy POM instances so the next access uses the current tab / driver.
   * Tab switches through {@link PomManager} call this automatically.
   */
  resetPageInstances(): void {
    for (const fn of this.resetters) {
      fn();
    }
  }
}

/** Global narrator — bound per test by `src/fixtures` for browser projects. */
export const narrator = new BrowserNarrator();
