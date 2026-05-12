import { test, expect, narrator } from '../../src/fixtures';
import { PlaywrightSiteDriverPage } from '../pom';
import { unwrapBrowserDriver } from '../helpers/unwrap-browser-driver';

test.describe('Playwright.dev — fixtures doc, second tab, checkpoint steps', () => {
  test('home → docs → fixtures → new tab POM (linear + resumable fixture)', async ({ app, resumable }) => {
    const browserDriver = unwrapBrowserDriver(app);
    const site = narrator.newPage(PlaywrightSiteDriverPage);

    await app.launch({ url: 'https://playwright.dev/' });

    await resumable.step('playwright home', async () => {
      await site.openHome();
    });
    await resumable.step('open docs from header', async () => {
      await site.openDocsFromHeader();
    });
    await resumable.step('open fixtures guide', async () => {
      await site.openFixturesFromDocsNav();
    });
    await resumable.step('open POM guide in second tab', async () => {
      await site.openPomGuideInNewTab();
    });

    expect(browserDriver.pages.count()).toBe(2);

    await site.expectHeadingMatches(/page object model|pom|page objects/i);

    const title = await app.getTitle();
    expect(title.toLowerCase()).toMatch(/pom|page object/);

    await expect(browserDriver.pages.current()).toHaveURL(/\/docs\/pom/);
  });
});
