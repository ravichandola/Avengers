import { PageObject } from '../../../src/drivers/browser/pom/page-object';
import { Locator, Page } from 'playwright';

/**
 * Netflix browse/search/playback POM.
 * Requires an authenticated Netflix session (storageState or manual login).
 */
export class NetflixBrowsePage extends PageObject {
  static readonly browseUrl = 'https://www.netflix.com/browse';
  static readonly searchUrl = 'https://www.netflix.com/search';

  // ─── Navigation Bar ───────────────────────────────────────

  readonly searchIcon = this.page.locator('[data-uia="search-box-launcher"], button[aria-label="Search"]').first();
  readonly searchInput = this.page.locator('input[data-uia="search-box-input"], input[name="searchInput"], input[type="text"][placeholder*="earch"]').first();
  readonly notificationBell = this.page.locator('[data-uia="bell-icon"], [aria-label="Notifications"]').first();
  readonly profileMenu = this.page.locator('[data-uia="profile-flyout-dropdown"], .profile-icon').first();

  // ─── Search Results ───────────────────────────────────────

  get searchResultCards(): Locator {
    return this.page.locator('[data-uia="search-result-item"], .title-card, .slider-item, [data-uia="title-card"]');
  }

  get searchResultTitles(): Locator {
    return this.page.locator('.title-card .fallback-text, [data-uia="search-result-item"] img, .title-card img');
  }

  // ─── Playback ─────────────────────────────────────────────

  readonly playButton = this.page.locator(
    'button[data-uia="play-button"], a[data-uia="play-button"], [data-uia="mini-modal-play-button"], button:has-text("Play"), a:has-text("Play")'
  ).first();

  readonly videoPlayer = this.page.locator('video, [data-uia="video-canvas"]').first();

  readonly pauseButton = this.page.locator(
    'button[data-uia="control-pause"], button[aria-label="Pause"], button:has-text("Pause")'
  ).first();

  readonly backButton = this.page.locator(
    'button[data-uia="control-nav-back"], button[aria-label="Back"], [data-uia="back-to-browse"]'
  ).first();

  // ─── Mini Modal (hover card) ──────────────────────────────

  readonly miniModalContainer = this.page.locator('[data-uia="mini-modal"], .previewModal--container').first();
  readonly miniModalTitle = this.page.locator('[data-uia="mini-modal"] .previewModal--player-titleTreatment, .previewModal--container strong').first();

  // ─── Actions ──────────────────────────────────────────────

  async open(): Promise<void> {
    await this.navigate(NetflixBrowsePage.browseUrl);
    await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  }

  async searchFor(query: string): Promise<void> {
    await this.searchIcon.waitFor({ state: 'visible', timeout: 15_000 });
    await this.searchIcon.click();

    await this.searchInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.searchInput.fill('');
    await this.searchInput.fill(query);

    await this.page.waitForTimeout(2000);
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  }

  async getSearchResultCount(): Promise<number> {
    await this.page.waitForTimeout(1000);
    return this.searchResultCards.count();
  }

  async clickFirstResult(): Promise<void> {
    const firstCard = this.searchResultCards.first();
    await firstCard.waitFor({ state: 'visible', timeout: 10_000 });
    await firstCard.hover();
    await this.page.waitForTimeout(1500);

    const expandButton = this.page.locator(
      '[data-uia="expand-to-detail-button"], .slider-item button[data-uia], .title-card'
    ).first();
    await expandButton.click({ timeout: 5_000 }).catch(async () => {
      await firstCard.click();
    });
  }

  async clickPlay(): Promise<void> {
    await this.playButton.waitFor({ state: 'visible', timeout: 10_000 });
    await this.playButton.click();
  }

  async waitForVideoPlayback(timeoutMs = 20_000): Promise<boolean> {
    try {
      await this.videoPlayer.waitFor({ state: 'attached', timeout: timeoutMs });

      const isPlaying = await this.page.evaluate(() => {
        const video = document.querySelector('video');
        if (!video) return false;
        return !video.paused && video.readyState >= 2;
      });

      if (isPlaying) return true;

      await this.page.waitForFunction(
        () => {
          const video = document.querySelector('video');
          return video != null && !video.paused && video.readyState >= 2;
        },
        { timeout: timeoutMs },
      );
      return true;
    } catch {
      return false;
    }
  }

  async getVideoCurrentTime(): Promise<number> {
    return this.page.evaluate(() => {
      const video = document.querySelector('video');
      return video?.currentTime ?? 0;
    });
  }

  async isVideoPlaying(): Promise<boolean> {
    return this.page.evaluate(() => {
      const video = document.querySelector('video');
      return video != null && !video.paused && video.readyState >= 2;
    });
  }

  async pausePlayback(): Promise<void> {
    await this.page.keyboard.press('Space');
    await this.page.waitForTimeout(500);
  }

  async goBackToBrowse(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(1000);
    const url = this.page.url();
    if (url.includes('/watch/')) {
      await this.backButton.click({ timeout: 5_000 }).catch(async () => {
        await this.page.goBack({ waitUntil: 'domcontentloaded' });
      });
    }
  }

  async getCurrentPageTitle(): Promise<string> {
    return this.page.title();
  }

  async getCurrentURL(): Promise<string> {
    return this.page.url();
  }
}
