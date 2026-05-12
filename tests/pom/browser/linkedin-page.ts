import { PageObject } from '../../../src/drivers/browser/pom/page-object';

/** Auto-generated POM for https://www.linkedin.com/ */
export class LinkedinPage extends PageObject {
  static readonly entryUrl = "https://www.linkedin.com/";

  // ─── Navigation ────────────────────────────────────────

  readonly linkedin = this.locator("a[role=\"link\"]:has-text(\"LinkedIn\")");
  readonly topContent = this.locator("a[role=\"link\"]:has-text(\"Top Content\")");
  readonly people = this.locator("a[role=\"link\"]:has-text(\"People\")");
  readonly learning = this.locator("a[role=\"link\"]:has-text(\"Learning\")");
  readonly jobs = this.locator("a[role=\"link\"]:has-text(\"Jobs\")");
  readonly games = this.locator("a[role=\"link\"]:has-text(\"Games\")");
  readonly signIn = this.locator("a[role=\"link\"]:has-text(\"Sign in\")");
  readonly joinNow = this.locator("a[role=\"link\"]:has-text(\"Join now\")");

  // ─── Sections ──────────────────────────────────────────

  readonly signInWithEmail = this.locator("a[role=\"link\"]:has-text(\"Sign in with email\")");
  readonly userAgreement = this.locator("a[role=\"link\"]:has-text(\"User Agreement\")");
  readonly privacyPolicy = this.locator("a[role=\"link\"]:has-text(\"Privacy Policy\")");
  readonly cookiePolicy = this.locator("a[role=\"link\"]:has-text(\"Cookie Policy\")");
  readonly joinNow2 = this.locator("a[role=\"link\"]:has-text(\"Join now\")");
  readonly career = this.locator("a[role=\"link\"]:has-text(\"Career\")");
  readonly productivity = this.locator("a[role=\"link\"]:has-text(\"Productivity\")");
  readonly finance = this.locator("a[role=\"link\"]:has-text(\"Finance\")");
  readonly softSkillsEmotionalIntelligence = this.locator("a[role=\"link\"]:has-text(\"Soft Skills & Emotional Intelligence\")");
  readonly projectManagement = this.locator("a[role=\"link\"]:has-text(\"Project Management\")");
  readonly education = this.locator("a[role=\"link\"]:has-text(\"Education\")");
  readonly technology = this.locator("a[role=\"link\"]:has-text(\"Technology\")");
  readonly leadership = this.locator("a[role=\"link\"]:has-text(\"Leadership\")");
  readonly ecommerce = this.locator("a[role=\"link\"]:has-text(\"Ecommerce\")");
  readonly showAllTopContent = this.locator("[aria-label=\"Show all top content\"]");
  readonly engineering = this.locator("a[role=\"link\"]:has-text(\"Engineering\")");
  readonly businessDevelopment = this.locator("a[role=\"link\"]:has-text(\"Business Development\")");
  readonly finance2 = this.locator("a[role=\"link\"]:has-text(\"Finance\")");
  readonly administrativeAssistant = this.locator("a[role=\"link\"]:has-text(\"Administrative Assistant\")");
  readonly retailAssociate = this.locator("a[role=\"link\"]:has-text(\"Retail Associate\")");
  readonly customerService = this.locator("a[role=\"link\"]:has-text(\"Customer Service\")");
  readonly operations = this.locator("a[role=\"link\"]:has-text(\"Operations\")");
  readonly informationTechnology = this.locator("a[role=\"link\"]:has-text(\"Information Technology\")");
  readonly marketing = this.locator("a[role=\"link\"]:has-text(\"Marketing\")");
  readonly humanResources = this.locator("a[role=\"link\"]:has-text(\"Human Resources\")");
  readonly showMore = this.locator("button[role=\"button\"]:has-text(\"Show more\")");
  readonly postAJob = this.locator("a[role=\"link\"]:has-text(\"Post a job\")");
  readonly eCommercePlatforms = this.locator("a[role=\"link\"]:has-text(\"E-Commerce Platforms\")");
  readonly crmSoftware = this.locator("a[role=\"link\"]:has-text(\"CRM Software\")");
  readonly humanResourcesManagementSystems = this.locator("a[role=\"link\"]:has-text(\"Human Resources Management Systems\")");
  readonly recruitingSoftware = this.locator("a[role=\"link\"]:has-text(\"Recruiting Software\")");
  readonly salesIntelligenceSoftware = this.locator("a[role=\"link\"]:has-text(\"Sales Intelligence Software\")");
  readonly projectManagementSoftware = this.locator("a[role=\"link\"]:has-text(\"Project Management Software\")");
  readonly helpDeskSoftware = this.locator("a[role=\"link\"]:has-text(\"Help Desk Software\")");
  readonly socialNetworkingSoftware = this.locator("a[role=\"link\"]:has-text(\"Social Networking Software\")");
  readonly desktopPublishingSoftware = this.locator("a[role=\"link\"]:has-text(\"Desktop Publishing Software\")");
  readonly showAllSoftwaresAndPlatforms = this.locator("[aria-label=\"Show all softwares and platforms\"]");
  readonly patches = this.locator("a[role=\"link\"]:has-text(\"Patches\")");
  readonly zip = this.locator("a[role=\"link\"]:has-text(\"Zip\")");
  readonly miniSudoku = this.locator("a[role=\"link\"]:has-text(\"Mini Sudoku\")");
  readonly queens = this.locator("a[role=\"link\"]:has-text(\"Queens\")");
  readonly tango = this.locator("a[role=\"link\"]:has-text(\"Tango\")");
  readonly pinpoint = this.locator("a[role=\"link\"]:has-text(\"Pinpoint\")");
  readonly crossclimb = this.locator("a[role=\"link\"]:has-text(\"Crossclimb\")");
  readonly letTheRightPeopleKnowYouReOpenToWorkWith = this.locator("xpath=(//div)[54]");
  readonly nextSlide = this.locator("[aria-label=\"Next Slide\"]");
  readonly findPeopleYouKnow = this.locator("a[role=\"link\"]:has-text(\"Find people you know\")");
  readonly chooseATopicToLearnAbout = this.locator("button[role=\"button\"]:has-text(\"Choose a topic to learn about\")");
  readonly findACoworkerOrClassmate = this.locator("a[role=\"link\"]:has-text(\"Find a coworker or classmate\")");
  readonly findANewJob = this.locator("a[role=\"link\"]:has-text(\"Find a new job\")");
  readonly findACourseOrTraining = this.locator("a[role=\"link\"]:has-text(\"Find a course or training\")");
  readonly getStarted = this.locator("a[role=\"link\"]:has-text(\"Get started\")");
  readonly signUp = this.locator("a[role=\"link\"]:has-text(\"Sign Up\")");
  readonly helpCenter = this.locator("a[role=\"link\"]:has-text(\"Help Center\")");
  readonly about = this.locator("a[role=\"link\"]:has-text(\"About\")");
  readonly press = this.locator("a[role=\"link\"]:has-text(\"Press\")");
  readonly blog = this.locator("a[role=\"link\"]:has-text(\"Blog\")");
  readonly careers = this.locator("a[role=\"link\"]:has-text(\"Careers\")");
  readonly developers = this.locator("a[role=\"link\"]:has-text(\"Developers\")");
  readonly learning2 = this.locator("a[role=\"link\"]:has-text(\"Learning\")");
  readonly jobs2 = this.locator("a[role=\"link\"]:has-text(\"Jobs\")");
  readonly games2 = this.locator("a[role=\"link\"]:has-text(\"Games\")");
  readonly mobile = this.locator("a[role=\"link\"]:has-text(\"Mobile\")");
  readonly services = this.locator("a[role=\"link\"]:has-text(\"Services\")");
  readonly products = this.locator("a[role=\"link\"]:has-text(\"Products\")");
  readonly topCompanies = this.locator("a[role=\"link\"]:has-text(\"Top Companies\")");
  readonly topStartups = this.locator("a[role=\"link\"]:has-text(\"Top Startups\")");
  readonly topColleges = this.locator("a[role=\"link\"]:has-text(\"Top Colleges\")");
  readonly talent = this.locator("a[role=\"link\"]:has-text(\"Talent\")");
  readonly marketing2 = this.locator("a[role=\"link\"]:has-text(\"Marketing\")");
  readonly sales = this.locator("a[role=\"link\"]:has-text(\"Sales\")");

  // ─── Other ─────────────────────────────────────────────

  readonly skipToMainContent = this.locator("a[role=\"link\"]:has-text(\"Skip to main content\")");

  async open(): Promise<void> {
    await this.navigate(LinkedinPage.entryUrl);
  }
}
