import type { Locator } from 'playwright';
import { pomPages } from '../../../../../src/drivers/browser/pom';

/** Marketing header / banner (logged-out Netflix landing). */
export class NetflixLandingHeaderBlock extends pomPages.Block {
  get _root(): Locator {
    return this.page.locator('header').or(this.page.locator('[role="banner"]')).first();
  }

  /** Primary “Sign in” control in header / hero band. */
  readonly signInLink = this.getByRole('link', { name: /^sign\s+in$/i });

  async shouldBeVisible(): Promise<pomPages.RootContainer> {
    await this.signInLink.waitFor({ state: 'visible', timeout: 20_000 }).catch(async () => {
      await this._root.waitFor({ state: 'visible', timeout: 5_000 });
    });
    return this;
  }
}
