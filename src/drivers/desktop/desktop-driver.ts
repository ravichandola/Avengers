import { IDriver } from '../../core/base-driver';
import { FrameworkConfig } from '../../core/config';
import { LaunchOptions, WaitOptions, UIElement } from '../../core/types';
import { MacOSAdapter } from './macos-adapter';
import { WindowsAdapter } from './windows-adapter';
import { withRetry } from '../../utils/retry';
import { sleep } from '../../utils/retry';
import { logger } from '../../utils/logger';

export class DesktopDriver implements IDriver {
  readonly platform: string;
  private config: FrameworkConfig;
  private macAdapter: MacOSAdapter | null = null;
  private winAdapter: WindowsAdapter | null = null;

  constructor(config: FrameworkConfig) {
    this.platform = config.platform;
    this.config = config;
  }

  private get adapter(): MacOSAdapter | WindowsAdapter {
    if (this.macAdapter) return this.macAdapter;
    if (this.winAdapter) return this.winAdapter;
    throw new Error('Desktop driver not launched. Call launch() first.');
  }

  async launch(target: LaunchOptions): Promise<void> {
    const appName = target.name ?? this.config.desktop?.appName ?? '';
    if (!appName) throw new Error('App name is required for desktop automation');

    if (this.config.platform === 'macos') {
      this.macAdapter = new MacOSAdapter();
      await this.macAdapter.connect(appName, target.pid);
    } else {
      this.winAdapter = new WindowsAdapter();
      await this.winAdapter.connect(appName, target.pid);
    }

    logger.info('DesktopDriver', `Launched ${this.platform}: ${appName}`);
  }

  async close(): Promise<void> {
    if (this.macAdapter) await this.macAdapter.disconnect();
    if (this.winAdapter) await this.winAdapter.disconnect();
    this.macAdapter = null;
    this.winAdapter = null;
    logger.info('DesktopDriver', 'Closed');
  }

  async click(selector: string): Promise<void> {
    const retry = this.config.retry!;
    await withRetry(() => this.adapter.click(selector), retry, `click(${selector})`);
  }

  async fill(selector: string, value: string): Promise<void> {
    const retry = this.config.retry!;
    await withRetry(() => this.adapter.fill(selector, value), retry, `fill(${selector})`);
  }

  async getText(selector: string): Promise<string> {
    return this.adapter.getText(selector);
  }

  async waitFor(selector: string, opts?: WaitOptions): Promise<void> {
    const timeout = opts?.timeout ?? 10000;
    const interval = 500;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const visible = await this.adapter.isVisible(selector);
      if (visible) return;
      await sleep(interval);
    }

    throw new Error(`waitFor("${selector}") timed out after ${timeout}ms`);
  }

  async hover(selector: string): Promise<void> {
    logger.warn('DesktopDriver', `hover not natively supported, attempting click on ${selector}`);
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
    await this.adapter.keyPress(key);
  }

  async scroll(direction: 'up' | 'down' | 'left' | 'right'): Promise<void> {
    const keyMap = { up: 'Page_Up', down: 'Page_Down', left: 'Home', right: 'End' };
    await this.adapter.keyPress(keyMap[direction]);
  }

  async navigate(_url: string): Promise<void> {
    logger.warn('DesktopDriver', 'navigate() is not applicable for desktop apps');
  }

  async screenshot(): Promise<Buffer> {
    return this.adapter.screenshot();
  }

  async getTitle(): Promise<string> {
    return this.adapter.getTitle();
  }

  async getURL(): Promise<string> {
    return '';
  }

  async isVisible(selector: string): Promise<boolean> {
    return this.adapter.isVisible(selector);
  }

  async isEnabled(selector: string): Promise<boolean> {
    const elements = await this.adapter.getElements();
    const el = elements.find(e => e.id.includes(selector) || e.name?.includes(selector));
    return el?.isEnabled ?? false;
  }

  async getElements(): Promise<UIElement[]> {
    return this.adapter.getElements();
  }
}
