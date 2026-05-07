import { BrowserDriver } from '../../../src/drivers/browser/browser-driver';
import { DriverPage } from '../../../src/pom/driver-page';
import type { IDriver } from '../../../src/core/base-driver';
import { unwrapBrowserDriver } from '../../helpers/unwrap-browser-driver';

/**
 * playwright.dev navigation using {@link IDriver} — for `runSteps` / checkpoint flows with {@link BrowserDriver}.
 */
export class PlaywrightSiteDriverPage extends DriverPage {
  private bd(d: IDriver = this.driver): BrowserDriver {
    return unwrapBrowserDriver(d);
  }

  async openHome(): Promise<void> {
    await this.navigate('https://playwright.dev/');
    await this.bd().pages.current().waitForLoadState('domcontentloaded');
  }

  async openDocsFromHeader(): Promise<void> {
    await this.element('header >> a[href^="/docs/"]').click();
    await this.bd().pages.current().waitForURL(/playwright\.dev\/docs\//, {
      timeout: 45_000,
    });
    await this.bd().pages.current().waitForLoadState('domcontentloaded');
  }

  async openFixturesFromDocsNav(): Promise<void> {
    await this.element('[href*="/docs/test-fixtures"]').click();
    await this.bd().pages.current().waitForURL(/\/docs\/test-fixtures(\/|$|\?|#)/, {
      timeout: 45_000,
    });
    await this.bd().pages.current().waitForLoadState('domcontentloaded');
  }

  /** New tab: Playwright POM doc (still same browser context — checkpoint covers both tabs’ storage). */
  async openPomGuideInNewTab(): Promise<void> {
    const pages = this.bd().pages;
    await pages.openNewTab('https://playwright.dev/docs/pom');
    await pages.current().waitForLoadState('domcontentloaded');
  }

  async expectHeadingMatches(re: RegExp): Promise<void> {
    const page = this.bd().pages.current();
    await page.getByRole('heading', { name: re }).first().waitFor({ state: 'visible', timeout: 30_000 });
  }
}
