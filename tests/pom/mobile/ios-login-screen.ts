import { MobileScreen } from '../../../src/drivers/mobile/pom/mobile-screen';
import { MobileDriver } from '../../../src/drivers/mobile/mobile-driver';

/** iOS login — ios-login.mobile.spec.ts */
export class IosLoginScreen extends MobileScreen {
  readonly mainScreen = this.element('main_screen');
  readonly signInButton = this.element('sign_in_button');
  readonly emailField = this.element('email_field');
  readonly passwordField = this.element('password_field');
  readonly submitButton = this.element('submit_button');
  readonly homeScreen = this.element('home_screen');

  constructor(driver: MobileDriver) {
    super(driver);
  }

  async isMainScreenVisible(): Promise<boolean> {
    return this.mainScreen.isVisible();
  }

  async login(email: string, password: string): Promise<void> {
    await this.signInButton.click();
    await this.emailField.fill(email);
    await this.passwordField.fill(password);
    await this.submitButton.click();
    await this.homeScreen.waitFor({ timeout: 10000 });
  }
}
