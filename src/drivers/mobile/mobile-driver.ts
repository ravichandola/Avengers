import { IDriver } from '../../core/base-driver';
import { FrameworkConfig } from '../../core/config';
import { LaunchOptions, WaitOptions, UIElement } from '../../core/types';
import { sleep } from '../../utils/retry';
import { logger } from '../../utils/logger';

/**
 * MobileDriver wraps WebdriverIO + Appium for iOS/Android automation.
 * Uses dynamic import so the framework doesn't hard-fail if wdio isn't installed.
 */
export class MobileDriver implements IDriver {
  readonly platform: string;
  private config: FrameworkConfig;
  private driver: any = null;

  constructor(config: FrameworkConfig) {
    this.platform = config.platform;
    this.config = config;
  }

  async launch(target: LaunchOptions): Promise<void> {
    const mobileConfig = this.config.mobile;
    const isIOS = this.config.platform === 'ios';

    const capabilities: Record<string, any> = {
      platformName: isIOS ? 'iOS' : 'Android',
      'appium:automationName': mobileConfig?.automationName ?? (isIOS ? 'XCUITest' : 'UiAutomator2'),
      'appium:deviceName': mobileConfig?.deviceName ?? (isIOS ? 'iPhone 15' : 'Pixel 7'),
    };

    if (mobileConfig?.platformVersion) {
      capabilities['appium:platformVersion'] = mobileConfig.platformVersion;
    }

    if (isIOS) {
      capabilities['appium:bundleId'] = target.bundleId ?? mobileConfig?.bundleId;
    } else {
      capabilities['appium:appPackage'] = target.appPackage ?? mobileConfig?.appPackage;
      capabilities['appium:appActivity'] = target.appActivity ?? mobileConfig?.appActivity;
    }

    if (mobileConfig?.appPath || target.name) {
      capabilities['appium:app'] = mobileConfig?.appPath ?? target.name;
    }

    const host = mobileConfig?.appiumHost ?? 'localhost';
    const port = mobileConfig?.appiumPort ?? 4723;

    try {
      const { remote } = await import('webdriverio');
      this.driver = await remote({
        hostname: host,
        port,
        path: '/wd/hub',
        capabilities,
      });
      logger.info('MobileDriver', `Connected to ${this.platform} device: ${capabilities['appium:deviceName']}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to connect to Appium at ${host}:${port}. Is Appium running? ${msg}`);
    }
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.deleteSession();
      this.driver = null;
    }
    logger.info('MobileDriver', 'Session closed');
  }

  async click(selector: string): Promise<void> {
    const el = await this.findElement(selector);
    await el.click();
  }

  async fill(selector: string, value: string): Promise<void> {
    const el = await this.findElement(selector);
    await el.clearValue();
    await el.setValue(value);
  }

  async getText(selector: string): Promise<string> {
    const el = await this.findElement(selector);
    return await el.getText();
  }

  async waitFor(selector: string, opts?: WaitOptions): Promise<void> {
    const timeout = opts?.timeout ?? 10000;
    const el = await this.findElement(selector);
    await el.waitForDisplayed({ timeout });
  }

  async hover(_selector: string): Promise<void> {
    logger.warn('MobileDriver', 'hover() is not applicable for mobile');
  }

  async check(selector: string): Promise<void> {
    await this.click(selector);
  }

  async uncheck(selector: string): Promise<void> {
    await this.click(selector);
  }

  async select(selector: string, value: string): Promise<void> {
    await this.click(selector);
    await sleep(300);
    await this.click(value);
  }

  async keyPress(key: string): Promise<void> {
    if (this.config.platform === 'android') {
      const keyCodeMap: Record<string, number> = {
        Enter: 66, Backspace: 67, Tab: 61, Escape: 111,
      };
      const keyCode = keyCodeMap[key];
      if (keyCode) {
        await this.driver.pressKeyCode(keyCode);
      }
    } else {
      logger.warn('MobileDriver', `keyPress("${key}") limited on iOS`);
    }
  }

  async scroll(direction: 'up' | 'down' | 'left' | 'right'): Promise<void> {
    if (this.config.platform === 'ios') {
      await this.driver.execute('mobile: scroll', { direction });
    } else {
      const dirMap = { up: 'up', down: 'down', left: 'left', right: 'right' };
      await this.driver.execute('mobile: scrollGesture', {
        direction: dirMap[direction],
        percent: 0.75,
      });
    }
  }

  async navigate(url: string): Promise<void> {
    await this.driver.url(url);
  }

  async screenshot(): Promise<Buffer> {
    const base64 = await this.driver.takeScreenshot();
    return Buffer.from(base64, 'base64');
  }

  async getTitle(): Promise<string> {
    try {
      return await this.driver.getTitle();
    } catch {
      return '';
    }
  }

  async getURL(): Promise<string> {
    try {
      return await this.driver.getUrl();
    } catch {
      return '';
    }
  }

  async isVisible(selector: string): Promise<boolean> {
    try {
      const el = await this.findElement(selector);
      return await el.isDisplayed();
    } catch {
      return false;
    }
  }

  async isEnabled(selector: string): Promise<boolean> {
    try {
      const el = await this.findElement(selector);
      return await el.isEnabled();
    } catch {
      return false;
    }
  }

  async getElements(): Promise<UIElement[]> {
    return [];
  }

  private async findElement(selector: string): Promise<any> {
    if (!this.driver) throw new Error('Mobile driver not launched');

    const strategies = [
      () => this.driver.$(`~${selector}`),
      () => this.driver.$(`[name="${selector}"]`),
      () => this.driver.$(`//*[@content-desc="${selector}" or @text="${selector}" or @resource-id="${selector}" or @label="${selector}"]`),
      () => this.driver.$(`*=${selector}`),
    ];

    for (const strategy of strategies) {
      try {
        const el = await strategy();
        if (el && await el.isExisting()) return el;
      } catch { /* try next */ }
    }

    throw new Error(`Element not found: "${selector}"`);
  }
}
