import { test, expect, runSteps, Step } from '../../src/fixtures';
import { PlaywrightSiteDriverPage } from '../pom';
import { unwrapBrowserDriver } from '../helpers/unwrap-browser-driver';

/**
 * 1) playwright.dev → Docs → Fixtures (tab 1)
 * 2) Naya tab → Page Object Model doc (`/docs/pom`)
 *
 * Baaki flow **`runSteps`** se chalta hai (same {@link BrowserDriver} / context) taaki
 * `.checkpoints/` + `BROWSER_CHECKPOINT_RESUME=true` se resume test kar sako.
 *
 * Run:
 *   npx playwright test playwright-docs-fixtures --project=chrome
 * Resume after failure:
 *   BROWSER_CHECKPOINT_RESUME=true npx playwright test playwright-docs-fixtures --project=chrome
 */
test.describe('Playwright.dev — fixtures doc, second tab, checkpoint steps', () => {
  test('home → docs → fixtures → new tab POM via runSteps (@app fixture)', async ({ app }, testInfo) => {
    const browserDriver = unwrapBrowserDriver(app);

    await app.launch({ url: 'https://playwright.dev/' });

    const steps: Step[] = [
      {
        name: 'playwright home',
        fn: async (driver) => {
          await new PlaywrightSiteDriverPage(driver).openHome();
        },
      },
      {
        name: 'open docs from header',
        fn: async (driver) => {
          await new PlaywrightSiteDriverPage(driver).openDocsFromHeader();
        },
      },
      {
        name: 'open fixtures guide',
        fn: async (driver) => {
          await new PlaywrightSiteDriverPage(driver).openFixturesFromDocsNav();
        },
      },
      {
        name: 'open POM guide in second tab',
        fn: async (driver) => {
          await new PlaywrightSiteDriverPage(driver).openPomGuideInNewTab();
        },
      },
    ];

    await runSteps({
      testId: testInfo.testId,
      driver: app,
      steps,
      getContext: () => browserDriver.getContext(),
    });

    expect(browserDriver.pages.count()).toBe(2);

    await new PlaywrightSiteDriverPage(app).expectHeadingMatches(/page object model|pom|page objects/i);

    const title = await app.getTitle();
    expect(title.toLowerCase()).toMatch(/pom|page object/);

    await expect(browserDriver.pages.current()).toHaveURL(/\/docs\/pom/);
  });
});
