import { exec, execSync, spawn } from "child_process";
import { promisify } from "util";
import { FocusOptions, UIElement, WindowBounds, WindowState } from "../../core/types";
import { logger } from "../../utils/logger";
import { sleep, readPngSize } from "../../utils";

const execAsync = promisify(exec);

export class MacOSAdapter {
  private appName: string = "";
  private pid: number | null = null;

  async connect(
    appName: string,
    pid?: number,
    windowState?: WindowState,
  ): Promise<void> {
    this.appName = appName;

    if (pid) {
      this.assertProcessAlive(pid);
      this.pid = pid;
    } else {
      try {
        this.pid = await this.findPID(appName);
      } catch {
        await this.launchApplication(appName);
        this.pid = await this.findPID(appName);
      }
    }

    await this.focus({ restore: true, verify: true, timeoutMs: 2500 });
    if (windowState && windowState !== "normal") {
      await this.applyWindowState(windowState);
      // Re-focus after geometry change to keep PID frontmost.
      await this.ensureFocused().catch(() => {});
    }
    logger.info(
      "macOS",
      `Connected to ${appName} (PID: ${this.pid}${windowState ? `, window=${windowState}` : ""})`,
    );
  }

  async disconnect(): Promise<void> {
    this.appName = "";
    this.pid = null;
  }

  async focus(opts: FocusOptions = {}): Promise<boolean> {
    if (!this.pid) throw new Error("focus(): adapter not connected");
    const {
      restore = true,
      verify = true,
      timeoutMs = 2000,
      retries = 1,
    } = opts;

    if (!this.isProcessAlive(this.pid)) {
      throw new Error(
        `focus(): process ${this.pid} (${this.appName}) is not running`,
      );
    }

    const escapedName = this.appName.replace(/"/g, '\\"');
    const activateScript = `
      tell application "System Events"
        try
          set targetProc to first process whose unix id is ${this.pid}
          set frontmost of targetProc to true
          ${
            restore
              ? `try
            set value of attribute "AXMinimized" of every window of targetProc to false
          end try`
              : ""
          }
        on error errMsg
          tell application "${escapedName}" to activate
        end try
      end tell
    `;

    for (let attempt = 0; attempt <= retries; attempt++) {
      await this.runAppleScript(activateScript).catch((e) => {
        logger.warn(
          "macOS",
          `focus(): activate failed (attempt ${attempt + 1}): ${e}`,
        );
      });

      if (!verify) return true;
      if (await this.waitForFrontmost(timeoutMs)) {
        logger.debug("macOS", `focus(): PID ${this.pid} is frontmost`);
        return true;
      }
      if (attempt < retries) {
        logger.warn(
          "macOS",
          `focus(): retry ${attempt + 1}/${retries} for PID ${this.pid}`,
        );
        await sleep(150);
      }
    }

    logger.warn(
      "macOS",
      `focus(): PID ${this.pid} (${this.appName}) did not become frontmost`,
    );
    return false;
  }

  /** Cheap O(1) check — returns true iff our PID owns the frontmost process. */
  async isFocused(): Promise<boolean> {
    if (!this.pid) return false;
    try {
      const { stdout } = await execAsync(
        `osascript -e 'tell application "System Events" to get frontmost of (first process whose unix id is ${this.pid})'`,
      );
      return stdout.trim() === "true";
    } catch {
      return false;
    }
  }

  /** Focus only if not already focused. Use this before each interaction. */
  async ensureFocused(opts?: FocusOptions): Promise<boolean> {
    if (await this.isFocused()) return true;
    return this.focus(opts);
  }

  // ─── Window state ───────────────────────────────────────────────────────

  /**
   * Apply an initial window state to the connected app's primary window.
   * Idempotent — safe to call multiple times. Intended to be called from
   * `connect()` right after focus is acquired.
   */
  async applyWindowState(state: WindowState): Promise<void> {
    if (!this.pid) throw new Error("applyWindowState(): adapter not connected");
    if (state === "normal") return;
    if (state === "fullscreen") {
      await this.setFullScreen(true);
    } else {
      await this.maximize();
    }
  }

  /**
   * Maximize (zoom) the primary window to fill the desktop minus the menu
   * bar and dock. This is the macOS analog of "maximize" — equivalent to
   * Option-clicking the green button. We deliberately do not toggle true
   * fullscreen here because that swaps Spaces and breaks AX-based
   * automation in subtle ways. Use `setFullScreen(true)` if that's wanted.
   */
  async maximize(): Promise<void> {
    if (!this.pid) throw new Error("maximize(): adapter not connected");
    const script = `
      tell application "System Events"
        try
          set targetProc to first process whose unix id is ${this.pid}
          set w to window 1 of targetProc

          -- Un-minimize first (zoom on a minimized window is a no-op).
          try
            set value of attribute "AXMinimized" of w to false
          end try

          -- Read the visible frame of the primary display (excludes menu bar + dock).
          tell application "Finder"
            set visibleBounds to bounds of window of desktop
          end tell
          set vbX to item 1 of visibleBounds
          set vbY to item 2 of visibleBounds
          set vbW to (item 3 of visibleBounds) - vbX
          set vbH to (item 4 of visibleBounds) - vbY

          set position of w to {vbX, vbY}
          set size of w to {vbW, vbH}
        end try
      end tell
    `;
    await this.runAppleScript(script).catch((e) => {
      logger.warn("macOS", `maximize() failed: ${e}`);
    });
  }

  /**
   * Toggle true OS fullscreen via the AXFullScreen accessibility attribute
   * (same effect as clicking the green traffic-light button without Option).
   * Note: this swaps the app to its own Space — be aware that some flows
   * (multi-window tests, drag-to-window-edge) become impossible in this state.
   */
  async setFullScreen(on: boolean): Promise<void> {
    if (!this.pid) throw new Error("setFullScreen(): adapter not connected");
    const script = `
      tell application "System Events"
        try
          set targetProc to first process whose unix id is ${this.pid}
          set value of attribute "AXFullScreen" of window 1 of targetProc to ${on}
        end try
      end tell
    `;
    await this.runAppleScript(script).catch((e) => {
      logger.warn("macOS", `setFullScreen(${on}) failed: ${e}`);
    });
    await sleep(250); // fullscreen animation settle
  }

  async click(target: string): Promise<void> {
    const script = `
      tell application "System Events"
        tell process "${this.appName}"
          click button "${target}" of window 1
        end tell
      end tell
    `;
    await this.runAppleScript(script);
  }

  async clickCoordinates(x: number, y: number): Promise<void> {
    await execAsync(
      `osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`,
    );
  }

  async fill(target: string, value: string): Promise<void> {
    const script = `
      tell application "System Events"
        tell process "${this.appName}"
          set value of text field "${target}" of window 1 to "${value}"
        end tell
      end tell
    `;
    await this.runAppleScript(script);
  }

  async getText(target: string): Promise<string> {
    const script = `
      tell application "System Events"
        tell process "${this.appName}"
          get value of static text "${target}" of window 1
        end tell
      end tell
    `;
    try {
      const { stdout } = await this.runAppleScript(script);
      return stdout.trim();
    } catch {
      return "";
    }
  }

  async keyPress(key: string): Promise<void> {
    const keyMap: Record<string, string> = {
      Enter: "return",
      Tab: "tab",
      Escape: "escape",
      Backspace: "delete",
      Space: "space",
    };
    const mapped = keyMap[key] ?? key;
    await execAsync(
      `osascript -e 'tell application "System Events" to keystroke "${mapped}"'`,
    );
  }

  async getTitle(): Promise<string> {
    try {
      const script = `tell application "System Events" to get name of window 1 of process "${this.appName}"`;
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      return stdout.trim();
    } catch {
      return this.appName;
    }
  }

  async screenshot(): Promise<Buffer> {
    const tmp = `/tmp/da-screenshot-${Date.now()}.png`;
    try {
      await execAsync(`screencapture -x ${tmp}`);
      const fs = require("fs");
      const buf = fs.readFileSync(tmp);
      fs.unlinkSync(tmp);
      return buf;
    } catch {
      return Buffer.alloc(0);
    }
  }

  /**
   * Capture only the target app's primary window (PID-scoped).
   *
   * Pipeline: focus → read window's logical bounds via AX → `screencapture -R`
   * the rectangle. This guarantees the resulting PNG contains exactly the app's
   * window content (plus whatever overlays the OS draws on top — which is why
   * we focus first to bring our window above all others).
   *
   * If bounds resolution fails (e.g. window has no AX role yet), falls back
   * to a full-screen capture so vision callers always get something usable.
   */
  async screenshotWindow(): Promise<Buffer> {
    if (!this.pid) throw new Error("screenshotWindow(): adapter not connected");

    await this.ensureFocused().catch(() => {});
    await sleep(120); // small settle so animations / focus ring stabilise

    const bounds = await this.getWindowBounds();
    if (!bounds) {
      logger.warn(
        "macOS",
        "screenshotWindow(): no window bounds, falling back to full screen",
      );
      return this.screenshot();
    }

    const fs = require("fs");
    const tmp = `/tmp/da-window-${this.pid}-${Date.now()}.png`;
    try {
      await execAsync(
        `screencapture -x -R ${Math.round(bounds.x)},${Math.round(bounds.y)},${Math.round(bounds.width)},${Math.round(bounds.height)} ${tmp}`,
      );
      const buf = fs.readFileSync(tmp);
      fs.unlinkSync(tmp);
      return buf;
    } catch (e) {
      logger.warn("macOS", `screenshotWindow() failed, falling back: ${e}`);
      return this.screenshot();
    }
  }

  /**
   * Read the primary window's logical bounds for the target PID.
   *
   * The `scale` field is computed empirically by capturing a small probe
   * region and comparing PNG pixel dimensions to the requested logical
   * dimensions — this naturally yields 2.0 on Retina, 1.0 elsewhere, and
   * works on mixed-DPI multi-monitor setups too.
   */
  async getWindowBounds(): Promise<WindowBounds | null> {
    if (!this.pid) return null;

    const script = `
      tell application "System Events"
        try
          set targetProc to first process whose unix id is ${this.pid}
          set w to window 1 of targetProc
          set p to position of w
          set s to size of w
          return ((item 1 of p) as string) & "," & ((item 2 of p) as string) & "," & ((item 1 of s) as string) & "," & ((item 2 of s) as string)
        on error
          return ""
        end try
      end tell
    `;

    try {
      const { stdout } = await this.runAppleScript(script);
      const parts = stdout
        .trim()
        .split(",")
        .map((n) => parseInt(n, 10));
      if (parts.length !== 4 || parts.some((n) => isNaN(n))) return null;
      const [x, y, width, height] = parts;
      if (width <= 0 || height <= 0) return null;

      const scale = await this.detectBackingScale(x, y, width, height);
      return { x, y, width, height, scale };
    } catch (e) {
      logger.warn("macOS", `getWindowBounds() failed: ${e}`);
      return null;
    }
  }

  /** Pre-flight focus tailored for vision: ensureFocused + settle delay. */
  async focusForVision(settleMs: number = 150): Promise<void> {
    await this.focus({ restore: true, verify: true, timeoutMs: 2500 });
    if (settleMs > 0) await sleep(settleMs);
  }

  async getElements(): Promise<UIElement[]> {
    try {
      const script = `
        const se = Application("System Events");
        const proc = se.processes.byName("${this.appName}");
        const win = proc.windows[0];
        const elements = win.entireContents();
        const result = elements.slice(0, 100).map(el => {
          try {
            return {
              role: el.role(),
              name: el.name() || "",
              description: el.description() || "",
              value: el.value ? String(el.value()) : "",
              position: el.position(),
              size: el.size(),
              enabled: el.enabled ? el.enabled() : true,
            };
          } catch(e) { return null; }
        }).filter(x => x !== null);
        JSON.stringify(result);
      `;
      const { stdout } = await this.runAppleScript(script, "JavaScript");
      const raw = JSON.parse(stdout.trim() || "[]");
      return raw.map((el: any, i: number) => this.toUIElement(el, i));
    } catch {
      return [];
    }
  }

  async isVisible(target: string): Promise<boolean> {
    const elements = await this.getElements();
    return elements.some(
      (el) =>
        el.name?.includes(target) ||
        el.label?.includes(target) ||
        el.id.includes(target),
    );
  }

  /**
   * Empirically detect the backing-store scale (1.0, 2.0, ...) by capturing
   * a small probe region and comparing PNG pixel dimensions vs the logical
   * rectangle we asked for. Cached per-instance after first successful read.
   */
  private _cachedScale: number | null = null;
  private async detectBackingScale(
    wx: number,
    wy: number,
    ww: number,
    wh: number,
  ): Promise<number> {
    if (this._cachedScale !== null) return this._cachedScale;

    const probeW = Math.min(64, Math.max(8, Math.floor(ww)));
    const probeH = Math.min(64, Math.max(8, Math.floor(wh)));
    const tmp = `/tmp/da-probe-${this.pid}-${Date.now()}.png`;
    const fs = require("fs");
    try {
      await execAsync(
        `screencapture -x -R ${wx},${wy},${probeW},${probeH} ${tmp}`,
      );
      const buf: Buffer = fs.readFileSync(tmp);
      fs.unlinkSync(tmp);
      const dim = readPngSize(buf);
      if (!dim || probeW === 0) return 1;
      const scale = Math.round((dim.width / probeW) * 100) / 100;
      const sane = scale >= 1 && scale <= 4 ? scale : 1;
      this._cachedScale = sane;
      return sane;
    } catch {
      return 1;
    }
  }

  private async waitForFrontmost(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.isFocused()) return true;
      await sleep(75);
    }
    return false;
  }

  private async launchApplication(name: string): Promise<void> {
    await execAsync(`open -a "${name}"`);
    await sleep(1000);
  }

  private assertProcessAlive(pid: number): void {
    if (!this.isProcessAlive(pid)) {
      throw new Error(`Process not found: PID ${pid}`);
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      execSync(`ps -p ${pid}`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  private async findPID(name: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `pgrep -x "${name}" || pgrep -f "${name}"`,
      );
      const pid = parseInt(stdout.trim().split("\n")[0], 10);
      if (isNaN(pid)) throw new Error(`Process not found: ${name}`);
      return pid;
    } catch {
      throw new Error(`Process not found: ${name}`);
    }
  }

  /**
   * Run AppleScript (or JXA) by streaming the source over stdin to osascript.
   * This avoids the quote-escaping landmine of `osascript -e '<script>'`.
   */
  private runAppleScript(
    script: string,
    language: "AppleScript" | "JavaScript" = "AppleScript",
  ): Promise<{ stdout: string }> {
    return new Promise((resolve, reject) => {
      const args = language === "JavaScript" ? ["-l", "JavaScript"] : [];
      const child = spawn("osascript", args);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve({ stdout });
        else reject(new Error(stderr.trim() || `osascript exited ${code}`));
      });
      child.stdin.end(script);
    });
  }

  private toUIElement(el: any, index: number): UIElement {
    const pos = el.position ?? [0, 0];
    const size = el.size ?? [0, 0];
    return {
      id: el.name || `ax-${index}`,
      role: el.role ?? "unknown",
      name: el.name || undefined,
      label: el.description || undefined,
      value: el.value || undefined,
      bounds: {
        x: Array.isArray(pos) ? pos[0] : 0,
        y: Array.isArray(pos) ? pos[1] : 0,
        width: Array.isArray(size) ? size[0] : 0,
        height: Array.isArray(size) ? size[1] : 0,
      },
      isEnabled: el.enabled !== false,
      isVisible: true,
      attributes: { accessibilityRole: el.role, accessibilityLabel: el.name },
    };
  }
}
