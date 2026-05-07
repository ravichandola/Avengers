import { Browser, BrowserContext, Page, chromium, firefox, webkit } from 'playwright';
import { IDriver } from '../../core/base-driver';
import { FrameworkConfig } from '../../core/config';
import { LaunchOptions, WaitOptions, UIElement } from '../../core/types';
import { PageManager } from './page-manager';
import { PageObject } from './pom/page-object';
import { AuthManager } from '../../auth/auth-manager';
import { logger } from '../../utils/logger';
import { newContextFromStorageFile } from '../../session/copyable/playwright-resume';
import { resolveSelector } from './resolve-selector';

export class BrowserDriver implements IDriver {
  readonly platform: string;

  private config: FrameworkConfig;
  private externalBrowser: Browser | undefined;
  private ownedBrowser: Browser | null = null;
  private context: BrowserContext | null = null;
  private _pageManager: PageManager | null = null;

  constructor(config: FrameworkConfig, browser?: Browser) {
    this.platform = config.platform;
    this.config = config;
    this.externalBrowser = browser;
  }

  get pages(): PageManager {
    if (!this._pageManager) throw new Error('Browser not launched. Call launch() first.');
    return this._pageManager;
  }

  private get page(): Page {
    return this.pages.current();
  }

  async launch(target: LaunchOptions): Promise<void> {
    if (this.context && this._pageManager) {
      if (target.url) {
        await this.page.goto(target.url, { waitUntil: 'domcontentloaded' });
        logger.info('BrowserDriver', `Navigated → ${target.url}`);
      }
      return;
    }

    let browser: Browser;

    if (this.externalBrowser) {
      browser = this.externalBrowser;
    } else {
      const launchOpts = {
        headless: this.config.browser?.headless ?? false,
        channel: this.config.browser?.channel,
      };

      switch (this.config.platform) {
        case 'firefox':
          browser = await firefox.launch(launchOpts);
          break;
        case 'webkit':
          browser = await webkit.launch(launchOpts);
          break;
        default:
          browser = await chromium.launch(launchOpts);
          break;
      }
      this.ownedBrowser = browser;
    }

    let storageState: string | undefined;
    if (target.storageStatePath) {
      storageState = target.storageStatePath;
    } else if (target.authProfile) {
      const exists = await AuthManager.exists(target.authProfile);
      if (exists) {
        storageState = await AuthManager.loadProfile(target.authProfile);
        logger.info('BrowserDriver', `Using auth profile: ${target.authProfile}`);
      } else {
        logger.warn('BrowserDriver', `Auth profile "${target.authProfile}" not found, launching fresh`);
      }
    }

    this.context = await browser.newContext({
      viewport: this.config.browser?.viewport ?? { width: 1280, height: 720 },
      storageState: storageState,
    });
    const page = await this.context.newPage();
    this._pageManager = new PageManager(this.context);

    if (target.url) {
      await page.goto(target.url, { waitUntil: 'domcontentloaded' });
    }

    logger.info('BrowserDriver', `Launched ${this.platform}${target.url ? ` → ${target.url}` : ''}${storageState ? ' (authenticated)' : ''}`);
  }

  /**
   * Drop the current context and open a new one from Playwright storageState.
   * Same Browser instance is kept (fixture-supplied or launched). Used when
   * resuming a checkpointed `runSteps` flow.
   */
  async recreateContextFromStorageState(storageStatePath: string): Promise<void> {
    const browser = this.externalBrowser ?? this.ownedBrowser;
    if (!browser) throw new Error('BrowserDriver: no browser — call launch() first');

    const viewport = this.config.browser?.viewport ?? { width: 1280, height: 720 };
    this.context = await newContextFromStorageFile({
      browser,
      storagePath: storageStatePath,
      viewport,
      closePrevious: this.context,
    });
    this._pageManager = null;
    await this.context.newPage();
    this._pageManager = new PageManager(this.context);
    logger.info('BrowserDriver', `Context recreated from storage state: ${storageStatePath}`);
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.ownedBrowser) {
      await this.ownedBrowser.close();
      this.ownedBrowser = null;
    }
    this._pageManager = null;
    logger.info('BrowserDriver', 'Closed');
  }

  async click(selector: string): Promise<void> {
    await this.page.locator(this.resolveSelector(selector)).click();
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.locator(this.resolveSelector(selector)).fill(value);
  }

  async getText(selector: string): Promise<string> {
    const text = await this.page.locator(this.resolveSelector(selector)).textContent();
    return text ?? '';
  }

  async waitFor(selector: string, opts?: WaitOptions): Promise<void> {
    await this.page.locator(this.resolveSelector(selector)).waitFor({
      state: opts?.state ?? 'visible',
      timeout: opts?.timeout ?? 30000,
    });
  }

  async hover(selector: string): Promise<void> {
    await this.page.locator(this.resolveSelector(selector)).hover();
  }

  async check(selector: string): Promise<void> {
    await this.page.locator(this.resolveSelector(selector)).check();
  }

  async uncheck(selector: string): Promise<void> {
    await this.page.locator(this.resolveSelector(selector)).uncheck();
  }

  async select(selector: string, value: string): Promise<void> {
    await this.page.locator(this.resolveSelector(selector)).selectOption(value);
  }

  async keyPress(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount = 300): Promise<void> {
    const delta = { up: [0, -amount], down: [0, amount], left: [-amount, 0], right: [amount, 0] };
    const [dx, dy] = delta[direction];
    await this.page.mouse.wheel(dx, dy);
  }

  async navigate(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async screenshot(): Promise<Buffer> {
    return await this.page.screenshot();
  }

  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  async getURL(): Promise<string> {
    return this.page.url();
  }

  async isVisible(selector: string): Promise<boolean> {
    return await this.page.locator(this.resolveSelector(selector)).isVisible();
  }

  async isEnabled(selector: string): Promise<boolean> {
    return await this.page.locator(this.resolveSelector(selector)).isEnabled();
  }

  async getElements(): Promise<UIElement[]> {
    return [];
  }

  getContext(): BrowserContext | null {
    return this.context;
  }

  getPageManager(): PageManager | null {
    return this._pageManager;
  }

  /** Current tab par full-page POM (`PageObject`). */
  asPageObject(): PageObject {
    return new PageObject(this.pages.current());
  }

  /**
   * Save the current browser state as a named auth profile for reuse.
   */
  async saveAuthProfile(name: string): Promise<void> {
    if (!this.context) throw new Error('No context to save');
    await AuthManager.saveProfile(name, this.context);
  }

  private resolveSelector(selector: string): string {
    return resolveSelector(selector);
  }
}
