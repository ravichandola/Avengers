import { Browser } from 'playwright';
import { IDriver } from './base-driver';
import { FrameworkConfig, resolveConfig } from './config';
import { Platform } from './types';
import { BrowserDriver } from '../drivers/browser/browser-driver';
import { DesktopDriver } from '../drivers/desktop/desktop-driver';
import { MobileDriver } from '../drivers/mobile/mobile-driver';
import { APIDriver } from '../drivers/api/api-driver';
import { VisionProvider } from '../vision/vision-provider';
import { VisionDriverWrapper } from '../vision/vision-driver-mixin';

export interface DriverCreateOptions {
  platform: Platform;
  browser?: Browser;
  config?: Partial<FrameworkConfig>;
}

export class DriverFactory {
  static create(options: DriverCreateOptions): IDriver {
    const config = resolveConfig({ platform: options.platform, ...options.config });
    let driver: IDriver;

    switch (options.platform) {
      case 'chromium':
      case 'firefox':
      case 'webkit':
        driver = new BrowserDriver(config, options.browser);
        break;

      case 'macos':
      case 'windows':
        driver = new DesktopDriver(config);
        break;

      case 'ios':
      case 'android':
        driver = new MobileDriver(config);
        break;

      case 'api':
        return new APIDriver(config);

      default:
        throw new Error(`Unsupported platform: ${options.platform}`);
    }

    const vision = new VisionProvider({
      apiKey: config.vision?.apiKey,
      model: config.vision?.model,
    });

    if (vision.isAvailable() && config.vision?.enabled !== false) {
      return new VisionDriverWrapper(driver, vision);
    }

    return driver;
  }
}
