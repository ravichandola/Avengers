import { test as base, expect } from '@playwright/test';
import { IDriver } from '../core/base-driver';
import { DriverFactory } from '../core/driver-factory';
import { Platform, LaunchOptions } from '../core/types';
import { PageManager } from '../drivers/browser/page-manager';
import { BrowserDriver } from '../drivers/browser/browser-driver';
import { APIDriver } from '../drivers/api/api-driver';
import { AuthManager } from '../auth/auth-manager';
import { CheckpointManager } from '../session/checkpoint-manager';
import { runSteps, Step } from '../session/resumable-steps';
import { resolveConfig } from '../core/config';
import { logger } from '../utils/logger';

export interface TestFixtures {
  app: IDriver;
  pages: PageManager;
  api: APIDriver;
  auth: typeof AuthManager;
  checkpoint: CheckpointManager;
}

const BROWSER_PLATFORMS = ['chromium', 'firefox', 'webkit'];

function getTaggedValue(title: string, key: string): string | undefined {
  const regex = new RegExp(`(?:^|\\s)@${key}=([^\\s]+)`, 'i');
  const match = title.match(regex);
  return match?.[1];
}

export const test = base.extend<TestFixtures>({

  /**
   * Auto-launched driver — ready to use, no launch() needed in tests.
   *
   * Platform auto-detect hota hai test file pattern se:
   *   *.browser.spec.ts → Chrome (ya jo BROWSER_CHANNEL me set ho)
   *   *.desktop.spec.ts → macOS/Windows app
   *   *.mobile.spec.ts  → iOS/Android device
   *   *.api.spec.ts     → API client
   *
   * Config .env files se aata hai — test me kuch likhne ki zarurat nahi.
   */
  app: async ({ browser, browserName }, use, testInfo) => {
    const metadata = (testInfo.project as any).metadata ?? {};
    const taggedPlatform = getTaggedValue(testInfo.title, 'platform')?.toLowerCase();
    const platform: Platform = (taggedPlatform as Platform) ?? metadata.platform ?? browserName as Platform;
    const autoLaunch: boolean = metadata.autoLaunch ?? true;

    const driver = DriverFactory.create({
      platform,
      browser: BROWSER_PLATFORMS.includes(platform) ? browser : undefined,
      config: {
        platform,
        browser: BROWSER_PLATFORMS.includes(platform) ? {
          headless: metadata.headless,
          viewport: metadata.viewport,
          channel: metadata.channel,
        } : undefined,
        desktop: metadata.desktop,
        mobile: metadata.mobile,
        api: metadata.api,
      },
    });

    if (autoLaunch) {
      const target: LaunchOptions = {};
      let shouldLaunch = true;

      if (BROWSER_PLATFORMS.includes(platform)) {
        if (metadata.baseURL) target.url = metadata.baseURL;
      } else if (platform === 'macos' || platform === 'windows') {
        const taggedDesktopApp = getTaggedValue(testInfo.title, 'app');
        if (taggedDesktopApp || metadata.desktop?.appName) {
          target.name = taggedDesktopApp ?? metadata.desktop.appName;
          // Default desktop apps to maximized for predictable layouts.
          // Override per-test with @windowState=normal|fullscreen|maximized
          // or per-project via metadata.desktop.windowState.
          const taggedState = getTaggedValue(testInfo.title, 'windowState')?.toLowerCase();
          target.windowState =
            (taggedState as LaunchOptions['windowState']) ??
            metadata.desktop?.windowState ??
            'maximized';
        } else {
          shouldLaunch = false;
        }
      } else if (platform === 'ios') {
        if (metadata.mobile?.bundleId) {
          target.bundleId = metadata.mobile.bundleId;
        } else {
          shouldLaunch = false;
        }
      } else if (platform === 'android') {
        if (metadata.mobile?.appPackage) {
          target.appPackage = metadata.mobile.appPackage;
          if (metadata.mobile?.appActivity) target.appActivity = metadata.mobile.appActivity;
        } else {
          shouldLaunch = false;
        }
      } else if (platform === 'api') {
        if (metadata.api?.baseURL) target.url = metadata.api.baseURL;
      }

      if (shouldLaunch) {
        await driver.launch(target);
        logger.info('Fixture', `Auto-launched ${platform}`);
      }
    }

    await use(driver);
    await driver.close();
  },

  pages: async ({ browser, browserName }, use, testInfo) => {
    const metadata = (testInfo.project as any).metadata ?? {};
    const platform: Platform = metadata.platform ?? browserName as Platform;

    if (BROWSER_PLATFORMS.includes(platform)) {
      const context = await browser.newContext();
      await context.newPage();
      const manager = new PageManager(context);
      await use(manager);
      await context.close();
    } else {
      await use(null as any);
    }
  },

  api: async ({}, use, testInfo) => {
    const metadata = (testInfo.project as any).metadata ?? {};
    const config = resolveConfig({
      platform: 'api',
      api: metadata.api ?? { baseURL: metadata.apiBaseURL ?? '' },
    });
    const driver = new APIDriver(config);

    if (metadata.autoLaunch !== false && config.api?.baseURL) {
      await driver.launch({ url: config.api.baseURL });
    }

    await use(driver);
    await driver.close();
  },

  auth: async ({}, use) => {
    await use(AuthManager);
  },

  checkpoint: async ({}, use, testInfo) => {
    const manager = new CheckpointManager(testInfo.testId);
    await use(manager);
  },
});

export { expect, runSteps, Step };
