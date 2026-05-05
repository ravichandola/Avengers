import { DesktopDriver } from "../desktop-driver";
import { ElementRef } from "../../../pom/element-ref";
import { DriverPage } from "../../../pom/driver-page";
import { FocusOptions } from "../../../core/types";

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

  /**
   * Bring this app to the foreground (PID-scoped) and verify it owns the
   * focus before continuing. Use at the start of a flow or before any
   * keyboard-sensitive sequence.
   */
  async focus(opts?: FocusOptions): Promise<boolean> {
    return this.driver.focus(opts);
  }

  /** True iff the OS reports our PID as owning the foreground window. */
  async isFocused(): Promise<boolean> {
    return this.driver.isFocused();
  }

  /** Focus only if needed — cheap when already focused. */
  async ensureFocused(opts?: FocusOptions): Promise<boolean> {
    return this.driver.ensureFocused(opts);
  }
}
