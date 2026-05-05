import { test, expect } from '../../src/fixtures';
import { NetflixPage } from '../pom';

test.describe('Netflix - Browser Automation', () => {
  test('navigates to netflix.com and verifies page loaded', async ({ app }) => {
    const netflix = new NetflixPage(app);
    await netflix.openHome();

    const url = await netflix.getURL();
    expect(url).toContain('netflix.com');

    const title = await netflix.getTitle();
    expect(title.length).toBeGreaterThan(0);
  });

  test('multi-tab: open Netflix in two tabs', async ({ pages }) => {
    const page1 = pages.current();
    await page1.goto(NetflixPage.homeUrl);

    const page2 = await pages.openNewTab(NetflixPage.browseUrl);
    expect(pages.count()).toBe(2);

    pages.switchTo(0);
    expect(pages.current().url()).toContain('netflix.com');

    await pages.closeTab(1);
    expect(pages.count()).toBe(1);
  });

  test('llm judge: validates landing page quality (PASS/FAIL JSON)', async ({ app }) => {
    test.skip(!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY, 'LLM judge key not configured');

    const netflix = new NetflixPage(app);
    await netflix.openHome();

    const verdict = await netflix.judgeLandingQuality();
    expect(verdict.rationale.length).toBeGreaterThan(0);
    expect(typeof verdict.passed).toBe('boolean');
  });
});
