import type { Page } from 'playwright';
import type { IDriver } from '../core/base-driver';
import { tryUnwrapBrowserDriver } from '../core/unwrap-browser-driver';
import type { BrowserDriver } from '../drivers/browser/browser-driver';
import type { PageManager } from '../drivers/browser/page-manager';
import { PageObject } from '../drivers/browser/pom/page-object';
import { DriverPage } from './driver-page';

/**
 * Single entry to build POMs against the current {@link IDriver} (and browser tabs).
 *
 * ```ts
 * const shop = pom.page(ShopCheckoutPage);
 * await shop.browseProducts();
 *
 * const netflix = pom.page(NetflixPage);
 * await netflix.signIn.click();
 *
 * await pom.newPage('https://…');
 * const other = pom.page(OtherDriverPage);
 * ```
 *
 * - **DriverPage** subclasses receive the same `IDriver` (vision-wrapped or not).
 * - **PageObject** subclasses are bound to the **active** Playwright tab (see {@link BrowserDriver.pages}).
 */
export class PomManager {
  constructor(private readonly driver: IDriver) {}

  /** @returns Playwright tab stack for the browser driver. */
  get browserTabs(): PageManager {
    return this.requireBrowser().pages;
  }

  /**
   * Open a new tab (optional `url`); it becomes the active tab for subsequent {@link page} **PageObject** calls.
   * For **DriverPage** POMs that use `BrowserDriver.pages` internally, the active tab is already updated.
   */
  async newPage(url?: string): Promise<void> {
    await this.requireBrowser().pages.openNewTab(url);
  }

  /**
   * New tab plus a **PageObject** bound to that tab (active tab is the new page).
   */
  async newPagePom<T extends PageObject>(
    PageClass: new (page: Page) => T,
    url?: string,
  ): Promise<T> {
    const page = await this.requireBrowser().pages.openNewTab(url);
    return new PageClass(page);
  }

  switchToTab(index: number): void {
    this.requireBrowser().pages.switchTo(index);
  }

  async switchToTabTitle(title: string): Promise<void> {
    await this.requireBrowser().pages.switchToTitle(title);
  }

  async switchToTabURL(urlPattern: string | RegExp): Promise<void> {
    await this.requireBrowser().pages.switchToURL(urlPattern);
  }

  page<T extends DriverPage>(PageClass: new (driver: IDriver) => T): T;
  page<T extends PageObject>(PageClass: new (page: Page) => T): T;
  page(PageClass: (new (driver: IDriver) => DriverPage) | (new (page: Page) => PageObject)): DriverPage | PageObject {
    if (PageClass.prototype instanceof DriverPage) {
      return new (PageClass as new (driver: IDriver) => DriverPage)(this.driver);
    }
    if (PageClass.prototype instanceof PageObject) {
      const bd = this.requireBrowser();
      return new (PageClass as new (page: Page) => PageObject)(bd.pages.current());
    }
    throw new Error(
      `PomManager.page: ${(PageClass as { name?: string }).name ?? 'Class'} must extend DriverPage or PageObject`,
    );
  }

  private requireBrowser(): BrowserDriver {
    const bd = tryUnwrapBrowserDriver(this.driver);
    if (!bd) {
      throw new Error('PomManager: browser DriverPage / PageObject requires a BrowserDriver (or vision-wrapped browser)');
    }
    return bd;
  }
}
