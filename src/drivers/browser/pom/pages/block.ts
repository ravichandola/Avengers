import type { Page } from 'playwright';

import { RootContainer } from './root-container';

/**
 * Region without its own URL — nav, modal shell, panel (hierarchy POM).
 * Pass the owning {@link Page}; set {@link _root} in the subclass (often from {@link page}).
 */
export abstract class Block extends RootContainer {
  constructor(protected readonly ownerPage: Page) {
    super();
  }

  get page(): Page {
    return this.ownerPage;
  }

  abstract shouldBeVisible(): Promise<RootContainer>;
}

/**
 * @deprecated Prefer {@link Block} — `Window` clashes with the DOM global.
 */
export abstract class Window extends Block {}
