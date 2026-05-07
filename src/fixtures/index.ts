import { test as base, expect } from '@playwright/test';
import { IDriver } from '../core/base-driver';
import { DriverFactory } from '../core/driver-factory';
import { Platform, LaunchOptions } from '../core/types';
import { PageManager } from '../drivers/browser/page-manager';
import { APIDriver } from '../drivers/api/api-driver';
import { AuthManager } from '../auth/auth-manager';
import { CheckpointManager } from '../session/checkpoint-manager';
import {
  createNoopResumableFlow,
  createResumableFlow,
  runSteps,
  Step,
  type ResumableFlow,
} from '../session/resumable-steps';
import { tryUnwrapBrowserDriver } from '../core/unwrap-browser-driver';
import { PomManager } from '../pom/pom-manager';
import { resolveConfig } from '../core/config';
import { resolveBrowserLaunchUrl } from '../core/env-loader';
import { logger } from '../utils/logger';
import { NetworkMonitor } from '../drivers/browser/network/network-monitor';

export interface TestFixtures {
  app: IDriver;
  pages: PageManager;
  api: APIDriver;
  auth: typeof AuthManager;
  checkpoint: CheckpointManager;
  /** Linear checkpointed steps — use {@link ResumableFlow.step} instead of building a `Step[]` for {@link runSteps}. */
  resumable: ResumableFlow;
  /** Page-object factory + tab helpers for the current {@link IDriver} — see {@link PomManager}. */
  pom: PomManager;
  network: NetworkMonitor;
}

const BROWSER_PLATFORMS = ['chromium', 'firefox', 'webkit'];

function getTaggedValue(title: string, key: string): string | undefined {
  const regex = new RegExp(`(?:^|\\s)@${key}=([^\\s]+)`, 'i');
  const match = title.match(regex);
  return match?.[1];
}

export const test = base.extend<TestFixtures>({

  /**
   * Auto-launched driver — ready to use; you do not have to call `launch()` in every test.
   *
   * **Platform** is inferred from the test file name:
   *   `*.browser.spec.ts` → browser (`chromium` / channel from env)
   *   `*.desktop.spec.ts` → macOS or Windows app
   *   `*.mobile.spec.ts`  → iOS or Android
   *   `*.api.spec.ts`     → API client
   *
   * Values come from `.env` / scope env files — you normally do not duplicate them in the test.
   *
   * **Browser:** If `BROWSER_BASE_URL` or `BASE_URL` is set, auto-launch may open that URL.
   * The same fallback applies when you call `app.launch({})`, `app.launch({ url: '' })`, or omit `url`:
   * see `resolveBrowserLaunchUrl()` in `src/core/env-loader.ts`.
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
        const url = resolveBrowserLaunchUrl(
          metadata.baseURL != null ? String(metadata.baseURL) : undefined,
        );
        if (url) target.url = url;
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

  resumable: async ({ app }, use, testInfo) => {
    const bd = tryUnwrapBrowserDriver(app);
    let inner: ResumableFlow | null = null;

    const ensure = async (): Promise<ResumableFlow> => {
      if (!inner) {
        inner = bd
          ? await createResumableFlow({
              testId: testInfo.testId,
              driver: app,
              getContext: () => bd.getContext(),
            })
          : createNoopResumableFlow(app);
      }
      return inner;
    };

    const flow: ResumableFlow = {
      async step(name, fn) {
        return (await ensure()).step(name, fn);
      },
      async complete() {
        if (inner) {
          await inner.complete();
        }
      },
    };

    await use(flow);
    if (testInfo.status === 'passed') {
      await flow.complete();
    }
  },

  pom: async ({ app }, use) => {
    await use(new PomManager(app));
  },

  network: async ({}, use, testInfo) => {
    const metadata = (testInfo.project as any).metadata ?? {};
    const platform: Platform = metadata.platform ?? 'chromium';

    if (!BROWSER_PLATFORMS.includes(platform)) {
      await use(null as any);
      return;
    }

    const monitor = new NetworkMonitor();
    await use(monitor);

    const hasNetworkTag = testInfo.title.includes('@network')
      || testInfo.tags?.some?.((t: string) => t === '@network');
    const shouldAttach = testInfo.status !== 'passed' || hasNetworkTag;

    if (shouldAttach && monitor.hasEntries()) {
      const summary = monitor.getSummary(
        testInfo.testId,
        testInfo.title,
        testInfo.status ?? 'unknown',
      );
      await testInfo.attach('network-log', {
        body: JSON.stringify(summary, null, 2),
        contentType: 'application/json',
      });
      await testInfo.attach('network-summary', {
        body: monitor.toHumanReadable(),
        contentType: 'text/plain',
      });
    }

    monitor.stop();
    monitor.clear();
  },
});

export {
  expect,
  runSteps,
  Step,
  NetworkMonitor,
  createResumableFlow,
  createNoopResumableFlow,
  tryUnwrapBrowserDriver,
  PomManager,
  type ResumableFlow,
};
