import type { Locator } from 'playwright';
import { pomPages } from '../../../../../src/drivers/browser/pom';

/** Preview / hover “mini-modal” above a title tile on browse search. */
export class NetflixMiniModalBlock extends pomPages.Block {
  get _root(): Locator {
    return this.page.locator('[data-uia="mini-modal"], .previewModal--container').first();
  }

  /** Title treatment / heading inside the preview panel. */
  readonly posterTitleHeading = this.locator(
    '.previewModal--player-titleTreatment, strong',
  ).first();

  async shouldBeVisible(): Promise<pomPages.RootContainer> {
    await this._root.waitFor({ state: 'visible', timeout: 10_000 });
    return this;
  }
}
