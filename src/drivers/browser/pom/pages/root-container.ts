import type { FrameLocator, Locator, Page } from 'playwright';

import { GenericPageObject } from './generic-page-object';

/**
 * Base for hierarchy-style POMs: a shared {@link page} and `_root` for chained locators.
 * Subclasses must implement {@link shouldBeVisible} and define {@link _root}.
 */
export abstract class RootContainer extends GenericPageObject {
  abstract get page(): Page;

  abstract _root: Locator | Page | FrameLocator;

  abstract shouldBeVisible(): Promise<RootContainer>;

  locator(...args: Parameters<Locator['locator']>): ReturnType<Locator['locator']> {
    return this._root.locator(...(args as Parameters<Page['locator']>));
  }

  getByAltText(...args: Parameters<Locator['getByAltText']>): ReturnType<Locator['getByAltText']> {
    return this._root.getByAltText(...(args as Parameters<Page['getByAltText']>));
  }

  getByLabel(...args: Parameters<Locator['getByLabel']>): ReturnType<Locator['getByLabel']> {
    return this._root.getByLabel(...(args as Parameters<Page['getByLabel']>));
  }

  getByPlaceholder(...args: Parameters<Locator['getByPlaceholder']>): ReturnType<Locator['getByPlaceholder']> {
    return this._root.getByPlaceholder(...(args as Parameters<Page['getByPlaceholder']>));
  }

  getByRole(...args: Parameters<Locator['getByRole']>): ReturnType<Locator['getByRole']> {
    return this._root.getByRole(...(args as Parameters<Page['getByRole']>));
  }

  getByTestId(...args: Parameters<Locator['getByTestId']>): ReturnType<Locator['getByTestId']> {
    return this._root.getByTestId(...(args as Parameters<Page['getByTestId']>));
  }

  getByText(...args: Parameters<Locator['getByText']>): ReturnType<Locator['getByText']> {
    return this._root.getByText(...(args as Parameters<Page['getByText']>));
  }

  getByTitle(...args: Parameters<Locator['getByTitle']>): ReturnType<Locator['getByTitle']> {
    return this._root.getByTitle(...(args as Parameters<Page['getByTitle']>));
  }

  frameLocator(...args: Parameters<Locator['frameLocator']>): ReturnType<Locator['frameLocator']> {
    return this._root.frameLocator(...(args as Parameters<Page['frameLocator']>));
  }
}
