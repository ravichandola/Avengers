import type { Page } from "playwright";
import type { IDriver } from "../core/base-driver";
import { tryUnwrapBrowserDriver } from "../core/unwrap-browser-driver";
import type { BrowserDriver } from "../drivers/browser/browser-driver";
import type { PageManager } from "../drivers/browser/page-manager";
import { narrator } from "../drivers/browser/browser-narrator";
import { PageObject } from "../drivers/browser/pom/page-object";
import { DriverPage } from "./driver-page";

/**
 * Browser tab + navigation helper tied to the same {@link IDriver} as {@link app}.
 *
 * **Page objects:** use **`narrator.newPage(MyPom)`** from **`src/fixtures`** — one lazy,
 * read-only factory for both {@link DriverPage} and {@link PageObject} (see {@link BrowserNarrator}).
 * This class does **not** duplicate that API to avoid two mental models.
 *
 * ```ts
 * import { test, narrator, pom } from '../../src/fixtures';
 *
 * test('flow', async ({ app, pom }) => {
 *   await app.launch({ url: 'https://playwright.dev/' });
 *   const site = narrator.newPage(PlaywrightSiteDriverPage);
 *   await pom.newPage('https://playwright.dev/docs/pom');
 *   const doc = narrator.newPage(PlaywrightDocsPage);
 * });
 * ```
 */
export class PomManager {
  constructor(private readonly driver: IDriver) {}

  /** @returns Playwright tab stack for the browser driver. */
  get browserTabs(): PageManager {
    return this.requireBrowser().pages;
  }

  /**
   * Open a new tab (optional `url`); it becomes the active tab for **`narrator.page`**
   * and the next **`narrator.newPage(...)`** resolution.
   */
  async newPage(url?: string): Promise<void> {
    await this.requireBrowser().pages.openNewTab(url);
    if (narrator.isBound()) narrator.resetPageInstances();
  }

  /**
   * Open a new tab then return a **lazy** POM for that tab (same as {@link narrator.newPage} after {@link newPage}).
   */
  async newPagePom<T extends PageObject>(
    PageClass: new (page: Page) => T,
    url?: string,
  ): Promise<Readonly<T>>;

  async newPagePom<T extends DriverPage>(
    PageClass: new (driver: IDriver) => T,
    url?: string,
  ): Promise<Readonly<T>>;

  async newPagePom(
    PageClass: new (pageOrDriver: Page | IDriver, ...args: unknown[]) => unknown,
    url?: string,
  ): Promise<Readonly<unknown>> {
    await this.requireBrowser().pages.openNewTab(url);
    if (narrator.isBound()) narrator.resetPageInstances();
    return narrator.newPage(PageClass as Parameters<typeof narrator.newPage>[0]);
  }

  switchToTab(index: number): void {
    this.requireBrowser().pages.switchTo(index);
    if (narrator.isBound()) narrator.resetPageInstances();
  }

  async switchToTabTitle(title: string): Promise<void> {
    await this.requireBrowser().pages.switchToTitle(title);
    if (narrator.isBound()) narrator.resetPageInstances();
  }

  async switchToTabURL(urlPattern: string | RegExp): Promise<void> {
    await this.requireBrowser().pages.switchToURL(urlPattern);
    if (narrator.isBound()) narrator.resetPageInstances();
  }

  private requireBrowser(): BrowserDriver {
    const bd = tryUnwrapBrowserDriver(this.driver);
    if (!bd) {
      throw new Error(
        "PomManager: browser tabs require a BrowserDriver (or vision-wrapped browser)",
      );
    }
    return bd;
  }
}
