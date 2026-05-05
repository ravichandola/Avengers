import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { UIElement } from '../../core/types';
import { logger } from '../../utils/logger';

const execAsync = promisify(exec);

export class MacOSAdapter {
  private appName: string = '';
  private pid: number | null = null;

  async connect(appName: string, pid?: number): Promise<void> {
    this.appName = appName;

    if (pid) {
      this.verifyProcess(pid);
      this.pid = pid;
    } else {
      try {
        this.pid = await this.findPID(appName);
      } catch {
        await this.launchApplication(appName);
        this.pid = await this.findPID(appName);
      }
    }

    await this.activate();
    logger.info('macOS', `Connected to ${appName} (PID: ${this.pid})`);
  }

  async disconnect(): Promise<void> {
    this.appName = '';
    this.pid = null;
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
      `osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`
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
      return '';
    }
  }

  async keyPress(key: string): Promise<void> {
    const keyMap: Record<string, string> = {
      Enter: 'return', Tab: 'tab', Escape: 'escape',
      Backspace: 'delete', Space: 'space',
    };
    const mapped = keyMap[key] ?? key;
    await execAsync(`osascript -e 'tell application "System Events" to keystroke "${mapped}"'`);
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
      const fs = require('fs');
      const buf = fs.readFileSync(tmp);
      fs.unlinkSync(tmp);
      return buf;
    } catch {
      return Buffer.alloc(0);
    }
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
      const { stdout } = await execAsync(`osascript -l JavaScript -e '${script.replace(/'/g, "'\\''")}'`);
      const raw = JSON.parse(stdout.trim() || '[]');
      return raw.map((el: any, i: number) => this.toUIElement(el, i));
    } catch {
      return [];
    }
  }

  async isVisible(target: string): Promise<boolean> {
    const elements = await this.getElements();
    return elements.some(el =>
      el.name?.includes(target) || el.label?.includes(target) || el.id.includes(target)
    );
  }

  private async activate(): Promise<void> {
    await execAsync(`osascript -e 'tell application "${this.appName}" to activate'`);
  }

  private async launchApplication(name: string): Promise<void> {
    await execAsync(`open -a "${name}"`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private verifyProcess(pid: number): void {
    try { execSync(`ps -p ${pid}`); } catch {
      throw new Error(`Process not found: PID ${pid}`);
    }
  }

  private async findPID(name: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`pgrep -x "${name}" || pgrep -f "${name}"`);
      const pid = parseInt(stdout.trim().split('\n')[0], 10);
      if (isNaN(pid)) throw new Error(`Process not found: ${name}`);
      return pid;
    } catch {
      throw new Error(`Process not found: ${name}`);
    }
  }

  private async runAppleScript(script: string): Promise<{ stdout: string }> {
    return execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
  }

  private toUIElement(el: any, index: number): UIElement {
    const pos = el.position ?? [0, 0];
    const size = el.size ?? [0, 0];
    return {
      id: el.name || `ax-${index}`,
      role: el.role ?? 'unknown',
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
