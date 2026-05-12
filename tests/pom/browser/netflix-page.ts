import { PageObject } from '../../../src/drivers/browser/pom/page-object';
import { LlmJudge, EvalLabel } from '../../../src/eval';

/** Auto-generated POM for https://www.netflix.com/in/ */
export class NetflixPage extends PageObject {
  static readonly entryUrl = "https://www.netflix.com/in/";

  // ─── Header ────────────────────────────────────────────

  readonly r2l6lalalalb96 = this.locator("[id=\":R2l6lalalalb96:\"]");
  readonly signIn = this.locator("a[role=\"link\"]:has-text(\"Sign In\")");

  // ─── Form Fields ───────────────────────────────────────

  readonly r0 = this.locator("[name=\"email\"]");
  readonly getStarted = this.locator("button[role=\"button\"]:has-text(\"Get Started\")");
  readonly r6 = this.locator("[name=\"email\"]");
  readonly getStarted2 = this.locator("button[role=\"button\"]:has-text(\"Get Started\")");

  // ─── Footer ────────────────────────────────────────────

  readonly el0008009191743 = this.locator("a[role=\"link\"]:has-text(\"000-800-919-1743\")");
  readonly faq = this.locator("a[role=\"link\"]:has-text(\"FAQ\")");
  readonly helpCentre = this.locator("a[role=\"link\"]:has-text(\"Help Centre\")");
  readonly account = this.locator("a[role=\"link\"]:has-text(\"Account\")");
  readonly mediaCentre = this.locator("a[role=\"link\"]:has-text(\"Media Centre\")");
  readonly investorRelations = this.locator("a[role=\"link\"]:has-text(\"Investor Relations\")");
  readonly jobs = this.locator("a[role=\"link\"]:has-text(\"Jobs\")");
  readonly waysToWatch = this.locator("a[role=\"link\"]:has-text(\"Ways to Watch\")");
  readonly termsOfUse = this.locator("a[role=\"link\"]:has-text(\"Terms of Use\")");
  readonly privacy = this.locator("a[role=\"link\"]:has-text(\"Privacy\")");
  readonly cookiePreferences = this.locator("a[role=\"link\"]:has-text(\"Cookie Preferences\")");
  readonly corporateInformation = this.locator("a[role=\"link\"]:has-text(\"Corporate Information\")");
  readonly contactUs = this.locator("a[role=\"link\"]:has-text(\"Contact Us\")");
  readonly speedTest = this.locator("a[role=\"link\"]:has-text(\"Speed Test\")");
  readonly legalNotices = this.locator("a[role=\"link\"]:has-text(\"Legal Notices\")");
  readonly onlyOnNetflix = this.locator("a[role=\"link\"]:has-text(\"Only on Netflix\")");
  readonly r59qlbanb96 = this.locator("[id=\":R59qlbanb96:\"]");

  // ─── Other ─────────────────────────────────────────────

  readonly dhurandhar11 = this.locator("button[role=\"button\"]:has-text(\"Dhurandhar\n1\n1\")");
  readonly youth22 = this.locator("button[role=\"button\"]:has-text(\"Youth\n2\n2\")");
  readonly ifWishesCouldKill33 = this.locator("button[role=\"button\"]:has-text(\"If Wishes Could Kill\n3\n3\")");
  readonly ustaadBhagatSingh44 = this.locator("button[role=\"button\"]:has-text(\"Ustaad Bhagat Singh\n4\n4\")");
  readonly toaster55 = this.locator("button[role=\"button\"]:has-text(\"Toaster\n5\n5\")");
  readonly border266 = this.locator("button[role=\"button\"]:has-text(\"Border 2\n6\n6\")");
  readonly mardaani377 = this.locator("button[role=\"button\"]:has-text(\"Mardaani 3\n7\n7\")");
  readonly theGreatIndianKapilShow88 = this.locator("button[role=\"button\"]:has-text(\"The Great Indian Kapil Show\n8\n8\")");
  readonly raakaasa99 = this.locator("button[role=\"button\"]:has-text(\"Raakaasa\n9\n9\")");
  readonly doDeewaneSeherMein1010 = this.locator("button[role=\"button\"]:has-text(\"Do Deewane Seher Mein\n10\n10\")");
  readonly buttonNmhpFaqAccordion0 = this.locator("#button--nmhp-faq-accordion--0");
  readonly buttonNmhpFaqAccordion1 = this.locator("#button--nmhp-faq-accordion--1");
  readonly buttonNmhpFaqAccordion2 = this.locator("#button--nmhp-faq-accordion--2");
  readonly buttonNmhpFaqAccordion3 = this.locator("#button--nmhp-faq-accordion--3");
  readonly buttonNmhpFaqAccordion4 = this.locator("#button--nmhp-faq-accordion--4");
  readonly buttonNmhpFaqAccordion5 = this.locator("#button--nmhp-faq-accordion--5");

  async open(): Promise<void> {
    await this.navigate(NetflixPage.entryUrl);
  }

  async fillForm(data: { r0?: string; r6?: string }): Promise<void> {
    if (data.r0 !== undefined) await this.r0.fill(data.r0);
    if (data.r6 !== undefined) await this.r6.fill(data.r6);
  }

  /** LLM rubric over current URL + title (used by eval / judge browser specs). */
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
