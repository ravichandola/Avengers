import { FocusOptions, LaunchOptions, UIElement, WindowBounds, WindowState } from '../../core/types';

/**
 * Shared desktop automation contract. Implemented by {@link WindowsAdapter}; macOS uses the
 * same surface without formally implementing this interface (unchanged legacy adapter).
 */
export interface IDesktopAdapter {
  connect(
    appName: string,
    pid?: number,
    windowState?: WindowState,
  ): Promise<{ pid: number; title: string }>;

  launch(appName: string, options?: LaunchOptions): Promise<{ pid: number }>;
  close(appName: string): Promise<void>;

  getElements(appName?: string, max?: number): Promise<UIElement[]>;
  click(target: UIElement | string): Promise<void>;
  fill(target: UIElement | string, value: string): Promise<void>;
  keyPress(keys: string): Promise<void>;
  getText(target: UIElement | string): Promise<string>;
  waitForElement(selector: string, timeoutMs?: number): Promise<UIElement>;

  focus(opts?: FocusOptions): Promise<boolean>;
  screenshot(): Promise<Buffer>;
  screenshotWindow(): Promise<Buffer>;
  getWindowBounds(): Promise<WindowBounds | null>;
}
