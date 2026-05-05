import { DesktopDriver } from '../desktop-driver';
import { ElementRef } from '../../../pom/element-ref';
import { DriverPage } from '../../../pom/driver-page';

/**
 * Desktop POM base — locators top pe define karo, methods me use karo.
 *
 * ```ts
 * class SettingsWindow extends DesktopPage {
 *   readonly closeBtn     = this.element('close_button');
 *   readonly volumeSlider = this.element('volume_slider');
 *   readonly darkMode     = this.element('dark_mode_toggle');
 *
 *   async enableDarkMode() {
 *     await this.darkMode.click();
 *   }
 * }
 * ```
 */
export abstract class DesktopPage extends DriverPage {
  constructor(protected readonly driver: DesktopDriver) {
    super(driver);
  }

  /** Lazy element ref — store as class property. */
  element(selector: string): ElementRef {
    return new ElementRef(this.driver, selector);
  }

  async getTitle(): Promise<string> {
    return this.driver.getTitle();
  }

  async screenshot(): Promise<Buffer> {
    return this.driver.screenshot();
  }

  async keyPress(key: string): Promise<void> {
    await this.driver.keyPress(key);
  }
}
