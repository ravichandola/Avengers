import type { FrameLocator, Locator, Page } from 'playwright';

/**
 * Playwright locator helpers bound to an explicit `page` (preferred).
 * Avoids global “current page” state.
 */
export function createLocators(page: Page) {
  return {
    locator(...args: Parameters<Page['locator']>): ReturnType<Page['locator']> {
      if (args[0] === '' || args[0] === undefined) {
        throw new Error('createLocators(page).locator: provide a selector string');
      }
      return page.locator(...args);
    },
    getByAltText(...args: Parameters<Page['getByAltText']>): ReturnType<Page['getByAltText']> {
      return page.getByAltText(...args);
    },
    getByLabel(...args: Parameters<Page['getByLabel']>): ReturnType<Page['getByLabel']> {
      return page.getByLabel(...args);
    },
    getByPlaceholder(...args: Parameters<Page['getByPlaceholder']>): ReturnType<Page['getByPlaceholder']> {
      return page.getByPlaceholder(...args);
    },
    getByRole(...args: Parameters<Page['getByRole']>): ReturnType<Page['getByRole']> {
      return page.getByRole(...args);
    },
    getByTestId(...args: Parameters<Page['getByTestId']>): ReturnType<Page['getByTestId']> {
      return page.getByTestId(...args);
    },
    getByText(...args: Parameters<Page['getByText']>): ReturnType<Page['getByText']> {
      return page.getByText(...args);
    },
    getByTitle(...args: Parameters<Page['getByTitle']>): ReturnType<Page['getByTitle']> {
      return page.getByTitle(...args);
    },
    frameLocator(...args: Parameters<Page['frameLocator']>): ReturnType<Page['frameLocator']> {
      return page.frameLocator(...args);
    },
  };
}

export type BoundLocators = ReturnType<typeof createLocators>;

let globalLocatorPage: Page | undefined;

/** Optional global page for {@link globalLocator} helpers (prefer {@link createLocators}). */
export function setGlobalLocatorPage(page: Page | undefined): void {
  globalLocatorPage = page;
}

function requireGlobalPage(): Page {
  if (!globalLocatorPage) {
    throw new Error('setGlobalLocatorPage(page) before using global locator helpers');
  }
  return globalLocatorPage;
}

/** @deprecated Prefer {@link createLocators} or `page.locator` on a {@link PageObject}. */
export function globalLocator(...args: Parameters<Page['locator']>): Locator {
  return requireGlobalPage().locator(...args);
}

/** @deprecated Prefer {@link createLocators}. */
export function globalGetByAltText(...args: Parameters<Page['getByAltText']>): Locator {
  return requireGlobalPage().getByAltText(...args);
}

/** @deprecated Prefer {@link createLocators}. */
export function globalGetByLabel(...args: Parameters<Page['getByLabel']>): Locator {
  return requireGlobalPage().getByLabel(...args);
}

/** @deprecated Prefer {@link createLocators}. */
export function globalGetByPlaceholder(...args: Parameters<Page['getByPlaceholder']>): Locator {
  return requireGlobalPage().getByPlaceholder(...args);
}

/** @deprecated Prefer {@link createLocators}. */
export function globalGetByRole(...args: Parameters<Page['getByRole']>): Locator {
  return requireGlobalPage().getByRole(...args);
}

/** @deprecated Prefer {@link createLocators}. */
export function globalGetByTestId(...args: Parameters<Page['getByTestId']>): Locator {
  return requireGlobalPage().getByTestId(...args);
}

/** @deprecated Prefer {@link createLocators}. */
export function globalGetByText(...args: Parameters<Page['getByText']>): Locator {
  return requireGlobalPage().getByText(...args);
}

/** @deprecated Prefer {@link createLocators}. */
export function globalGetByTitle(...args: Parameters<Page['getByTitle']>): Locator {
  return requireGlobalPage().getByTitle(...args);
}

/** @deprecated Prefer {@link createLocators}. */
export function globalFrameLocator(...args: Parameters<Page['frameLocator']>): FrameLocator {
  return requireGlobalPage().frameLocator(...args);
}
