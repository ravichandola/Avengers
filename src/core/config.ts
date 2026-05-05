import { Platform, WindowState } from './types';

export interface FrameworkConfig {
  platform: Platform;
  browser?: BrowserConfig;
  desktop?: DesktopConfig;
  mobile?: MobileConfig;
  api?: APIConfig;
  retry?: RetryConfig;
  vision?: VisionConfig;
}

export interface BrowserConfig {
  channel?: 'chrome' | 'msedge' | 'chrome-beta' | 'msedge-beta';
  headless?: boolean;
  viewport?: { width: number; height: number };
  baseURL?: string;
  timeout?: number;
}

export interface DesktopConfig {
  appName?: string;
  appPath?: string;
  pid?: number;
  useVisionFallback?: boolean;
  /** Initial window state on launch. Default: `"maximized"`. */
  windowState?: WindowState;
}

export interface MobileConfig {
  deviceName?: string;
  platformVersion?: string;
  bundleId?: string;
  appPackage?: string;
  appActivity?: string;
  appPath?: string;
  automationName?: 'XCUITest' | 'UiAutomator2';
  appiumHost?: string;
  appiumPort?: number;
}

export interface APIConfig {
  baseURL: string;
  headers?: Record<string, string>;
  timeout?: number;
  auth?: {
    type: 'bearer' | 'basic' | 'apikey';
    token?: string;
    username?: string;
    password?: string;
    key?: string;
    headerName?: string;
  };
}

export interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  backoff: 'linear' | 'exponential';
}

export interface VisionConfig {
  apiKey?: string;
  model?: string;
  enabled?: boolean;
}

export function resolveConfig(overrides?: Partial<FrameworkConfig>): FrameworkConfig {
  return {
    platform: overrides?.platform ?? 'chromium',
    browser: overrides?.browser,
    desktop: overrides?.desktop,
    mobile: overrides?.mobile,
    api: overrides?.api,
    retry: overrides?.retry ?? { maxRetries: 3, delayMs: 1000, backoff: 'linear' },
    vision: overrides?.vision,
  };
}
