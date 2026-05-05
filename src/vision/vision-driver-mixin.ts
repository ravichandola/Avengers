import { IDriver } from '../core/base-driver';
import { LaunchOptions, WaitOptions, UIElement } from '../core/types';
import { VisionProvider } from './vision-provider';
import { logger } from '../utils/logger';

/**
 * VisionDriverWrapper adds GPT-4o vision as a universal fallback to any driver.
 * When a primary action (click, fill, waitFor, isVisible) fails on an element,
 * it captures a screenshot, uses vision to locate the element, and retries
 * using coordinate-based interaction.
 */
export class VisionDriverWrapper implements IDriver {
  readonly platform: string;
  private inner: IDriver;
  private vision: VisionProvider;
  private enabled: boolean;

  constructor(inner: IDriver, vision: VisionProvider) {
    this.inner = inner;
    this.platform = inner.platform;
    this.vision = vision;
    this.enabled = vision.isAvailable();
  }

  async launch(target: LaunchOptions): Promise<void> {
    return this.inner.launch(target);
  }

  async close(): Promise<void> {
    return this.inner.close();
  }

  async click(selector: string): Promise<void> {
    try {
      await this.inner.click(selector);
    } catch (err) {
      if (!this.enabled) throw err;
      logger.info('VisionFallback', `click("${selector}") failed, trying vision...`);
      const coords = await this.locateViaVision(selector);
      if (!coords) throw err;
      await this.clickAtCoordinates(coords.x, coords.y);
    }
  }

  async fill(selector: string, value: string): Promise<void> {
    try {
      await this.inner.fill(selector, value);
    } catch (err) {
      if (!this.enabled) throw err;
      logger.info('VisionFallback', `fill("${selector}") failed, trying vision...`);
      const coords = await this.locateViaVision(selector);
      if (!coords) throw err;
      await this.clickAtCoordinates(coords.x, coords.y);
      await this.inner.keyPress('Meta+a');
      for (const char of value) {
        await this.inner.keyPress(char);
      }
    }
  }

  async getText(selector: string): Promise<string> {
    try {
      return await this.inner.getText(selector);
    } catch (err) {
      if (!this.enabled) throw err;
      logger.warn('VisionFallback', `getText("${selector}") cannot use vision fallback`);
      throw err;
    }
  }

  async waitFor(selector: string, opts?: WaitOptions): Promise<void> {
    try {
      await this.inner.waitFor(selector, opts);
    } catch (err) {
      if (!this.enabled) throw err;
      logger.info('VisionFallback', `waitFor("${selector}") failed, checking via vision...`);
      const timeout = opts?.timeout ?? 10000;
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const screenshot = await this.inner.screenshot();
        const visible = await this.vision.isElementVisible(screenshot, selector);
        if (visible) return;
        await new Promise(r => setTimeout(r, 1000));
      }
      throw err;
    }
  }

  async hover(selector: string): Promise<void> {
    try {
      await this.inner.hover(selector);
    } catch (err) {
      if (!this.enabled) throw err;
      logger.info('VisionFallback', `hover("${selector}") failed, trying vision...`);
      throw err;
    }
  }

  async check(selector: string): Promise<void> {
    try {
      await this.inner.check(selector);
    } catch (err) {
      if (!this.enabled) throw err;
      await this.click(selector);
    }
  }

  async uncheck(selector: string): Promise<void> {
    try {
      await this.inner.uncheck(selector);
    } catch (err) {
      if (!this.enabled) throw err;
      await this.click(selector);
    }
  }

  async select(selector: string, value: string): Promise<void> {
    return this.inner.select(selector, value);
  }

  async keyPress(key: string, modifiers?: string[]): Promise<void> {
    return this.inner.keyPress(key, modifiers);
  }

  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number): Promise<void> {
    return this.inner.scroll(direction, amount);
  }

  async navigate(url: string): Promise<void> {
    return this.inner.navigate(url);
  }

  async screenshot(): Promise<Buffer> {
    return this.inner.screenshot();
  }

  async getTitle(): Promise<string> {
    return this.inner.getTitle();
  }

  async getURL(): Promise<string> {
    return this.inner.getURL();
  }

  async isVisible(selector: string): Promise<boolean> {
    const structuralResult = await this.inner.isVisible(selector);
    if (structuralResult) return true;

    if (!this.enabled) return false;

    logger.info('VisionFallback', `isVisible("${selector}") checking via vision...`);
    try {
      const screenshot = await this.inner.screenshot();
      return await this.vision.isElementVisible(screenshot, selector);
    } catch {
      return false;
    }
  }

  async isEnabled(selector: string): Promise<boolean> {
    return this.inner.isEnabled(selector);
  }

  async getElements(): Promise<UIElement[]> {
    return this.inner.getElements();
  }

  /** Expose vision provider for direct use in tests */
  getVisionProvider(): VisionProvider {
    return this.vision;
  }

  private async locateViaVision(selector: string): Promise<{ x: number; y: number } | null> {
    try {
      const screenshot = await this.inner.screenshot();
      return await this.vision.locateElement(screenshot, selector);
    } catch (err) {
      logger.error('VisionFallback', `Vision location failed: ${err}`);
      return null;
    }
  }

  private async clickAtCoordinates(x: number, y: number): Promise<void> {
    const page = (this.inner as any).pages?.current?.();
    if (page && typeof page.mouse?.click === 'function') {
      await page.mouse.click(x, y);
      return;
    }

    const macAdapter = (this.inner as any).macAdapter;
    if (macAdapter && typeof macAdapter.clickCoordinates === 'function') {
      await macAdapter.clickCoordinates(x, y);
      return;
    }

    const winAdapter = (this.inner as any).winAdapter;
    if (winAdapter && typeof winAdapter.clickCoordinates === 'function') {
      await winAdapter.clickCoordinates(x, y);
      return;
    }

    throw new Error(`Cannot click at coordinates (${x}, ${y}) - no coordinate click method available`);
  }
}
