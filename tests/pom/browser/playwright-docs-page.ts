import { PageObject } from '../../../src/drivers/browser/pom/page-object';

/**
 * playwright.dev — home → docs → fixtures navigation (marketing header + docs sidebar).
 */
export class PlaywrightDocsPage extends PageObject {
  static readonly homeUrl = 'https://playwright.dev/';

  async openHome(): Promise<void> {
    await this.navigate(PlaywrightDocsPage.homeUrl);
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Clicks the main site header link into the docs tree (same as user clicking “Docs”). */
  async openDocsFromHeader(): Promise<void> {
    const docsFromHeader = this.page.locator('header a[href^="/docs/"]').first();
    await docsFromHeader.click();
    await this.page.waitForURL(/playwright\.dev\/docs\//, { timeout: 45_000 });
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** From any docs page: open the Fixtures guide via sidebar / TOC link. */
  async openFixturesFromDocsNav(): Promise<void> {
    const fixtures = this.page
      .locator('a[href$="/docs/test-fixtures"], a[href*="/docs/test-fixtures"]')
      .first();
    await fixtures.click();
    await this.page.waitForURL(/\/docs\/test-fixtures(\/|$|\?|#)/, { timeout: 45_000 });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectOnFixturesPage(): Promise<void> {
    await this.page.getByRole('heading', { name: /^fixtures$/i }).waitFor({ state: 'visible', timeout: 30_000 });
  }
}
