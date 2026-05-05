import { DesktopDriver } from '../desktop-driver';
import { ElementRef } from '../../../pom/element-ref';

/**
 * Scoped desktop block — toolbar, panel, dialog section.
 * Selector prefix automatically prepend hota hai.
 *
 * ```ts
 * class Toolbar extends DesktopBlock {
 *   readonly playBtn  = this.element('play_button');
 *   readonly pauseBtn = this.element('pause_button');
 *
 *   async play()  { await this.playBtn.click(); }
 *   async pause() { await this.pauseBtn.click(); }
 * }
 * ```
 */
export abstract class DesktopBlock {
  constructor(
    protected readonly driver: DesktopDriver,
    protected readonly rootPrefix: string = '',
  ) {}

  /** Element ref — if rootPrefix set, prepends it as `prefix.selector`. */
  element(selector: string): ElementRef {
    const fullSelector = this.rootPrefix ? `${this.rootPrefix}.${selector}` : selector;
    return new ElementRef(this.driver, fullSelector);
  }
}
