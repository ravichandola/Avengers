import { IDriver } from './base-driver';
import { BrowserDriver } from '../drivers/browser/browser-driver';
import { VisionDriverWrapper } from '../vision/vision-driver-mixin';

/** Resolve a {@link BrowserDriver} under optional {@link VisionDriverWrapper}. */
export function tryUnwrapBrowserDriver(d: IDriver): BrowserDriver | null {
  let cur: IDriver = d;
  while (cur instanceof VisionDriverWrapper) {
    cur = (cur as unknown as { inner: IDriver }).inner;
  }
  return cur instanceof BrowserDriver ? cur : null;
}
