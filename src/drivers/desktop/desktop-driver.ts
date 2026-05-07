import { IDriver } from "../../core/base-driver";
import { FrameworkConfig, resolveConfig } from "../../core/config";
import {
  FocusOptions,
  LaunchOptions,
  WaitOptions,
  UIElement,
  WindowBounds,
  WindowState,
} from "../../core/types";
import { MacOSAdapter } from "./macos-adapter";
import { WindowsAdapter } from "./windows-adapter";
import { withRetry } from "../../utils/retry";
import { sleep } from "../../utils/retry";
import { logger } from "../../utils/logger";

export class DesktopDriver implements IDriver, AsyncDisposable {
  readonly platform: string;
  private config: FrameworkConfig;
  private macAdapter: MacOSAdapter | null = null;
  private winAdapter: WindowsAdapter | null = null;
  /** Auto-call ensureFocused() before every click/fill/keyPress. */
  private autoFocus: boolean = true;

  constructor(config: FrameworkConfig) {
    this.platform = config.platform;
    this.config = config;
  }

  private get adapter(): MacOSAdapter | WindowsAdapter {
    if (this.macAdapter) return this.macAdapter;
    if (this.winAdapter) return this.winAdapter;
    throw new Error("Desktop driver not launched. Call launch() first.");
  }

  async launch(target: LaunchOptions): Promise<void> {
    const appName = target.name ?? this.config.desktop?.appName ?? "";
    if (!appName)
      throw new Error("App name is required for desktop automation");

    const windowState: WindowState =
      target.windowState ?? this.config.desktop?.windowState ?? "maximized";

    if (this.config.platform === "macos") {
      this.macAdapter = new MacOSAdapter();
      await this.macAdapter.connect(appName, target.pid, windowState);
    } else {
      this.winAdapter = new WindowsAdapter();
      await this.winAdapter.connect(appName, target.pid, windowState);
    }

    logger.info(
      "DesktopDriver",
      `Launched ${this.platform}: ${appName} (window=${windowState})`,
    );
  }

  async close(): Promise<void> {
    if (this.macAdapter) await this.macAdapter.disconnect();
    if (this.winAdapter) await this.winAdapter.disconnect();
    this.macAdapter = null;
    this.winAdapter = null;
    logger.info("DesktopDriver", "Closed");
  }

  /**
   * AsyncDisposable hook — enables `await using` syntax (TS 5.2+) so the
   * driver auto-closes when the scope exits, even on exceptions:
   *
   * ```ts
   * await using app = await createDesktopApp({ name: 'Notes' });
   * await app.click('New Note');
   * // app.close() is called automatically here, no try/finally needed
   * ```
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  // ─── Focus / window management ──────────────────────────────────────────

  /**
   * Bring the connected app's window to the foreground using its PID.
   * Restores minimized windows, validates the process is alive, and waits
   * until the OS confirms the target PID owns the foreground window.
   *
   * Call this before any sensitive interaction sequence (typed input,
   * keyboard shortcuts, clipboard ops) to prevent keystrokes from leaking
   * into another app.
   */
  async focus(opts?: FocusOptions): Promise<boolean> {
    return this.adapter.focus(opts);
  }

  /** Returns true iff the foreground window currently belongs to our PID. */
  async isFocused(): Promise<boolean> {
    return this.adapter.isFocused();
  }

  /** Focus only if not already focused — cheap when already foreground. */
  async ensureFocused(opts?: FocusOptions): Promise<boolean> {
    return this.adapter.ensureFocused(opts);
  }

  /**
   * Toggle automatic ensureFocused() before click/fill/keyPress.
   * Default: true. Disable only for batch operations where you call
   * focus() explicitly once at the start.
   */
  setAutoFocus(enabled: boolean): void {
    this.autoFocus = enabled;
  }

  // ─── Vision-grade window primitives ─────────────────────────────────────

  /**
   * Pre-flight focus for vision flows: bring the PID's window to the
   * foreground and wait a short settle period for animations + focus rings
   * to stabilise before capturing a screenshot.
   */
  async focusForVision(settleMs?: number): Promise<void> {
    await this.adapter.focusForVision(settleMs);
  }

  async screenshotWindow(): Promise<Buffer> {
    return this.adapter.screenshotWindow();
  }

  async getWindowBounds(): Promise<WindowBounds | null> {
    return this.adapter.getWindowBounds();
  }

  // ─── Window state ───────────────────────────────────────────────────────

  /**
   * Maximize the connected app's primary window to fill the available
   * desktop. Cross-platform — uses AX zoom on macOS, `ShowWindow(SW_MAXIMIZE)`
   * on Windows. Idempotent.
   */
  async maximize(): Promise<void> {
    await this.adapter.maximize();
  }

  /** Toggle native fullscreen for the connected app. */
  async setFullScreen(on: boolean = true): Promise<void> {
    await this.adapter.setFullScreen(on);
  }

  /** Apply an explicit window state at any time post-launch. */
  async applyWindowState(state: WindowState): Promise<void> {
    await this.adapter.applyWindowState(state);
  }

  private async maybeFocus(): Promise<void> {
    if (!this.autoFocus) return;
    try {
      await this.adapter.ensureFocused();
    } catch (e) {
      logger.warn("DesktopDriver", `auto-focus failed, continuing: ${e}`);
    }
  }

  // ─── Interactions ───────────────────────────────────────────────────────

  async click(selector: string): Promise<void> {
    await this.maybeFocus();
    const retry = this.config.retry!;
    await withRetry(
      () => this.adapter.click(selector),
      retry,
      `click(${selector})`,
    );
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.maybeFocus();
    const retry = this.config.retry!;
    await withRetry(
      () => this.adapter.fill(selector, value),
      retry,
      `fill(${selector})`,
    );
  }

  async getText(selector: string): Promise<string> {
    return this.adapter.getText(selector);
  }

  async waitFor(selector: string, opts?: WaitOptions): Promise<void> {
    const timeout = opts?.timeout ?? 10000;
    const interval = 500;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const visible = await this.adapter.isVisible(selector);
      if (visible) return;
      await sleep(interval);
    }

    throw new Error(`waitFor("${selector}") timed out after ${timeout}ms`);
  }

  async hover(selector: string): Promise<void> {
    logger.warn(
      "DesktopDriver",
      `hover not natively supported, attempting click on ${selector}`,
    );
  }

  async check(selector: string): Promise<void> {
    await this.click(selector);
  }

  async uncheck(selector: string): Promise<void> {
    await this.click(selector);
  }

  async select(selector: string, value: string): Promise<void> {
    await this.click(selector);
    await sleep(300);
    await this.click(value);
  }

  async keyPress(key: string): Promise<void> {
    await this.maybeFocus();
    await this.adapter.keyPress(key);
  }

  async scroll(direction: "up" | "down" | "left" | "right"): Promise<void> {
    const keyMap = {
      up: "Page_Up",
      down: "Page_Down",
      left: "Home",
      right: "End",
    };
    await this.adapter.keyPress(keyMap[direction]);
  }

  async navigate(_url: string): Promise<void> {
    logger.warn(
      "DesktopDriver",
      "navigate() is not applicable for desktop apps",
    );
  }

  async screenshot(): Promise<Buffer> {
    return this.adapter.screenshot();
  }

  async getTitle(): Promise<string> {
    return this.adapter.getTitle();
  }

  async getURL(): Promise<string> {
    return "";
  }

  async isVisible(selector: string): Promise<boolean> {
    return this.adapter.isVisible(selector);
  }

  async isEnabled(selector: string): Promise<boolean> {
    const elements = await this.adapter.getElements();
    const el = elements.find(
      (e) => e.id.includes(selector) || e.name?.includes(selector),
    );
    return el?.isEnabled ?? false;
  }

  async getElements(): Promise<UIElement[]> {
    return this.adapter.getElements();
  }
}

// ─── Disposable factory ───────────────────────────────────────────────────

export interface CreateDesktopAppOptions extends LaunchOptions {
  /** Override framework config (vision, retry, desktop defaults, etc.). */
  config?: Partial<FrameworkConfig>;
}

export async function createDesktopApp(
  options: CreateDesktopAppOptions,
): Promise<DesktopDriver> {
  const platform =
    options.config?.platform ??
    (process.platform === "darwin" ? "macos" : "windows");

  const config = resolveConfig({
    platform,
    desktop: {
      ...options.config?.desktop,
      appName: options.name ?? options.config?.desktop?.appName,
    },
    vision: options.config?.vision,
    retry: options.config?.retry,
  });

  const driver = new DesktopDriver(config);
  try {
    await driver.launch(options);
  } catch (e) {
    await driver.close().catch(() => {});
    throw e;
  }
  return driver;
}
