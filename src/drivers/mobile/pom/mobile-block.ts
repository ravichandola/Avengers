import { MobileDriver } from '../mobile-driver';
import { ElementRef } from '../../../pom/element-ref';

/**
 * Scoped mobile block — bottom sheet, nav bar, card section.
 *
 * ```ts
 * class BottomNav extends MobileBlock {
 *   readonly homeTab     = this.element('home_tab');
 *   readonly searchTab   = this.element('search_tab');
 *   readonly profileTab  = this.element('profile_tab');
 *
 *   async goToProfile() { await this.profileTab.click(); }
 * }
 * ```
 */
export abstract class MobileBlock {
  constructor(
    protected readonly driver: MobileDriver,
    protected readonly rootPrefix: string = '',
  ) {}

  element(selector: string): ElementRef {
    const fullSelector = this.rootPrefix ? `${this.rootPrefix}.${selector}` : selector;
    return new ElementRef(this.driver, fullSelector);
  }
}
