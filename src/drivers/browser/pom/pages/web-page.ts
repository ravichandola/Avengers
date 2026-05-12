import type { Page } from 'playwright';

import { RootContainer } from './root-container';

/**
 * Full page with a URL — override {@link baseUrl} and call {@link goto} with relative paths.
 */
export abstract class WebPage extends RootContainer {
  constructor(protected readonly ownerPage: Page) {
    super();
  }

  get page(): Page {
    return this.ownerPage;
  }

  get _root(): RootContainer['_root'] {
    return this.ownerPage;
  }

  protected abstract baseUrl(): string;

  abstract shouldBeVisible(): Promise<RootContainer>;

  protected async goto(...args: unknown[]): Promise<WebPage | void> {
    if (args.length !== 1 || (typeof args[0] !== 'string' && !(args[0] instanceof URL))) {
      throw new Error('WebPage.goto: pass a single string or URL');
    }
    const url = args[0] instanceof URL ? args[0] : new URL(args[0], this.baseUrl());
    await this.ownerPage.goto(url.toString());
  }
}
