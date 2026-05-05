import { DriverPage, EvalLabel } from '../../../src/pom/driver-page';

/** www.netflix.com — netflix.browser.spec.ts */
export class NetflixPage extends DriverPage {
  static readonly homeUrl = 'https://www.netflix.com';
  static readonly browseUrl = 'https://www.netflix.com/browse';

  async openHome(): Promise<void> {
    await this.navigate(NetflixPage.homeUrl);
  }

  /**
   * Example: judge the landing page using the parent's eval pipeline.
   * Criteria + few-shot examples are page-specific;
   * the judge infrastructure is inherited from DriverPage.
   */
  async judgeLandingQuality(): Promise<{ passed: boolean; rationale: string }> {
    const url = await this.getURL();
    const title = await this.getTitle();

    const result = await this.judgePassFail({
      context: 'Browser smoke validation for Netflix landing page.',
      criteria: [
        'PASS if URL belongs to netflix.com and page title is non-empty and relevant to Netflix.',
        'FAIL if URL is outside netflix.com OR title is empty/irrelevant.',
      ].join('\n'),
      candidateOutput: JSON.stringify({ url, title }, null, 2),
      examples: [
        {
          input: '{"url":"https://www.netflix.com/in","title":"Netflix India - Watch TV Shows Online"}',
          result: {
            rationale: 'URL is in netflix.com and title is non-empty and brand-relevant.',
            label: EvalLabel.PASS,
          },
        },
        {
          input: '{"url":"https://example.com","title":""}',
          result: {
            rationale: 'URL is not netflix.com and title is empty.',
            label: EvalLabel.FAIL,
          },
        },
      ],
    });

    if ('data' in result) {
      return {
        passed: result.data.label === EvalLabel.PASS,
        rationale: result.data.rationale,
      };
    }

    const reason = 'unavailable' in result ? result.unavailable : result.parseError;
    return { passed: false, rationale: reason };
  }
}
