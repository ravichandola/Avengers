import { DriverPage } from '../../../src/pom/driver-page';

/** app.example.com demo — multi-user.browser.spec.ts */
export class AppLoginPage extends DriverPage {
  static readonly loginUrl = 'https://app.example.com/login';

  readonly email = this.element('#email');
  readonly password = this.element('#password');
  readonly loginButton = this.element('#login-btn');
  readonly adminDashboard = this.element('.admin-dashboard');
  readonly userDashboard = this.element('.user-dashboard');

  async loginAsAdmin(): Promise<void> {
    await this.navigate(AppLoginPage.loginUrl);
    await this.email.fill('admin@example.com');
    await this.password.fill('adminpass');
    await this.loginButton.click();
    await this.adminDashboard.waitFor();
  }

  async loginAsRegularUser(): Promise<void> {
    await this.navigate(AppLoginPage.loginUrl);
    await this.email.fill('user@example.com');
    await this.password.fill('userpass');
    await this.loginButton.click();
    await this.userDashboard.waitFor();
  }
}
