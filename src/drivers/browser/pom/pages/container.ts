import type { Locator, Page } from 'playwright';

import { RootContainer } from './root-container';

/**
 * Repeated row/card/list item — root {@link Locator} is chosen at runtime.
 */
export abstract class Container extends RootContainer {
  _root: Locator;

  constructor(root: Locator) {
    super();
    this._root = root;
  }

  get page(): Page {
    return this._root.page();
  }

  abstract shouldBeVisible(): Promise<RootContainer>;
}
