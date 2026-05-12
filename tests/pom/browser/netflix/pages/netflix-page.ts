import type { Locator } from 'playwright';
import { pomPages } from '../../../../../src/drivers/browser/pom';
import { LlmJudge, EvalLabel } from '../../../../../src/eval';

import { NetflixLandingFooterBlock } from '../blocks/netflix-landing-footer-block';
import { NetflixLandingHeaderBlock } from '../blocks/netflix-landing-header-block';

/**
 * Netflix regional marketing / entry ({@link pomPages.WebPage}).
 *
 * Region POMs: {@link NetflixLandingHeaderBlock}, {@link NetflixLandingFooterBlock}.
 * Footer links live on **`footer()`** only (no duplication on this class) — they are scoped under
 * `<footer>` for stability.
 */
export class NetflixPage extends pomPages.WebPage {
  static readonly entryUrl = 'https://www.netflix.com/in/';

  protected baseUrl(): string {
    return 'https://www.netflix.com';
  }

  async shouldBeVisible(): Promise<pomPages.RootContainer> {
    await this.heroGetStartedButton
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(async () => {
        await this.header().shouldBeVisible();
      });
    return this;
  }

  header(): NetflixLandingHeaderBlock {
    return new NetflixLandingHeaderBlock(this.page);
  }

  footer(): NetflixLandingFooterBlock {
    return new NetflixLandingFooterBlock(this.page);
  }

  readonly heroEmailField = this.locator('[name="email"]').first();

  readonly heroGetStartedButton = this.getByRole('button', { name: /^get started$/i }).first();

  /** Second email hero / sticky strip (same `name=` as hero; positional). */
  readonly secondaryEmailField = this.locator('[name="email"]').nth(1);

  readonly secondaryGetStartedButton = this.getByRole('button', { name: /^get started$/i }).nth(1);

  /** NMHP “Popular…” row tiles — stable when you match on title substring. */
  popularTitleCarouselButton(titleFragment: string | RegExp): Locator {
    const pattern =
      typeof titleFragment === 'string'
        ? new RegExp(titleFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        : titleFragment;
    return this.page.getByRole('button', { name: pattern });
  }

  nmhpFaqAccordionToggle(zeroBasedIndex: number): Locator {
    return this.page.locator(`#button--nmhp-faq-accordion--${zeroBasedIndex}`);
  }

  async open(): Promise<void> {
    await this.goto('/in/');
  }

  async getURL(): Promise<string> {
    return this.page.url();
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  async fillForm(data: { heroEmail?: string; secondaryEmail?: string }): Promise<void> {
    if (data.heroEmail !== undefined) await this.heroEmailField.fill(data.heroEmail);
    if (data.secondaryEmail !== undefined) await this.secondaryEmailField.fill(data.secondaryEmail);
  }

  async judgeLandingQuality(): Promise<{ passed: boolean; rationale: string }> {
    const url = await this.getURL();
    const title = await this.getTitle();
    const candidate = JSON.stringify({ url, title });
    const judge = new LlmJudge();
    const outcome = await judge.evaluate({
      criteria:
        'PASS if this looks like a real Netflix entry or regional home page: URL should relate to netflix.com and title should be meaningful. FAIL if blank, error, or clearly wrong site.',
      candidateOutput: candidate,
      examples: [
        {
          input: '{"url":"https://www.netflix.com/in/","title":"Netflix"}',
          result: { rationale: 'Netflix domain and title present.', label: EvalLabel.PASS },
        },
        {
          input: '{"url":"about:blank","title":""}',
          result: { rationale: 'No real page.', label: EvalLabel.FAIL },
        },
      ],
    });

    if ('data' in outcome) {
      return {
        passed: outcome.data.label === EvalLabel.PASS,
        rationale: outcome.data.rationale,
      };
    }
    if ('unavailable' in outcome) {
      return { passed: false, rationale: outcome.unavailable };
    }
    return { passed: false, rationale: outcome.parseError };
  }
}
