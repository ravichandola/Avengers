import { defineConfig } from '@playwright/test';
import { loadAllEnv, env } from './src/core/env-loader';

loadAllEnv();

const channelToBrowser = (ch: string) => {
  if (ch === 'firefox') return 'firefox' as const;
  if (ch === 'webkit')  return 'webkit' as const;
  return 'chromium' as const;
};

export default defineConfig({
  testDir: './tests',
  timeout: env.timeout,
  retries: env.retries,
  reporter: [['list'], ['html', { open: 'never' }]],
  fullyParallel: true,

  projects: [
    // ─── Browser ──────────────────────────────────────────────
    {
      name: 'chrome',
      testMatch: /.*\.browser\.spec\.ts/,
      use: {
        browserName: channelToBrowser(env.browserChannel),
        channel: env.browserChannel === 'chrome' || env.browserChannel === 'msedge'
          ? env.browserChannel
          : undefined,
        headless: env.browserHeadless,
        viewport: { width: env.browserViewportW, height: env.browserViewportH },
        launchOptions: { slowMo: env.browserSlowMo },
      },
      metadata: {
        platform: 'chromium',
        autoLaunch: true,
        baseURL: env.browserBaseURL,
        headless: env.browserHeadless,
        channel: env.browserChannel,
        viewport: { width: env.browserViewportW, height: env.browserViewportH },
      },
    },
    {
      name: 'firefox',
      testMatch: /.*\.browser\.spec\.ts/,
      use: {
        browserName: 'firefox',
        headless: env.browserHeadless,
        viewport: { width: env.browserViewportW, height: env.browserViewportH },
      },
      metadata: {
        platform: 'firefox',
        autoLaunch: true,
        baseURL: env.browserBaseURL,
        headless: env.browserHeadless,
        viewport: { width: env.browserViewportW, height: env.browserViewportH },
      },
    },
    {
      name: 'webkit',
      testMatch: /.*\.browser\.spec\.ts/,
      use: {
        browserName: 'webkit',
        headless: env.browserHeadless,
        viewport: { width: env.browserViewportW, height: env.browserViewportH },
      },
      metadata: {
        platform: 'webkit',
        autoLaunch: true,
        baseURL: env.browserBaseURL,
        headless: env.browserHeadless,
        viewport: { width: env.browserViewportW, height: env.browserViewportH },
      },
    },

    // ─── Desktop ──────────────────────────────────────────────
    {
      name: 'desktop-macos',
      testMatch: /.*\.desktop\.spec\.ts/,
      metadata: {
        platform: 'macos',
        autoLaunch: true,
        desktop: {
          appName: env.desktopAppName,
          appPath: env.desktopAppPath,
          useVisionFallback: env.desktopUseVision,
        },
      },
    },
    {
      name: 'desktop-windows',
      testMatch: /.*\.desktop\.spec\.ts/,
      metadata: {
        platform: 'windows',
        autoLaunch: true,
        desktop: {
          appName: env.desktopAppName,
          appPath: env.desktopAppPath,
          useVisionFallback: env.desktopUseVision,
        },
      },
    },

    // ─── Mobile ───────────────────────────────────────────────
    {
      name: 'mobile-ios',
      testMatch: /.*\.mobile\.spec\.ts/,
      metadata: {
        platform: 'ios',
        autoLaunch: true,
        mobile: {
          deviceName: env.mobileDeviceName || 'iPhone 15',
          platformVersion: env.mobilePlatformVersion || '17.0',
          automationName: 'XCUITest' as const,
          bundleId: env.mobileBundleId,
          appPath: env.mobileAppPath,
          appiumHost: env.appiumHost,
          appiumPort: env.appiumPort,
        },
      },
    },
    {
      name: 'mobile-android',
      testMatch: /.*\.mobile\.spec\.ts/,
      metadata: {
        platform: 'android',
        autoLaunch: true,
        mobile: {
          deviceName: env.mobileDeviceName || 'Pixel 7',
          platformVersion: env.mobilePlatformVersion || '14',
          automationName: 'UiAutomator2' as const,
          appPackage: env.mobileAppPackage,
          appActivity: env.mobileAppActivity,
          appPath: env.mobileAppPath,
          appiumHost: env.appiumHost,
          appiumPort: env.appiumPort,
        },
      },
    },

    // ─── API ──────────────────────────────────────────────────
    {
      name: 'api',
      testMatch: /.*\.api\.spec\.ts/,
      metadata: {
        platform: 'api',
        autoLaunch: true,
        api: {
          baseURL: env.apiBaseURL,
          timeout: env.apiTimeout,
          auth: env.apiAuthType ? {
            type: env.apiAuthType as 'bearer' | 'basic' | 'apikey',
            token: env.apiAuthToken,
            username: env.apiAuthUser,
            password: env.apiAuthPass,
            key: env.apiAuthKey,
            headerName: env.apiAuthHeader,
          } : undefined,
        },
      },
    },
  ],
});
