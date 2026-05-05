import { LaunchOptions, WaitOptions, ActionResult, UIElement } from './types';

export interface IDriver {
  readonly platform: string;

  launch(target: LaunchOptions): Promise<void>;
  close(): Promise<void>;

  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  getText(selector: string): Promise<string>;
  waitFor(selector: string, opts?: WaitOptions): Promise<void>;
  hover(selector: string): Promise<void>;
  check(selector: string): Promise<void>;
  uncheck(selector: string): Promise<void>;
  select(selector: string, value: string): Promise<void>;
  keyPress(key: string, modifiers?: string[]): Promise<void>;
  scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number): Promise<void>;
  navigate(url: string): Promise<void>;

  screenshot(): Promise<Buffer>;
  getTitle(): Promise<string>;
  getURL(): Promise<string>;

  isVisible(selector: string): Promise<boolean>;
  isEnabled(selector: string): Promise<boolean>;

  getElements(): Promise<UIElement[]>;
}
