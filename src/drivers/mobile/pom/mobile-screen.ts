import { MobileDriver } from '../mobile-driver';
import { ElementRef } from '../../../pom/element-ref';

/**
 * Mobile screen POM base — locators top pe define karo, methods me use karo.
 *
 * ```ts
 * class LoginScreen extends MobileScreen {
 *   readonly email    = this.element('email_field');
 *   readonly password = this.element('password_field');
 *   readonly submit   = this.element('submit_button');
 *
 *   async login(e: string, p: string) {
 *     await this.email.fill(e);
 *     await this.password.fill(p);
 *     await this.submit.click();
 *   }
 * }
 * ```
 */
export abstract class MobileScreen {
  constructor(protected readonly driver: MobileDriver) {}

  /** Lazy element ref — store as class property. */
  element(selector: string): ElementRef {
    return new ElementRef(this.driver, selector);
  }

  async screenshot(): Promise<Buffer> {
    return this.driver.screenshot();
  }

  async scroll(direction: 'up' | 'down' | 'left' | 'right'): Promise<void> {
    await this.driver.scroll(direction);
  }

  async keyPress(key: string): Promise<void> {
    await this.driver.keyPress(key);
  }

  async navigate(url: string): Promise<void> {
    await this.driver.navigate(url);
  }
}
