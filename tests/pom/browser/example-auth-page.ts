import { DriverPage } from '../../../src/pom/driver-page';

/** example.com demo — auth-profile.browser.spec.ts */
export class ExampleAuthPage extends DriverPage {
  static readonly loginUrl = 'https://example.com/login';

  readonly emailInput = this.element('[name="email"]');
  readonly passwordInput = this.element('[name="password"]');
  readonly submitButton = this.element('button[type="submit"]');
  readonly dashboardHeader = this.element('.dashboard-header');

  async openLoginPage(): Promise<void> {
    await this.navigate(ExampleAuthPage.loginUrl);
  }

  async login(email: string, password: string): Promise<void> {
    await this.openLoginPage();
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    await this.dashboardHeader.waitFor();
  }
}
