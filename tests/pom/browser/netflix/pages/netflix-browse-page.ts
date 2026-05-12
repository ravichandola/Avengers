import type { Locator } from 'playwright';
import { pomPages } from '../../../../../src/drivers/browser/pom';

import { NetflixMiniModalBlock } from '../blocks/netflix-mini-modal-block';
import { NetflixSearchResultCardContainer } from '../containers/netflix-search-result-card-container';

/**
 * Netflix browse/search/playback ({@link pomPages.WebPage}).
 * Block: {@link NetflixMiniModalBlock}. Container: {@link NetflixSearchResultCardContainer}.
 * Requires an authenticated Netflix session (storageState or manual login).
 */
export class NetflixBrowsePage extends pomPages.WebPage {
  static readonly browseUrl = 'https://www.netflix.com/browse';
  static readonly searchUrl = 'https://www.netflix.com/search';

  protected baseUrl(): string {
    return 'https://www.netflix.com';
  }

  async shouldBeVisible(): Promise<pomPages.RootContainer> {
    await this.searchLauncher.waitFor({ state: 'visible', timeout: 20_000 });
    return this;
  }

  readonly searchLauncher = this.getByRole('button', { name: /search/i }).or(
    this.locator('[data-uia="search-box-launcher"]'),
  ).first();

  readonly searchField = this.locator('input[data-uia="search-box-input"]')
    .or(this.locator('input[name="searchInput"]'))
    .or(this.locator('input[type="search"]'))
    .or(this.getByPlaceholder(/search/i))
    .first();

  readonly notificationBell = this.locator(
    '[data-uia="bell-icon"], [aria-label="Notifications"]',
  ).first();

  readonly profileMenuTrigger = this.locator(
    '[data-uia="profile-flyout-dropdown"], .profile-icon',
  ).first();

  searchResultCardList(): Locator {
    return this.locator(
      '[data-uia="search-result-item"], .title-card, .slider-item, [data-uia="title-card"]',
    );
  }

  searchResultTitleImages(): Locator {
    return this.locator(
      '.title-card .fallback-text, [data-uia="search-result-item"] img, .title-card img',
    );
  }

  readonly playButton = this.locator(
    'button[data-uia="play-button"], a[data-uia="play-button"], [data-uia="mini-modal-play-button"], button:has-text("Play"), a:has-text("Play")',
  ).first();

  readonly videoPlayer = this.locator('video, [data-uia="video-canvas"]').first();

  readonly pauseButton = this.locator(
    'button[data-uia="control-pause"], button[aria-label="Pause"], button:has-text("Pause")',
  ).first();

  readonly backButton = this.locator(
    'button[data-uia="control-nav-back"], button[aria-label="Back"], [data-uia="back-to-browse"]',
  ).first();

  miniModal(): NetflixMiniModalBlock {
    return new NetflixMiniModalBlock(this.page);
  }

  firstSearchResultCard(): NetflixSearchResultCardContainer {
    return new NetflixSearchResultCardContainer(this.searchResultCardList().first());
  }

  async open(): Promise<void> {
    await this.goto('/browse');
    await this.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  }

  async searchFor(query: string): Promise<void> {
    await this.searchLauncher.waitFor({ state: 'visible', timeout: 15_000 });
    await this.searchLauncher.click();

    await this.searchField.waitFor({ state: 'visible', timeout: 10_000 });
    await this.searchField.fill('');
    await this.searchField.fill(query);

    await this.page.waitForTimeout(2000);
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  }

  async getSearchResultCount(): Promise<number> {
    await this.page.waitForTimeout(1000);
    return this.searchResultCardList().count();
  }

  async clickFirstResult(): Promise<void> {
    const card = this.firstSearchResultCard();
    await card.shouldBeVisible();
    await card.hoverCard();
    await this.page.waitForTimeout(1500);
    await card.expandOrOpenDetail();
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
