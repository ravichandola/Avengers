import { IDriver } from '../core/base-driver';
import { WaitOptions } from '../core/types';

/**
 * Lazy element reference — a small "locator" wrapper for any `IDriver` (desktop, mobile, browser).
 * Define fields at the top of your POM class and call `click` / `fill` on them so you do not repeat selectors.
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
export class ElementRef {
  constructor(
    private readonly driver: IDriver,
    readonly selector: string,
  ) {}

  async click(): Promise<void> {
    await this.driver.click(this.selector);
  }

  async fill(value: string): Promise<void> {
    await this.driver.fill(this.selector, value);
  }

  async getText(): Promise<string> {
    return this.driver.getText(this.selector);
  }

  async waitFor(opts?: WaitOptions): Promise<void> {
    await this.driver.waitFor(this.selector, opts);
  }

  async hover(): Promise<void> {
    await this.driver.hover(this.selector);
  }

  async isVisible(): Promise<boolean> {
    return this.driver.isVisible(this.selector);
  }

  async isEnabled(): Promise<boolean> {
    return this.driver.isEnabled(this.selector);
  }

  async check(): Promise<void> {
    await this.driver.check(this.selector);
  }

  async uncheck(): Promise<void> {
    await this.driver.uncheck(this.selector);
  }

  async select(value: string): Promise<void> {
    await this.driver.select(this.selector, value);
  }
}
