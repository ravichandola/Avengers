import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { FocusOptions, UIElement, WindowBounds, WindowState } from '../../core/types';
import { logger } from '../../utils/logger';
import { sleep } from '../../utils/retry';

const execAsync = promisify(exec);

export class WindowsAdapter {
  private appName: string = '';
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
      this.pid = await this.findPID(appName);
    }

    await this.focus({ restore: true, verify: true, timeoutMs: 2500 });
    if (windowState && windowState !== 'normal') {
      await this.applyWindowState(windowState);
      await this.ensureFocused().catch(() => {});
    }
    logger.info(
      'Windows',
      `Connected to ${appName} (PID: ${this.pid}${windowState ? `, window=${windowState}` : ''})`,
    );
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
    const { restore = true, verify = true, timeoutMs = 2500, retries = 1 } = opts;

    if (!this.isProcessAlive(this.pid)) {
      throw new Error(`focus(): process ${this.pid} (${this.appName}) is not running`);
    }

    const script = this.buildFocusScript(this.pid, restore);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.runPowerShell(script);
      } catch (e) {
        logger.warn('Windows', `focus(): PowerShell failed (attempt ${attempt + 1}): ${e}`);
      }

      if (!verify) return true;
      if (await this.waitForForeground(timeoutMs)) {
        logger.debug('Windows', `focus(): PID ${this.pid} owns foreground`);
        return true;
      }
      if (attempt < retries) {
        logger.warn('Windows', `focus(): retry ${attempt + 1}/${retries} for PID ${this.pid}`);
        await sleep(150);
      }
    }

    logger.warn('Windows', `focus(): PID ${this.pid} (${this.appName}) did not become foreground`);
    return false;
  }

  /** Cheap O(1) check — true iff the foreground window belongs to our PID. */
  async isFocused(): Promise<boolean> {
    if (!this.pid) return false;
    try {
      const fgPid = await this.getForegroundPid();
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

  async click(target: string): Promise<void> {
    const script = `
      Add-Type -AssemblyName UIAutomationClient
      $root = [System.Windows.Automation.AutomationElement]::RootElement
      $pidCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, ${this.pid})
      $app = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $pidCond)
      $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, "${target}")
      $el = $app.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
      if ($el) { $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }
    `;
    await this.runPowerShell(script);
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

  async fill(target: string, value: string): Promise<void> {
    const script = `
      Add-Type -AssemblyName UIAutomationClient
      $root = [System.Windows.Automation.AutomationElement]::RootElement
      $pidCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, ${this.pid})
      $app = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $pidCond)
      $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, "${target}")
      $el = $app.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
      if ($el) { $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue("${value}") }
    `;
    await this.runPowerShell(script);
  }

  async getText(target: string): Promise<string> {
    const script = `
      Add-Type -AssemblyName UIAutomationClient
      $root = [System.Windows.Automation.AutomationElement]::RootElement
      $pidCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, ${this.pid})
      $app = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $pidCond)
      $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "${target}")
      $el = $app.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
      if ($el) { $el.Current.Name }
    `;
    const { stdout } = await this.runPowerShell(script);
    return stdout.trim();
  }

  async keyPress(key: string): Promise<void> {
    const keyMap: Record<string, string> = {
      Enter: '{ENTER}', Tab: '{TAB}', Escape: '{ESC}',
      Backspace: '{BACKSPACE}', Space: ' ',
    };
    const mapped = keyMap[key] ?? key;
    await this.runPowerShell(
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("${mapped}")`
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
    const fs = require('fs');
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
    await sleep(120);

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
  [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@ -ReferencedAssemblies System.Drawing

      $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
      if (-not $proc) { exit 1 }
      $hWnd = $proc.MainWindowHandle
      if ($hWnd -eq [IntPtr]::Zero) { exit 1 }

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
      const fs = require('fs');
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

  /** Pre-flight focus tailored for vision: ensureFocused + settle delay. */
  async focusForVision(settleMs: number = 150): Promise<void> {
    await this.focus({ restore: true, verify: true, timeoutMs: 2500 });
    if (settleMs > 0) await sleep(settleMs);
  }

  async getElements(): Promise<UIElement[]> {
    try {
      const script = `
        Add-Type -AssemblyName UIAutomationClient
        $root = [System.Windows.Automation.AutomationElement]::RootElement
        $pidCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, ${this.pid})
        $app = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $pidCond)
        $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
        $child = $walker.GetFirstChild($app)
        $els = @()
        $count = 0
        while ($child -ne $null -and $count -lt 50) {
          $r = $child.Current.BoundingRectangle
          $els += @{ Id=$child.Current.AutomationId; Name=$child.Current.Name; Type=$child.Current.ControlType.ProgrammaticName; Enabled=$child.Current.IsEnabled; X=$r.X; Y=$r.Y; W=$r.Width; H=$r.Height }
          $child = $walker.GetNextSibling($child)
          $count++
        }
        $els | ConvertTo-Json -Depth 2
      `;
      const { stdout } = await this.runPowerShell(script);
      const raw = JSON.parse(stdout.trim() || '[]');
      const arr = Array.isArray(raw) ? raw : [raw];
      return arr.map((el: any, i: number): UIElement => ({
        id: el.Id || el.Name || `uia-${i}`,
        role: el.Type ?? 'unknown',
        name: el.Name || undefined,
        bounds: { x: el.X ?? 0, y: el.Y ?? 0, width: el.W ?? 0, height: el.H ?? 0 },
        isEnabled: el.Enabled !== false,
        isVisible: true,
        attributes: { automationId: el.Id },
      }));
    } catch {
      return [];
    }
  }

  async isVisible(target: string): Promise<boolean> {
    const els = await this.getElements();
    return els.some(el => el.id.includes(target) || el.name?.includes(target));
  }

  // ────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────────────

  private async waitForForeground(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const fgPid = await this.getForegroundPid();
        if (fgPid === this.pid) return true;
      } catch { /* keep polling */ }
      await sleep(100);
    }
    return false;
  }

  private async getForegroundPid(): Promise<number> {
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
    const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${name}.exe" /FO CSV /NH`);
    const match = stdout.match(/"[^"]+","(\d+)"/);
    if (!match) throw new Error(`Process not found: ${name}`);
    return parseInt(match[1], 10);
  }

  /**
   * Run a PowerShell script via base64-encoded command. Eliminates the
   * quote-escaping fragility of `powershell -Command "..."` and lets us pass
   * arbitrarily complex scripts (here-strings, embedded C#, etc.) safely.
   */
  private runPowerShell(script: string): Promise<{ stdout: string }> {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return execAsync(
      `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { maxBuffer: 1024 * 1024 * 16 },
    );
  }
}
