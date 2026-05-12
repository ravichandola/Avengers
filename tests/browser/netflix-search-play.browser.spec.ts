import { test, expect, narrator } from '../../src/fixtures';
import { NetflixBrowsePage } from '../pom';

/**
 * Netflix Search + Play + Network Trace
 *
 * Pre-requisite: A valid Netflix session. Either:
 *   1. Set NETFLIX_STORAGE_STATE env var pointing to a storageState JSON file, OR
 *   2. Save an auth profile via `auth.saveProfile('netflix', context)` beforehand
 *
 * Run:
 *   npx playwright test netflix-search-play --project=chrome
 */
test.describe('Netflix - Search Dhurandhar & Play with Network Trace', () => {
  test.setTimeout(120_000);

  test('search for Dhurandhar, play the movie, and capture all network calls @network', async ({ app, network }) => {
    const netflix = narrator.newPage(NetflixBrowsePage);
    const page = narrator.page;

    // ─── Start network monitoring BEFORE any navigation ─────
    network.start(page, 'netflix-dhurandhar-search-play');

    // ─── Step 1: Navigate to Netflix browse page ────────────
    await test.step('Navigate to Netflix', async () => {
      await netflix.open();
      const url = await netflix.getCurrentURL();
      expect(url).toContain('netflix.com');
    });

    // ─── Step 2: Search for "Dhurandhar" ────────────────────
    await test.step('Search for Dhurandhar', async () => {
      await netflix.searchFor('Dhurandhar');

      const url = await netflix.getCurrentURL();
      expect(url.toLowerCase()).toMatch(/search|query|dhurandhar/i);

      const resultCount = await netflix.getSearchResultCount();
      expect(resultCount).toBeGreaterThan(0);
    });

    // ─── Checkpoint: verify search API calls were made ──────
    await test.step('Verify search network calls', async () => {
      const searchCalls = network.getEntriesByPattern(/search|query|pathEvaluator|suggest/i);
      expect(searchCalls.length).toBeGreaterThan(0);

      const failedSearchCalls = searchCalls.filter(
        (e) => e.failure || (e.response && e.response.status >= 400),
      );
      expect(failedSearchCalls).toHaveLength(0);
    });

    // ─── Step 3: Click first search result ──────────────────
    await test.step('Click first search result', async () => {
      await netflix.clickFirstResult();
      await page.waitForTimeout(2000);
    });

    // ─── Step 4: Play the movie ─────────────────────────────
    await test.step('Play the movie', async () => {
      await netflix.clickPlay();
      const playing = await netflix.waitForVideoPlayback(25_000);
      expect(playing).toBe(true);
    });

    // ─── Step 5: Verify video is actually streaming ─────────
    await test.step('Verify video playback is running', async () => {
      await page.waitForTimeout(3000);

      const currentTime = await netflix.getVideoCurrentTime();
      expect(currentTime).toBeGreaterThan(0);

      const isPlaying = await netflix.isVideoPlaying();
      expect(isPlaying).toBe(true);
    });

    // ─── Step 6: Pause and validate state ───────────────────
    await test.step('Pause playback', async () => {
      await netflix.pausePlayback();
      await page.waitForTimeout(500);
    });

    // ─── Step 7: Network trace analysis ─────────────────────
    await test.step('Analyze network trace', async () => {
      const totalRequests = network.getRequestCount();
      expect(totalRequests).toBeGreaterThan(10);

      const allFailed = network.getFailedRequests();
      const criticalFailures = allFailed.filter((e) => {
        const url = e.request.url;
        const isTrackingOrAd = /nflxvideo\.net\/tracker|log|impression|beaconservice/i.test(url);
        return !isTrackingOrAd;
      });
      expect(criticalFailures.length).toBeLessThanOrEqual(3);

      const apiCalls = network.getEntriesByPattern(/api\.netflix\.com|netflix\.com\/api|\/shakti\//i);
      expect(apiCalls.length).toBeGreaterThan(0);

      const videoCalls = network.getEntriesByPattern(/nflxvideo\.net|nflxso\.net|\.mp4|\.webm|range|manifest/i);
      expect(videoCalls.length).toBeGreaterThan(0);

      const getCalls = network.getEntriesByMethod('GET');
      expect(getCalls.length).toBeGreaterThan(0);
    });

    // ─── Step 8: Print summary for debugging ────────────────
    await test.step('Attach network summary', async () => {
      const summary = network.getSummary(
        'netflix-dhurandhar-search-play',
        'Search Dhurandhar & Play',
        'passed',
      );

      await test.info().attach('network-full-log', {
        body: JSON.stringify(summary, null, 2),
        contentType: 'application/json',
      });

      await test.info().attach('network-readable-summary', {
        body: network.toHumanReadable(),
        contentType: 'text/plain',
      });

      console.log('\n--- Network Summary ---');
      console.log(`Total requests: ${summary.totalRequests}`);
      console.log(`Failed requests: ${summary.failedRequests}`);
      console.log(`By Method: ${JSON.stringify(summary.byMethod)}`);
      console.log(`By Status: ${JSON.stringify(summary.byStatus)}`);
      console.log(`By Resource Type: ${JSON.stringify(summary.byResourceType)}`);
      console.log(`Total duration: ${summary.totalDuration}ms`);
      if (summary.slowestCalls.length > 0) {
        console.log('Slowest calls:');
        for (const s of summary.slowestCalls) {
          console.log(`  ${s.response?.timing.duration}ms ${s.request.method} ${s.request.url.slice(0, 80)}`);
        }
      }
      console.log('--- End Network Summary ---\n');
    });

    // ─── Cleanup: go back to browse ─────────────────────────
    await netflix.goBackToBrowse();
  });

  test('search for Dhurandhar and verify API call count @network', async ({ app, network }) => {
    const netflix = narrator.newPage(NetflixBrowsePage);
    const page = narrator.page;

    network.start(page, 'netflix-dhurandhar-api-count');

    await netflix.open();
    await netflix.searchFor('Dhurandhar');

    const allEntries = network.getEntries();
    const searchApiCalls = allEntries.filter((e) =>
      /search|query|pathEvaluator|suggest/i.test(e.request.url)
      && e.request.resourceType === 'xhr' || e.request.resourceType === 'fetch',
    );

    console.log(`\n--- API Calls for "Dhurandhar" search ---`);
    console.log(`Total network requests: ${allEntries.length}`);
    console.log(`Search-related API calls: ${searchApiCalls.length}`);
    for (const call of searchApiCalls) {
      const status = call.response?.status ?? 'pending';
      const duration = call.response?.timing.duration ?? 0;
      console.log(`  [${status}] ${duration}ms ${call.request.method} ${call.request.url.slice(0, 100)}`);
    }
    console.log('--- End API Calls ---\n');

    expect(searchApiCalls.length).toBeGreaterThan(0);

    const allFailed = network.getFailedRequests();
    await test.info().attach('search-network-log', {
      body: JSON.stringify({
        query: 'Dhurandhar',
        totalRequests: allEntries.length,
        searchApiCalls: searchApiCalls.length,
        failedRequests: allFailed.length,
        calls: searchApiCalls.map((c) => ({
          method: c.request.method,
          url: c.request.url,
          status: c.response?.status,
          duration: c.response?.timing.duration,
          resourceType: c.request.resourceType,
        })),
      }, null, 2),
      contentType: 'application/json',
    });
  });
});
