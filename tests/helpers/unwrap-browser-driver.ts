import type { IDriver } from '../../src/core/base-driver';
import { BrowserDriver } from '../../src/drivers/browser/browser-driver';
import { VisionDriverWrapper } from '../../src/vision/vision-driver-mixin';

/** `DriverFactory` may wrap {@link BrowserDriver} in {@link VisionDriverWrapper}. */
export function unwrapBrowserDriver(driver: IDriver): BrowserDriver {
  let cur: IDriver = driver;
  while (cur instanceof VisionDriverWrapper) {
    cur = (cur as unknown as { inner: IDriver }).inner;
  }
  if (!(cur instanceof BrowserDriver)) {
    throw new Error('unwrapBrowserDriver: underlying driver is not BrowserDriver');
  }
  return cur;
}
