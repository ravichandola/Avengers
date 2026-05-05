import { exec } from 'child_process';
import { promisify } from 'util';
import { UIElement } from '../../core/types';
import { logger } from '../../utils/logger';

const execAsync = promisify(exec);

export class WindowsAdapter {
  private appName: string = '';
  private pid: number | null = null;

  async connect(appName: string, pid?: number): Promise<void> {
    this.appName = appName;

    if (pid) {
      this.pid = pid;
    } else {
      this.pid = await this.findPID(appName);
    }

    await this.focusWindow();
    logger.info('Windows', `Connected to ${appName} (PID: ${this.pid})`);
  }

  async disconnect(): Promise<void> {
    this.appName = '';
    this.pid = null;
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
        using System; using System.Runtime.InteropServices;
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
    await this.runPowerShell(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("${mapped}")`);
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

  private async findPID(name: string): Promise<number> {
    const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${name}.exe" /FO CSV /NH`);
    const match = stdout.match(/"[^"]+","(\d+)"/);
    if (!match) throw new Error(`Process not found: ${name}`);
    return parseInt(match[1], 10);
  }

  private async focusWindow(): Promise<void> {
    if (!this.pid) return;
    const script = `
      $proc = Get-Process -Id ${this.pid}
      if ($proc.MainWindowHandle -ne 0) {
        Add-Type @"using System; using System.Runtime.InteropServices; public class Win32 { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); }"@
        [Win32]::SetForegroundWindow($proc.MainWindowHandle)
      }
    `;
    await this.runPowerShell(script).catch(() => {});
  }

  private async runPowerShell(script: string): Promise<{ stdout: string }> {
    return execAsync(`powershell -Command "${script.replace(/"/g, '\\"')}"`);
  }
}
