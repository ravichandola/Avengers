import { exec, execSync } from 'child_process';
import fs from 'fs';
import { promisify } from 'util';
import { FocusOptions, LaunchOptions, UIElement, WindowBounds, WindowState } from '../../core/types';
import { withRetry } from '../../core/retry';
import { logger } from '../../utils/logger';
import { sleep } from '../../utils/retry';
import { WINDOWS_UIA_HELPERS_PS1 } from './windows-uia-helpers';
import type { IDesktopAdapter } from './desktop-adapter.interface';

const execAsync = promisify(exec);

function runEncodedPowerShell(script: string): Promise<{ stdout: string }> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return execAsync(
    `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
    { maxBuffer: 1024 * 1024 * 16 },
  );
}

/** Lazy-loaded once — keeps `dotnet-bridge` off the critical path on non-Windows runtimes. */
let dotNetBridgeModule: Promise<typeof import('./dotnet-bridge')> | null = null;
function loadDotNetBridge(): Promise<typeof import('./dotnet-bridge')> {
  dotNetBridgeModule ??= import('./dotnet-bridge');
  return dotNetBridgeModule;
}

export class WindowsAdapter implements IDesktopAdapter {
  private appName: string = '';
  private pid: number | null = null;

  /**
   * Find a top-level visible window whose title contains `appName` (case-insensitive).
   * Used by MCP `scan_app` before connecting by PID.
   */
  static async findWindow(
    appName: string,
  ): Promise<{ title: string; pid: number } | null> {
    const needle = appName.replace(/'/g, "''");
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class DaFindWin {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint procId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
}
"@
$needle = '${needle}'
$best = $null
$bestPid = 0
$cb = [DaFindWin+EnumWindowsProc] {
  param($h, $l)
  if (-not [DaFindWin]::IsWindowVisible($h)) { return $true }
  $sb = New-Object System.Text.StringBuilder 1024
  [void][DaFindWin]::GetWindowText($h, $sb, $sb.Capacity)
  $t = $sb.ToString()
  if ([string]::IsNullOrWhiteSpace($t)) { return $true }
  if ($t.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -lt 0) { return $true }
  $p = [uint32]0
  [DaFindWin]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
  if ($p -gt 0) { $script:best = $t; $script:bestPid = [int]$p; return $false }
  return $true
}
[DaFindWin]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if ($script:bestPid -gt 0) { Write-Output ($script:bestPid.ToString() + '|' + $script:best) }
`.trim();
    try {
      const { stdout } = await runEncodedPowerShell(script);
      const line = stdout.trim();
      const pipe = line.indexOf('|');
      if (pipe <= 0) return null;
      const pid = parseInt(line.slice(0, pipe), 10);
      const title = line.slice(pipe + 1);
      if (isNaN(pid) || !title) return null;
      return { pid, title };
    } catch {
      return null;
    }
  }

  getConnectedPid(): number | null {
    return this.pid;
  }

  async connect(
    appName: string,
    pid?: number,
    windowState?: WindowState,
  ): Promise<{ pid: number; title: string }> {
    this.appName = appName;

    if (pid) {
      this.assertProcessAlive(pid);
      this.pid = pid;
    } else {
      this.pid = await this.findPID(appName);
    }

    await this.focus({ restore: true, verify: true, timeoutMs: 2500 });
    if (windowState && windowState !== 'normal') {
      await this.applyWindowState(windowState);
      await this.ensureFocused().catch(() => {});
    }
    const title = await this.getTitle();
    logger.info(
      'Windows',
      `Connected to ${appName} (PID: ${this.pid}${windowState ? `, window=${windowState}` : ''})`,
    );
    return { pid: this.pid!, title };
  }

  async launch(appName: string, _options?: LaunchOptions): Promise<{ pid: number }> {
    const image = WindowsAdapter.normalizeProcessImageName(appName);
    await execAsync(`cmd /c start "" "${image}"`).catch(async () => {
      await execAsync(`cmd /c start "" ${image}`);
    });
    await sleep(1500);
    const pid = await this.findPID(appName.replace(/\.exe$/i, ''));
    return { pid };
  }

  async close(appName: string): Promise<void> {
    const image = WindowsAdapter.normalizeProcessImageName(appName);
    await execAsync(`taskkill /IM "${image}" /F`).catch(() => {});
  }

  async waitForElement(selector: string, timeoutMs = 10000): Promise<UIElement> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const elements = await this.getElements(undefined, 400);
      const hit = elements.find(
        (e) =>
          e.name === selector ||
          e.id === selector ||
          e.name?.includes(selector) ||
          e.id.includes(selector),
      );
      if (hit) return hit;
      await sleep(200);
    }
    throw new Error(`waitForElement("${selector}") timed out after ${timeoutMs}ms`);
  }

  async disconnect(): Promise<void> {
    this.appName = '';
    this.pid = null;
  }

  /**
   * Bring this app's window to the foreground using its PID and wait until
   * the foreground window genuinely belongs to that PID.
   *
   * Strategy:
   *  1. Validate PID via `Get-Process` (kernel-level liveness check).
   *  2. Resolve the target HWND. Prefer `Process.MainWindowHandle`; if that
   *     is zero (splash, tray-only, just-launched), enumerate top-level
   *     windows with `EnumWindows` filtered by the PID.
   *  3. If `IsIconic`, restore via `ShowWindow(hWnd, SW_RESTORE)`.
   *  4. Use the **AttachThreadInput** trick: attach our thread's input
   *     queue to the current foreground thread, then call
   *     `BringWindowToTop` + `SetForegroundWindow`, then detach. This
   *     bypasses Windows foreground-lock restrictions that otherwise make
   *     `SetForegroundWindow` a silent no-op when our process isn't already
   *     the foreground app.
   *  5. Optionally poll `GetForegroundWindow` + `GetWindowThreadProcessId`
   *     until the foreground PID matches our target.
   */
  async focus(opts: FocusOptions = {}): Promise<boolean> {
    if (!this.pid) throw new Error('focus(): adapter not connected');
    const { restore = true, verify = true, timeoutMs = 2500 } = opts;

    if (!this.isProcessAlive(this.pid)) {
      throw new Error(`focus(): process ${this.pid} (${this.appName}) is not running`);
    }

    const script = this.buildFocusScript(this.pid, restore);
    const pid = this.pid;

    try {
      await withRetry(
        async () => {
          try {
            await this.runPowerShell(script);
          } catch (e) {
            logger.warn('Windows', `focus(): PowerShell failed: ${e}`);
            throw e instanceof Error ? e : new Error(String(e));
          }
          if (verify) {
            await this.verifyForeground(pid, timeoutMs);
          }
        },
        { attempts: 3, delayMs: 200, backoff: 2 },
      );
      logger.debug('Windows', `focus(): PID ${this.pid} owns foreground`);
      return true;
    } catch {
      logger.warn(
        'Windows',
        `focus(): PID ${this.pid} (${this.appName}) did not become foreground`,
      );
      return false;
    }
  }

  async verifyForeground(pid: number, timeoutMs = 2000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const fgPid = await this.getForegroundWindowPid();
      if (fgPid === pid) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Window with PID ${pid} did not come to foreground within ${timeoutMs}ms`);
  }

  /** Cheap O(1) check — true iff the foreground window belongs to our PID. */
  async isFocused(): Promise<boolean> {
    if (!this.pid) return false;
    try {
      const fgPid = await this.getForegroundWindowPid();
      return fgPid === this.pid;
    } catch {
      return false;
    }
  }

  async ensureFocused(opts?: FocusOptions): Promise<boolean> {
    if (await this.isFocused()) return true;
    return this.focus(opts);
  }

  // ─── Window state ─────────────────────────────────────────────────────────

  /**
   * Apply an initial window state to the connected app's primary window.
   * Idempotent — safe to call multiple times.
   */
  async applyWindowState(state: WindowState): Promise<void> {
    if (!this.pid) throw new Error('applyWindowState(): adapter not connected');
    if (state === 'normal') return;
    if (state === 'fullscreen') {
      await this.setFullScreen(true);
    } else {
      await this.maximize();
    }
  }

  /**
   * Maximize via `ShowWindow(hWnd, SW_MAXIMIZE)`. The HWND is resolved
   * through `MainWindowHandle` first, then via `EnumWindows` filtered by
   * PID — the same robust resolution path used by `focus()`.
   */
  async maximize(): Promise<void> {
    if (!this.pid) throw new Error('maximize(): adapter not connected');
    const script = this.buildShowWindowScript(this.pid, 3); // SW_MAXIMIZE
    await this.runPowerShell(script).catch((e) => {
      logger.warn('Windows', `maximize() failed: ${e}`);
    });
    await sleep(150);
  }

  /**
   * Borderless fullscreen — strips WS_OVERLAPPEDWINDOW caption/border bits
   * and sizes the window to the entire monitor's bounds. Standard Win32
   * "exclusive fullscreen" pattern. Use `applyWindowState('normal')` in a
   * subsequent call to undo (caller must re-set chrome themselves; that's
   * intentional — borderless fullscreen is a one-way trip for most apps).
   */
  async setFullScreen(on: boolean): Promise<void> {
    if (!this.pid) throw new Error('setFullScreen(): adapter not connected');
    if (!on) {
      // Best-effort restore: maximize. App-level fullscreen toggles vary.
      await this.maximize();
      return;
    }
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $targetPid = ${this.pid}

      Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DaFs {
  public const int GWL_STYLE = -16;
  public const uint WS_OVERLAPPEDWINDOW = 0x00CF0000;
  public const uint SWP_FRAMECHANGED = 0x0020;
  public const uint SWP_NOZORDER = 0x0004;
  [DllImport("user32.dll")] public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll")] public static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint dwFlags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO {
    public uint cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags;
  }
}
"@

      $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
      if (-not $proc) { exit 0 }
      $hWnd = $proc.MainWindowHandle
      if ($hWnd -eq [IntPtr]::Zero) { exit 0 }

      $style = [DaFs]::GetWindowLongPtr($hWnd, [DaFs]::GWL_STYLE)
      $newStyle = [IntPtr]([Int64]$style.ToInt64() -band -bnot [DaFs]::WS_OVERLAPPEDWINDOW)
      [DaFs]::SetWindowLongPtr($hWnd, [DaFs]::GWL_STYLE, $newStyle) | Out-Null

      $hMon = [DaFs]::MonitorFromWindow($hWnd, 2)  # MONITOR_DEFAULTTONEAREST
      $mi = New-Object DaFs+MONITORINFO
      $mi.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($mi)
      [DaFs]::GetMonitorInfo($hMon, [ref]$mi) | Out-Null

      $w = $mi.rcMonitor.Right - $mi.rcMonitor.Left
      $h = $mi.rcMonitor.Bottom - $mi.rcMonitor.Top
      $flags = [DaFs]::SWP_FRAMECHANGED -bor [DaFs]::SWP_NOZORDER
      [DaFs]::SetWindowPos($hWnd, [IntPtr]::Zero, $mi.rcMonitor.Left, $mi.rcMonitor.Top, $w, $h, $flags) | Out-Null
    `;
    await this.runPowerShell(script).catch((e) => {
      logger.warn('Windows', `setFullScreen() failed: ${e}`);
    });
    await sleep(200);
  }

  private buildShowWindowScript(pid: number, nCmdShow: number): string {
    return `
      $ErrorActionPreference = 'SilentlyContinue'
      $targetPid = ${pid}

      Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DaShow {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint procId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

      $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
      if (-not $proc) { exit 0 }
      $hWnd = $proc.MainWindowHandle
      if ($hWnd -eq [IntPtr]::Zero) {
        $script:found = [IntPtr]::Zero
        $cb = [DaShow+EnumWindowsProc] {
          param($h, $l)
          $p = 0
          [DaShow]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
          if ($p -eq $targetPid -and [DaShow]::IsWindowVisible($h) -and [DaShow]::GetWindowTextLength($h) -gt 0) {
            $script:found = $h
            return $false
          }
          return $true
        }
        [DaShow]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
        $hWnd = $script:found
      }
      if ($hWnd -eq [IntPtr]::Zero) { exit 0 }
      [DaShow]::ShowWindow($hWnd, ${nCmdShow}) | Out-Null
    `;
  }

  async click(target: UIElement | string): Promise<void> {
    if (!this.pid) throw new Error('click(): adapter not connected');
    const needle = WindowsAdapter.resolveSelector(target);
    if (!needle) throw new Error('click(): empty selector');
    const fl = await this.callFlaUiaRpc('uia.click', { pid: this.pid, selector: needle });
    if (fl !== null) return;
    await withRetry(
      async () => {
        const needleB64 = WindowsAdapter.psUtf8B64(needle);
        const script = `
${WINDOWS_UIA_HELPERS_PS1}
$app = Da-GetAppRoot ${this.pid}
$needle = Da-DecodeB64 '${needleB64}'
$el = Da-FindForAction $app $needle
Da-InvokeClick $el
`;
        await this.runPowerShell(script);
      },
      { attempts: 3, delayMs: 400, backoff: 2 },
    );
  }

  async clickCoordinates(x: number, y: number): Promise<void> {
    const script = `
      Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {
  [DllImport("user32.dll")] public static extern void SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
"@
      [MouseOps]::SetCursorPos(${x}, ${y})
      [MouseOps]::mouse_event(0x0002, 0, 0, 0, 0)
      [MouseOps]::mouse_event(0x0004, 0, 0, 0, 0)
    `;
    await this.runPowerShell(script);
  }

  async fill(target: UIElement | string, value: string): Promise<void> {
    if (!this.pid) throw new Error('fill(): adapter not connected');
    const needle = WindowsAdapter.resolveSelector(target);
    if (!needle) throw new Error('fill(): empty selector');
    const fl = await this.callFlaUiaRpc('uia.fill', { pid: this.pid, selector: needle, value });
    if (fl !== null) return;
    await withRetry(
      async () => {
        const needleB64 = WindowsAdapter.psUtf8B64(needle);
        const valueB64 = WindowsAdapter.psUtf8B64(value);
        const script = `
${WINDOWS_UIA_HELPERS_PS1}
$app = Da-GetAppRoot ${this.pid}
$needle = Da-DecodeB64 '${needleB64}'
$val = Da-DecodeB64 '${valueB64}'
$el = Da-FindForAction $app $needle
Da-SetValue $el $val
`;
        await this.runPowerShell(script);
      },
      { attempts: 3, delayMs: 400, backoff: 2 },
    );
  }

  async getText(target: UIElement | string): Promise<string> {
    if (!this.pid) return '';
    const needle = WindowsAdapter.resolveSelector(target);
    if (!needle) return '';
    const fl = await this.callFlaUiaRpc('uia.get_text', { pid: this.pid, selector: needle });
    if (fl !== null && typeof fl === 'object' && fl !== null && 'text' in fl) {
      const t = (fl as { text?: unknown }).text;
      return t === undefined || t === null ? '' : String(t);
    }
    const needleB64 = WindowsAdapter.psUtf8B64(needle);
    const script = `
${WINDOWS_UIA_HELPERS_PS1}
$app = Da-GetAppRoot ${this.pid}
$needle = Da-DecodeB64 '${needleB64}'
$el = Da-FindForRead $app $needle
Write-Output (Da-ReadText $el)
`;
    try {
      const { stdout } = await this.runPowerShell(script);
      return stdout.trim();
    } catch {
      return '';
    }
  }

  async keyPress(key: string): Promise<void> {
    if (!this.pid) throw new Error('keyPress(): adapter not connected');
    await withRetry(
      async () => {
        const payload = WindowsAdapter.buildSendKeysPayload(key);
        const b64 = WindowsAdapter.psUtf8B64(payload);
        const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$k = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}'))
[System.Windows.Forms.SendKeys]::SendWait($k)
`;
        await this.runPowerShell(script);
      },
      { attempts: 3, delayMs: 400, backoff: 2 },
    );
  }

  async getTitle(): Promise<string> {
    try {
      const { stdout } = await this.runPowerShell(
        `(Get-Process -Id ${this.pid}).MainWindowTitle`
      );
      return stdout.trim() || this.appName;
    } catch {
      return this.appName;
    }
  }

  async screenshot(): Promise<Buffer> {
    const tmp = `${process.env.TEMP || 'C:\\Temp'}\\da-screenshot-${Date.now()}.png`;
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      $screen = [System.Windows.Forms.Screen]::PrimaryScreen
      $bmp = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
      $bmp.Save("${tmp.replace(/\\/g, '\\\\')}")
      $g.Dispose(); $bmp.Dispose()
    `;
    await this.runPowerShell(script);
    const buf = fs.readFileSync(tmp);
    fs.unlinkSync(tmp);
    return buf;
  }

  /**
   * PID-scoped window capture using `PrintWindow(hWnd, hdc, PW_RENDERFULLCONTENT)`.
   *
   * Unlike `Graphics.CopyFromScreen` (which captures whatever pixels are
   * physically on screen, including overlapping windows), `PrintWindow` asks
   * the target HWND to render itself into a bitmap — so even if another app
   * is on top, we get a clean shot of just our window's content. The
   * `PW_RENDERFULLCONTENT` flag (0x2) is required for modern WPF / Chromium
   * windows that use DirectComposition.
   */
  async screenshotWindow(): Promise<Buffer> {
    if (!this.pid) throw new Error('screenshotWindow(): adapter not connected');

    await this.ensureFocused().catch(() => {});
    await sleep(300);

    const tmp = `${process.env.TEMP || 'C:\\Temp'}\\da-window-${this.pid}-${Date.now()}.png`;
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $targetPid = ${this.pid}

      Add-Type @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public class DaCap {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint procId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@ -ReferencedAssemblies System.Drawing

      $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
      if (-not $proc) { exit 1 }
      $hWnd = $proc.MainWindowHandle
      if ($hWnd -eq [IntPtr]::Zero) {
        $script:found = [IntPtr]::Zero
        $cb = [DaCap+EnumWindowsProc] {
          param($h, $l)
          $p = [uint32]0
          [DaCap]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
          if ($p -eq [uint32]$targetPid -and [DaCap]::IsWindowVisible($h) -and [DaCap]::GetWindowTextLength($h) -gt 0) {
            $script:found = $h
            return $false
          }
          return $true
        }
        [DaCap]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
        $hWnd = $script:found
      }
      if ($hWnd -eq [IntPtr]::Zero) { exit 1 }

      [DaCap]::ShowWindow($hWnd, 9) | Out-Null
      [DaCap]::SetForegroundWindow($hWnd) | Out-Null
      Start-Sleep -Milliseconds 300

      $rect = New-Object DaCap+RECT
      [DaCap]::GetWindowRect($hWnd, [ref]$rect) | Out-Null
      $w = $rect.Right - $rect.Left
      $h = $rect.Bottom - $rect.Top
      if ($w -le 0 -or $h -le 0) { exit 1 }

      $bmp = New-Object System.Drawing.Bitmap $w, $h
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $hdc = $g.GetHdc()
      [DaCap]::PrintWindow($hWnd, $hdc, 2) | Out-Null  # PW_RENDERFULLCONTENT
      $g.ReleaseHdc($hdc)
      $bmp.Save("${tmp.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose(); $bmp.Dispose()
    `;

    try {
      await this.runPowerShell(script);
      const buf = fs.readFileSync(tmp);
      fs.unlinkSync(tmp);
      return buf;
    } catch (e) {
      logger.warn('Windows', `screenshotWindow() failed, falling back: ${e}`);
      return this.screenshot();
    }
  }

  /**
   * Read the target window's logical bounds + DPI scale.
   *
   * `GetWindowRect` returns physical pixels for per-monitor-DPI-aware
   * processes. We declare PowerShell as per-monitor-aware via
   * `SetProcessDpiAwarenessContext` so the rect we get matches `mouse_event`
   * absolute coordinate space, then derive `scale = DPI / 96`.
   */
  async getWindowBounds(): Promise<WindowBounds | null> {
    if (!this.pid) return null;

    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $targetPid = ${this.pid}

      Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DaBounds {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint procId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

      [DaBounds]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null  # PER_MONITOR_AWARE_V2

      $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
      if (-not $proc) { Write-Output ''; exit 0 }
      $hWnd = $proc.MainWindowHandle
      if ($hWnd -eq [IntPtr]::Zero) {
        $script:found = [IntPtr]::Zero
        $cb = [DaBounds+EnumWindowsProc] {
          param($h, $l)
          $p = [uint32]0
          [DaBounds]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
          if ($p -eq [uint32]$targetPid -and [DaBounds]::IsWindowVisible($h) -and [DaBounds]::GetWindowTextLength($h) -gt 0) {
            $script:found = $h
            return $false
          }
          return $true
        }
        [DaBounds]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
        $hWnd = $script:found
      }
      if ($hWnd -eq [IntPtr]::Zero) { Write-Output ''; exit 0 }

      $rect = New-Object DaBounds+RECT
      [DaBounds]::GetWindowRect($hWnd, [ref]$rect) | Out-Null
      $dpi = [DaBounds]::GetDpiForWindow($hWnd)
      if ($dpi -eq 0) { $dpi = 96 }
      Write-Output ("$($rect.Left),$($rect.Top),$($rect.Right - $rect.Left),$($rect.Bottom - $rect.Top),$dpi")
    `;

    try {
      const { stdout } = await this.runPowerShell(script);
      const parts = stdout.trim().split(',').map((n) => parseInt(n, 10));
      if (parts.length !== 5 || parts.some((n) => isNaN(n))) return null;
      const [x, y, width, height, dpi] = parts;
      if (width <= 0 || height <= 0) return null;
      const scale = Math.round((dpi / 96) * 100) / 100;
      return { x, y, width, height, scale: scale > 0 ? scale : 1 };
    } catch (e) {
      logger.warn('Windows', `getWindowBounds() failed: ${e}`);
      return null;
    }
  }

  /** HWND for the connected process's primary top-level window (0 if unresolved). */
  async getMainWindowHandle(): Promise<number | null> {
    if (!this.pid) return null;
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$targetPid = ${this.pid}
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DaHwnd {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint procId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
}
"@
$proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
if (-not $proc) { Write-Output '0'; exit 0 }
$h = $proc.MainWindowHandle
if ($h -ne [IntPtr]::Zero) { Write-Output $h.ToInt64(); exit 0 }
$script:found = 0
$cb = [DaHwnd+EnumWindowsProc] {
  param($w, $l)
  $p = [uint32]0
  [DaHwnd]::GetWindowThreadProcessId($w, [ref]$p) | Out-Null
  if ($p -eq [uint32]$targetPid -and [DaHwnd]::IsWindowVisible($w) -and [DaHwnd]::GetWindowTextLength($w) -gt 0) {
    $script:found = $w.ToInt64()
    return $false
  }
  return $true
}
[DaHwnd]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
Write-Output $script:found
`.trim();
    try {
      const { stdout } = await this.runPowerShell(script);
      const v = parseInt(stdout.trim(), 10);
      if (isNaN(v) || v === 0) return null;
      return v;
    } catch {
      return null;
    }
  }

  async getWindowDpiScale(hwnd: number): Promise<number> {
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinDpi {
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
}
"@
$d = [WinDpi]::GetDpiForWindow([IntPtr]::new(${hwnd}))
if ($d -eq 0) { $d = 96 }
Write-Output $d
`.trim();
    try {
      const { stdout } = await this.runPowerShell(script);
      const dpi = parseInt(stdout.trim(), 10);
      if (isNaN(dpi) || dpi <= 0) return 1;
      return dpi / 96;
    } catch {
      return 1;
    }
  }

  /** Pre-flight focus tailored for vision: ensureFocused + settle delay. */
  async focusForVision(settleMs: number = 150): Promise<void> {
    await this.focus({ restore: true, verify: true, timeoutMs: 2500 });
    if (settleMs > 0) await sleep(settleMs);
  }

  async getElements(appNameOrMax?: string | number, max?: number): Promise<UIElement[]> {
    let limit = 100;
    if (typeof appNameOrMax === 'number') {
      limit = appNameOrMax;
    } else if (typeof appNameOrMax === 'string') {
      limit = max ?? 100;
    } else if (typeof max === 'number') {
      limit = max;
    }

    if (!this.pid) return [];
    const fl = await this.callFlaUiaRpc('uia.get_elements', { pid: this.pid, max: limit });
    if (Array.isArray(fl)) {
      try {
        return this.mapUiaSidecarRowsToElements(fl);
      } catch (e) {
        logger.warn('Windows', `getElements FlaUI mapping failed, using PowerShell: ${e}`);
      }
    }
    try {
      const script = `
${WINDOWS_UIA_HELPERS_PS1}
$app = Da-GetAppRoot ${this.pid}
$rows = @(Da-CollectElements $app ${limit})
ConvertTo-Json -InputObject $rows -Depth 4 -Compress
`;
      const { stdout } = await this.runPowerShell(script);
      let raw: unknown;
      try {
        raw = JSON.parse(stdout.trim() || '[]');
      } catch {
        return [];
      }
      if (raw == null) return [];
      const arr = Array.isArray(raw) ? raw : [raw];
      return arr.map((el: any, i: number): UIElement => ({
        id: el.Id || el.Name || `uia-${i}`,
        role: WindowsAdapter.normalizeUiaRole(el.Type, el.LocalizedType),
        name: el.Name || undefined,
        value: el.Value || undefined,
        bounds: { x: el.X ?? 0, y: el.Y ?? 0, width: el.W ?? 0, height: el.H ?? 0 },
        isEnabled: el.Enabled !== false,
        isVisible: el.Offscreen !== true && (el.W ?? 0) > 0 && (el.H ?? 0) > 0,
        attributes: {
          automationId: el.Id,
          className: el.ClassName,
          localizedType: el.LocalizedType,
        },
      }));
    } catch {
      return [];
    }
  }

  async isVisible(target: string): Promise<boolean> {
    if (!this.pid) return false;
    const fl = await this.callFlaUiaRpc('uia.is_visible', { pid: this.pid, selector: target });
    if (fl !== null && typeof fl === 'object' && fl !== null && 'visible' in fl) {
      return Boolean((fl as { visible?: unknown }).visible);
    }
    const needleB64 = WindowsAdapter.psUtf8B64(target);
    const script = `
${WINDOWS_UIA_HELPERS_PS1}
$app = Da-GetAppRoot ${this.pid}
$needle = Da-DecodeB64 '${needleB64}'
$el = Da-FindForAction $app $needle
if (-not $el) { $el = Da-FindLoose $app $needle }
if (Da-IsReallyVisible $el) { Write-Output '1' } else { Write-Output '0' }
`;
    try {
      const { stdout } = await this.runPowerShell(script);
      return stdout.trim() === '1';
    } catch {
      return false;
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────────────

  private async waitForForeground(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const fgPid = await this.getForegroundWindowPid();
        if (fgPid === this.pid) return true;
      } catch {
        /* keep polling */
      }
      await sleep(100);
    }
    return false;
  }

  async getForegroundWindowPid(): Promise<number> {
    const script = `
      Add-Type -Namespace DaWin -Name Fg -MemberDefinition @"
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint procId);
"@
      $h = [DaWin.Fg]::GetForegroundWindow()
      $p = 0
      [DaWin.Fg]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
      Write-Output $p
    `;
    const { stdout } = await this.runPowerShell(script);
    const pid = parseInt(stdout.trim(), 10);
    if (isNaN(pid)) throw new Error('Could not read foreground PID');
    return pid;
  }

  private buildFocusScript(pid: number, restore: boolean): string {
    return `
      $ErrorActionPreference = 'SilentlyContinue'
      $targetPid = ${pid}

      Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DaFocus {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint procId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
}
"@

      $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
      if (-not $proc) { Write-Output 'NO_PROCESS'; exit 0 }

      $hWnd = $proc.MainWindowHandle
      if ($hWnd -eq [IntPtr]::Zero) {
        $script:found = [IntPtr]::Zero
        $cb = [DaFocus+EnumWindowsProc] {
          param($h, $l)
          $p = 0
          [DaFocus]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
          if ($p -eq $targetPid -and [DaFocus]::IsWindowVisible($h) -and [DaFocus]::GetWindowTextLength($h) -gt 0) {
            $script:found = $h
            return $false
          }
          return $true
        }
        [DaFocus]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
        $hWnd = $script:found
      }

      if ($hWnd -eq [IntPtr]::Zero) { Write-Output 'NO_WINDOW'; exit 0 }

      if (${restore ? '$true' : '$false'} -and [DaFocus]::IsIconic($hWnd)) {
        [DaFocus]::ShowWindow($hWnd, 9) | Out-Null
      }

      $fg = [DaFocus]::GetForegroundWindow()
      $fgPid = 0
      $fgTid = [DaFocus]::GetWindowThreadProcessId($fg, [ref]$fgPid)
      $myTid = [DaFocus]::GetCurrentThreadId()
      [DaFocus]::AttachThreadInput($myTid, $fgTid, $true) | Out-Null
      [DaFocus]::BringWindowToTop($hWnd) | Out-Null
      [DaFocus]::SetForegroundWindow($hWnd) | Out-Null
      [DaFocus]::AttachThreadInput($myTid, $fgTid, $false) | Out-Null

      Write-Output ('HWND=' + $hWnd.ToInt64())
    `;
  }

  private assertProcessAlive(pid: number): void {
    if (!this.isProcessAlive(pid)) {
      throw new Error(`Process not found: PID ${pid}`);
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { stdio: 'pipe' }).toString();
      return out.includes(String(pid));
    } catch {
      return false;
    }
  }

  private async findPID(name: string): Promise<number> {
    const image = WindowsAdapter.normalizeProcessImageName(name);
    const { stdout } = await execAsync(
      `tasklist /FI "IMAGENAME eq ${image}" /FO CSV /NH`,
    );
    const match = stdout.match(/"[^"]+","(\d+)"/);
    if (!match) throw new Error(`Process not found: ${name}`);
    return parseInt(match[1], 10);
  }

  /** UTF-8 → base64 for PowerShell `FromBase64String` (avoids quote / `$` injection). */
  private static psUtf8B64(s: string): string {
    return Buffer.from(s, 'utf8').toString('base64');
  }

  private static resolveSelector(target: UIElement | string): string {
    if (typeof target === 'string') return target;
    return (target.name ?? target.label ?? target.id ?? '').trim();
  }

  /** Map UIA `ControlType.Button` style names to shared role strings (e.g. `button`). */
  private static normalizeUiaRole(programmaticName: string, localizedType?: string): string {
    const raw = (programmaticName || '').trim();
    if (!raw) {
      const loc = (localizedType || '').trim().toLowerCase();
      return loc || 'unknown';
    }
    const stripped = raw.replace(/^ControlType\./i, '');
    return stripped.toLowerCase();
  }

  private static normalizeProcessImageName(name: string): string {
    const t = name.trim();
    return t.toLowerCase().endsWith('.exe') ? t : `${t}.exe`;
  }

  /** Map logical key names and escape SendKeys metacharacters for arbitrary text. */
  private static buildSendKeysPayload(key: string): string {
    const named: Record<string, string> = {
      Enter: '{ENTER}',
      Tab: '{TAB}',
      Escape: '{ESC}',
      Backspace: '{BACKSPACE}',
      Space: ' ',
    };
    if (named[key]) return named[key];
    return [...key].map((c) => WindowsAdapter.sendKeysEscapeChar(c)).join('');
  }

  private static sendKeysEscapeChar(ch: string): string {
    if (ch === '{') return '{{}';
    if (ch === '}') return '{}}';
    if ('+^%~()[]'.includes(ch)) return `{${ch}}`;
    return ch;
  }


  private runPowerShell(script: string): Promise<{ stdout: string }> {
    return runEncodedPowerShell(script);
  }

  /**
   * Optional FlaUI path: same `OfficeInterop.exe` sidecar, `uia.*` RPC on an STA FlaUI thread.
   * When the executable is missing or the RPC fails, returns `null` so callers fall back to PowerShell UIA.
   */
  private async callFlaUiaRpc(
    method: string,
    args: Record<string, unknown>,
  ): Promise<unknown | null> {
    const { getSidecar, isSidecarExecutablePresent } = await loadDotNetBridge();
    if (!isSidecarExecutablePresent()) return null;
    try {
      return await getSidecar().call(method, args);
    } catch (e) {
      logger.warn('Windows', `${method} (FlaUI sidecar) failed: ${e}`);
      return null;
    }
  }

  private mapUiaSidecarRowsToElements(rows: unknown[]): UIElement[] {
    return rows.map((row: unknown, i: number): UIElement => {
      const r = row as Record<string, unknown>;
      const pick = (camel: string, pascal: string) => r[camel] ?? r[pascal];
      const str = (camel: string, pascal: string): string | undefined => {
        const v = pick(camel, pascal);
        if (v === undefined || v === null) return undefined;
        return String(v);
      };
      const num = (camel: string, pascal: string, def: number): number => {
        const v = pick(camel, pascal);
        if (typeof v === 'number' && !Number.isNaN(v)) return v;
        if (typeof v === 'string') {
          const n = parseFloat(v);
          if (!Number.isNaN(n)) return n;
        }
        return def;
      };
      const bool = (camel: string, pascal: string, def: boolean): boolean => {
        const v = pick(camel, pascal);
        return typeof v === 'boolean' ? v : def;
      };
      const id = str('id', 'Id') ?? '';
      const name = str('name', 'Name');
      const type = str('type', 'Type') ?? '';
      const localizedType = str('localizedType', 'LocalizedType');
      const value = str('value', 'Value');
      const className = str('className', 'ClassName');
      const x = num('x', 'X', 0);
      const y = num('y', 'Y', 0);
      const w = num('w', 'W', 0);
      const h = num('h', 'H', 0);
      const enabled = bool('enabled', 'Enabled', true);
      const offscreen = bool('offscreen', 'Offscreen', false);
      return {
        id: id || name || `uia-${i}`,
        role: WindowsAdapter.normalizeUiaRole(type, localizedType),
        name: name || undefined,
        value: value || undefined,
        bounds: { x, y, width: w, height: h },
        isEnabled: enabled !== false,
        isVisible: offscreen !== true && w > 0 && h > 0,
        attributes: {
          automationId: id || undefined,
          className: className || undefined,
          localizedType: localizedType || undefined,
        },
      };
    });
  }

  // ─── Sidecar-powered extensions ──────────────────────────────────────────────
  // These methods are additive — they do NOT replace existing UIA/PS methods.
  // Imported lazily so the sidecar module is never loaded on macOS.

  private async sidecar() {
    const { getSidecar } = await loadDotNetBridge();
    return getSidecar();
  }

  async excelReadCell(file: string, cell: string): Promise<string> {
    const result = await (await this.sidecar()).call('excel.read_cell', { file, cell });
    return (result as { value: string }).value;
  }

  async excelWriteCell(file: string, cell: string, value: string): Promise<void> {
    await (await this.sidecar()).call('excel.write_cell', { file, cell, value });
  }

  async excelReadRange(file: string, range: string): Promise<string[][]> {
    const result = await (await this.sidecar()).call('excel.read_range', { file, range });
    return (result as { rows: string[][] }).rows;
  }

  async excelRunMacro(file: string, macro: string): Promise<void> {
    await (await this.sidecar()).call('excel.run_macro', { file, macro });
  }

  async wordInsertText(file: string, bookmark: string, text: string): Promise<void> {
    await (await this.sidecar()).call('word.insert_text', { file, bookmark, text });
  }

  async wordExportPdf(file: string, outputPath: string): Promise<void> {
    await (await this.sidecar()).call('word.export_pdf', { file, output: outputPath });
  }

  async outlookSendEmail(
    graphCreds: { tenantId: string; clientId: string; clientSecret: string },
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    await (await this.sidecar()).call('outlook.send_email', { ...graphCreds, to, subject, body });
  }

  async outlookListInbox(
    graphCreds: { tenantId: string; clientId: string; clientSecret: string },
    top = 10,
  ): Promise<Array<{ subject: string; from: string; received: string; isRead: boolean }>> {
    const result = await (await this.sidecar()).call('outlook.list_inbox', { ...graphCreds, top });
    return (result as {
      messages: Array<{ subject: string; from: string; received: string; isRead: boolean }>;
    }).messages;
  }

  async secretsSave(name: string, value: string): Promise<void> {
    await (await this.sidecar()).call('secrets.encrypt', { name, value });
  }

  async secretsLoad(name: string): Promise<string> {
    const result = await (await this.sidecar()).call('secrets.decrypt', { name });
    return (result as { value: string }).value;
  }
}
