import type { Browser, BrowserContext, ViewportSize } from 'playwright';

export interface NewContextFromStorageOptions {
  browser: Browser;
  storagePath: string;
  viewport?: ViewportSize;
  /** If set, closed before creating the new context */
  closePrevious?: BrowserContext | null;
}

/**
 * Close the previous context (if any) and open a new one with Playwright `storageState`.
 * Caller should `await context.newPage()` (and wire it into their page manager).
 */
export async function newContextFromStorageFile(
  options: NewContextFromStorageOptions,
): Promise<BrowserContext> {
  const { browser, storagePath, viewport = { width: 1280, height: 720 }, closePrevious } = options;

  if (closePrevious) {
    await closePrevious.close();
  }

  return browser.newContext({
    viewport,
    storageState: storagePath,
  });
}
