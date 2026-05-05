import { DesktopPage } from '../../../src/drivers/desktop/pom/desktop-page';
import { DesktopDriver } from '../../../src/drivers/desktop/desktop-driver';

/** Apple TV sign-in — apple-tv.desktop.spec.ts */
export class AppleTVSignInScreen extends DesktopPage {
  readonly signInButton = this.element('signin_button');
  readonly emailInput = this.element('apple_id_email_input');
  readonly passwordInput = this.element('apple_id_password_input');
  readonly loginButton = this.element('login_button');

  constructor(driver: DesktopDriver) {
    super(driver);
  }

  async signInWithAppleId(email: string, password: string): Promise<void> {
    await this.signInButton.click();
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
