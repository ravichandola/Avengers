import { Locator, Page } from 'playwright';
import { resolveSelector } from '../resolve-selector';

/** Root region: a CSS selector string, or an existing Playwright `Locator` (for nested blocks). */
export type BlockRoot = string | Locator;

/**
 * Scoped UI block — sidebar, modal, card, form section.
 * Every locator is scoped under `root`.
 *
 * ```ts
 * class CartSummary extends Block {
 *   readonly total     = this.locator('.total-price');
 *   readonly checkout  = this.locator('#checkout-btn');
 *   readonly itemCount = this.locator('.item-count');
 *
 *   async getTotal() { return this.total.textContent(); }
 *   async startCheckout() { await this.checkout.click(); }
 * }
 *
 * const cart = page.block(CartSummary, '[data-testid="cart-summary"]');
 * await cart.startCheckout();
 * ```
 */
export class Block {
  readonly root: Locator;

  constructor(page: Page, root: BlockRoot) {
    this.root = typeof root === 'string' ? page.locator(root) : root;
  }

  /** Scoped locator — store as class property. */
  locator(selector: string): Locator {
    return this.root.locator(resolveSelector(selector));
  }

  /** Nested child block. */
  child(selector: string): Block;
  child<T extends Block>(Class: new (page: Page, root: BlockRoot) => T, selector: string): T;
  child<T extends Block>(
    classOrSelector: string | (new (page: Page, root: BlockRoot) => T),
    selector?: string,
  ): Block | T {
    if (typeof classOrSelector === 'function') {
      return new classOrSelector(
        this.root.page(),
        this.root.locator(resolveSelector(selector!)),
      );
    }
    return new Block(
      this.root.page(),
      this.root.locator(resolveSelector(classOrSelector)),
    );
  }
}

/**
 * Sidebar / rail — {@link Block} + common nav patterns.
 * Pass your own root, or the default tries `[data-testid="sidebar"]`.
 */
export class Sidebar extends Block {
  constructor(page: Page, root: BlockRoot = '[data-testid="sidebar"]') {
    super(page, root);
  }

  /** Click a link by accessible name (within the root scope). */
  async clickNavLink(name: string | RegExp): Promise<void> {
    await this.root.getByRole('link', { name }).click();
  }

  /** Section toggle — accordion / collapse button. */
  async toggleSection(name: string | RegExp): Promise<void> {
    await this.root.getByRole('button', { name }).click();
  }
}
