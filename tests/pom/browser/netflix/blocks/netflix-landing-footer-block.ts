import type { Locator } from 'playwright';
import { pomPages } from '../../../../../src/drivers/browser/pom';

/**
 * Footer link column (marketing site).
 * Prefer these over page-wide text queries — every locator is scoped to {@link _root}.
 */
export class NetflixLandingFooterBlock extends pomPages.Block {
  get _root(): Locator {
    return this.page.locator('footer').first();
  }

  readonly indiaSupportPhoneLink = this.getByRole('link', { name: '000-800-919-1743' });
  readonly faqLink = this.getByRole('link', { name: 'FAQ' });
  readonly helpCentreLink = this.getByRole('link', { name: 'Help Centre' });
  readonly accountLink = this.getByRole('link', { name: 'Account' });
  readonly mediaCentreLink = this.getByRole('link', { name: 'Media Centre' });
  readonly investorRelationsLink = this.getByRole('link', { name: 'Investor Relations' });
  readonly jobsLink = this.getByRole('link', { name: 'Jobs' });
  readonly waysToWatchLink = this.getByRole('link', { name: 'Ways to Watch' });
  readonly termsOfUseLink = this.getByRole('link', { name: 'Terms of Use' });
  readonly privacyLink = this.getByRole('link', { name: 'Privacy' });
  readonly cookiePreferencesLink = this.getByRole('link', { name: 'Cookie Preferences' });
  readonly corporateInformationLink = this.getByRole('link', { name: 'Corporate Information' });
  readonly contactUsLink = this.getByRole('link', { name: 'Contact Us' });
  readonly speedTestLink = this.getByRole('link', { name: 'Speed Test' });
  readonly legalNoticesLink = this.getByRole('link', { name: 'Legal Notices' });
  readonly onlyOnNetflixLink = this.getByRole('link', { name: 'Only on Netflix' });

  async shouldBeVisible(): Promise<pomPages.RootContainer> {
    await this._root.waitFor({ state: 'visible', timeout: 15_000 });
    return this;
  }
}
