import { pomPages } from '../../../../../src/drivers/browser/pom';

/** One search-result / title card; {@link _root} is the card root locator. */
export class NetflixSearchResultCardContainer extends pomPages.Container {
  async shouldBeVisible(): Promise<pomPages.RootContainer> {
    await this._root.waitFor({ state: 'visible', timeout: 10_000 });
    return this;
  }

  async hoverCard(): Promise<void> {
    await this._root.hover();
  }

  async expandOrOpenDetail(): Promise<void> {
    const expandToDetail = this.locator(
      '[data-uia="expand-to-detail-button"], .slider-item button[data-uia], .title-card',
    ).first();
    await expandToDetail.click({ timeout: 5_000 }).catch(async () => {
      await this._root.click();
    });
  }
}
