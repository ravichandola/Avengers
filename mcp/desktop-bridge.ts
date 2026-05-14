import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { MacOSAdapter } from '../src/drivers/desktop/macos-adapter';
import { WindowsAdapter } from '../src/drivers/desktop/windows-adapter';
import { VisionProvider } from '../src/vision/vision-provider';
import { UIElement, WindowBounds } from '../src/core/types';
import { readPngSize } from '../src/utils/image';
import { logger } from '../src/core/logger';

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

const adapter: MacOSAdapter | WindowsAdapter =
  process.platform === 'darwin' ? new MacOSAdapter() : new WindowsAdapter();

const vision = new VisionProvider();

let connectedApp = '';

async function ensureConnected(appName: string): Promise<void> {
  if (connectedApp !== appName) {
    await adapter.connect(appName);
    connectedApp = appName;
  }
}

// ---------------------------------------------------------------------------
// POM / test generation helpers
// ---------------------------------------------------------------------------

function toCamelProp(label: string, used: Set<string>): string {
  const parts = label
    .replace(/[^\w\s-]/g, ' ')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((p) => p.toLowerCase());
  let base =
    parts.length === 0
      ? 'element'
      : parts.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('');
  if (/^[0-9]/.test(base)) base = `el${base}`;
  let out = base;
  let n = 2;
  while (used.has(out)) out = `${base}${n++}`;
  used.add(out);
  return out;
}

function kebabFromClass(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function buildPomSource(className: string, elements: UIElement[]): string {
  const used = new Set<string>();
  const lines: string[] = [];
  lines.push(`import { DesktopPage } from '../../../src/drivers/desktop/pom/desktop-page';`);
  lines.push(`import { DesktopDriver } from '../../../src/drivers/desktop/desktop-driver';`);
  lines.push('');
  lines.push(`/** Auto-generated desktop POM — scanned from live Accessibility tree */`);
  lines.push(`export class ${className} extends DesktopPage {`);

  for (const el of elements) {
    const label = el.name || el.label || el.id;
    if (!label || label.startsWith('ax-')) continue;
    const prop = toCamelProp(label, used);
    const selector = JSON.stringify(el.name || el.label || el.id);
    const comment = el.role !== 'unknown' ? ` // ${el.role}` : '';
    lines.push(`  readonly ${prop} = this.element(${selector});${comment}`);
  }

  lines.push('');
  lines.push(`  constructor(driver: DesktopDriver) {`);
  lines.push(`    super(driver);`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push('');
  return lines.join('\n');
}

function buildTestSource(
  className: string,
  pomRelPath: string,
  appName: string,
  intent: string,
): string {
  const lines: string[] = [];
  lines.push(`import { test, expect } from '../../src/fixtures';`);
  lines.push(`import { ${className} } from '${pomRelPath}';`);
  lines.push('');
  lines.push(`test.describe('${appName} - ${intent}', () => {`);
  lines.push(
    `  test.skip(!['darwin', 'win32'].includes(process.platform), 'Desktop (macOS or Windows) only');`,
  );
  lines.push('');
  lines.push(`  test('${intent} @app=${appName}', async ({ app }) => {`);
  lines.push(`    const screen = new ${className}(app as any);`);
  lines.push('');
  lines.push(`    const title = await screen.getTitle();`);
  lines.push(`    expect(title.length).toBeGreaterThan(0);`);
  lines.push('');
  lines.push(`    // TODO: implement test steps for: ${intent}`);
  lines.push(`  });`);
  lines.push(`});`);
  lines.push('');
  return lines.join('\n');
}

function appendPomIndex(className: string, fileBase: string): void {
  const indexPath = path.join(ROOT, 'tests', 'pom', 'index.ts');
  if (!fs.existsSync(indexPath)) return;
  const rel = `./desktop/${fileBase}`;
  const exportLine = `export { ${className} } from '${rel}';`;
  const cur = fs.readFileSync(indexPath, 'utf8');
  if (cur.includes(exportLine) || cur.includes(`from '${rel}'`)) return;
  fs.writeFileSync(indexPath, cur.trimEnd() + '\n' + exportLine + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'desktop-bridge',
  version: '1.0.0',
});

// ── Tool 1: scan_app ────────────────────────────────────────────────────────

server.tool(
  'scan_app',
  'Launch or connect to a desktop application and return its window title, PID, and platform.',
  { appName: z.string().describe('Application name (e.g. "Notes", "Calculator", "TV")') },
  async ({ appName }) => {
    const tool = 'scan_app';
    const t0 = Date.now();
    logger.info('tool_called', { tool, appName });
    try {
      if (process.platform === 'win32') {
        const hit = await WindowsAdapter.findWindow(appName);
        if (hit) {
          await (adapter as WindowsAdapter).connect(appName, hit.pid);
          connectedApp = appName;
        } else {
          await ensureConnected(appName);
        }
      } else {
        await ensureConnected(appName);
      }
      const title = await adapter.getTitle();
      const pid =
        process.platform === 'win32'
          ? (adapter as WindowsAdapter).getConnectedPid() ?? undefined
          : undefined;
      const platform = process.platform === 'win32' ? 'win32' : process.platform;
      logger.info('tool_success', { tool, durationMs: Date.now() - t0 });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ appName, title, pid, platform }, null, 2),
        }],
      };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('tool_failed', { tool, appName, error: e.message, stack: e.stack });
      return {
        content: [{ type: 'text' as const, text: `Error connecting to ${appName}: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── Tool 2: get_elements ────────────────────────────────────────────────────

server.tool(
  'get_elements',
  'Read the Accessibility tree of a running desktop app. Returns structured UI elements with role, name, bounds, and enabled state.',
  {
    appName: z.string().describe('Application name'),
    max: z.number().optional().default(100).describe('Max elements to return (default 100)'),
  },
  async ({ appName, max }) => {
    const tool = 'get_elements';
    const t0 = Date.now();
    logger.info('tool_called', { tool, appName, max });
    try {
      await ensureConnected(appName);
      const elements =
        process.platform === 'win32'
          ? await (adapter as WindowsAdapter).getElements(appName, max)
          : (await adapter.getElements()).slice(0, max);
      logger.info('tool_success', { tool, durationMs: Date.now() - t0 });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(elements, null, 2),
        }],
      };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('tool_failed', { tool, appName, error: e.message, stack: e.stack });
      return {
        content: [{ type: 'text' as const, text: `Error reading elements: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── PID-anchored vision capture ────────────────────────────────────────────
//
// All vision tools below funnel through `captureWindow()`. This guarantees:
//   • The target app's PID owns the foreground before the screenshot
//   • Only that PID's window pixels are captured (no dock / status bar / leak)
//   • The window's logical bounds + pixel scale are returned alongside the
//     image so coords can be translated back to clickable screen coords.

interface WindowSnapshot {
  buf: Buffer;
  imageWidth: number;
  imageHeight: number;
  bounds: WindowBounds | null;
}

async function captureWindow(appName: string): Promise<WindowSnapshot> {
  await ensureConnected(appName);
  await adapter.focusForVision();
  const bounds = await adapter.getWindowBounds();
  const buf = await adapter.screenshotWindow();
  const dim = readPngSize(buf) ?? { width: 0, height: 0 };
  return { buf, imageWidth: dim.width, imageHeight: dim.height, bounds };
}

function imageToScreenCoord(
  imgX: number, imgY: number, snap: WindowSnapshot,
): { x: number; y: number } | null {
  if (!snap.bounds || snap.imageWidth === 0 || snap.imageHeight === 0) {
    return { x: Math.round(imgX), y: Math.round(imgY) };
  }
  const sx = snap.imageWidth / snap.bounds.width;
  const sy = snap.imageHeight / snap.bounds.height;
  if (sx <= 0 || sy <= 0) return null;
  const screenX = snap.bounds.x + imgX / sx;
  const screenY = snap.bounds.y + imgY / sy;
  const margin = 2;
  if (
    screenX < snap.bounds.x - margin ||
    screenX > snap.bounds.x + snap.bounds.width + margin ||
    screenY < snap.bounds.y - margin ||
    screenY > snap.bounds.y + snap.bounds.height + margin
  ) {
    return null;
  }
  return { x: Math.round(screenX), y: Math.round(screenY) };
}

// ── Tool 3: screenshot ──────────────────────────────────────────────────────

server.tool(
  'screenshot',
  'Capture a PID-scoped screenshot of the target app\'s primary window. The app is focused first so its window is on top, and only that window is captured (no dock / status bar / overlapping apps). Returns base64-encoded PNG.',
  {
    appName: z.string().describe('Application to focus and capture'),
  },
  async ({ appName }) => {
    const tool = 'screenshot';
    const t0 = Date.now();
    logger.info('tool_called', { tool, appName });
    try {
      const snap = await captureWindow(appName);
      if (snap.buf.length === 0) {
        logger.error('tool_failed', { tool, appName, error: 'empty screenshot buffer' });
        return {
          content: [{ type: 'text' as const, text: 'Screenshot captured but was empty (check Screen Recording permission).' }],
          isError: true,
        };
      }
      logger.info('tool_success', { tool, durationMs: Date.now() - t0 });
      return {
        content: [{
          type: 'image' as const,
          data: snap.buf.toString('base64'),
          mimeType: 'image/png',
        }],
      };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('tool_failed', { tool, appName, error: e.message, stack: e.stack });
      return {
        content: [{ type: 'text' as const, text: `Screenshot failed: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── Tool 4: describe_screen ─────────────────────────────────────────────────

server.tool(
  'describe_screen',
  'Focus the target app, capture only its window, and use GPT-4o vision to describe what is shown. Window-scoped capture means the description is about THIS app, not whatever happens to be on screen. Requires an OpenAI API key (env or Windows DPAPI store).',
  {
    appName: z.string().describe('Application to describe'),
  },
  async ({ appName }) => {
    const tool = 'describe_screen';
    const t0 = Date.now();
    logger.info('tool_called', { tool, appName });
    if (!vision.isAvailable()) {
      return {
        content: [{ type: 'text' as const, text: 'OpenAI API key is not configured — vision features unavailable.' }],
        isError: true,
      };
    }
    try {
      const snap = await captureWindow(appName);
      const description = await vision.describeScreen(snap.buf);
      logger.info('tool_success', { tool, durationMs: Date.now() - t0 });
      return {
        content: [{ type: 'text' as const, text: description }],
      };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('tool_failed', { tool, appName, error: e.message, stack: e.stack });
      return {
        content: [{ type: 'text' as const, text: `describe_screen failed: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── Tool 5: locate_element ──────────────────────────────────────────────────

server.tool(
  'locate_element',
  'Find a UI element by natural-language description in the target app\'s window. Returns SCREEN-SPACE LOGICAL coordinates (ready to click). On Windows, coordinates use per-window DPI scaling from GetDpiForWindow. Requires an OpenAI API key (env or Windows DPAPI store).',
  {
    appName: z.string().describe('Application to search in'),
    description: z.string().describe('Natural-language description of the element (e.g. "the Save button", "email text field")'),
  },
  async ({ appName, description: desc }) => {
    const tool = 'locate_element';
    const t0 = Date.now();
    logger.info('tool_called', { tool, appName, description: desc });
    if (!vision.isAvailable()) {
      return {
        content: [{ type: 'text' as const, text: 'OpenAI API key is not configured — vision features unavailable.' }],
        isError: true,
      };
    }
    try {
      const snap = await captureWindow(appName);
      const imgCoords = await vision.locateElement(snap.buf, desc);
      if (!imgCoords) {
        return {
          content: [{ type: 'text' as const, text: `Element not found on screen: "${desc}"` }],
        };
      }

      if (process.platform === 'win32') {
        const win = adapter as WindowsAdapter;
        const bounds = snap.bounds;
        if (!bounds) {
          return {
            content: [{ type: 'text' as const, text: 'locate_element: window bounds unavailable for DPI translation' }],
            isError: true,
          };
        }
        const hwnd = await win.getMainWindowHandle();
        const scale = hwnd != null ? await win.getWindowDpiScale(hwnd) : 1;
        const screenX = bounds.x + Math.round(imgCoords.x / scale);
        const screenY = bounds.y + Math.round(imgCoords.y / scale);
        if (
          screenX < bounds.x ||
          screenX > bounds.x + bounds.width ||
          screenY < bounds.y ||
          screenY > bounds.y + bounds.height
        ) {
          throw new Error(
            'Located coordinates fall outside target window — possible hallucination, rejecting',
          );
        }
        logger.info('tool_success', { tool, durationMs: Date.now() - t0 });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              screen: { x: screenX, y: screenY },
              image: imgCoords,
              bounds,
              dpiScale: scale,
            }),
          }],
        };
      }

      const screenCoords = imageToScreenCoord(imgCoords.x, imgCoords.y, snap);
      if (!screenCoords) {
        return {
          content: [{
            type: 'text' as const,
            text: `Element appeared to be located outside window bounds — likely a vision hallucination. Image coord: ${JSON.stringify(imgCoords)}, window: ${JSON.stringify(snap.bounds)}`,
          }],
          isError: true,
        };
      }
      logger.info('tool_success', { tool, durationMs: Date.now() - t0 });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            screen: screenCoords,
            image: imgCoords,
            bounds: snap.bounds,
          }),
        }],
      };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('tool_failed', { tool, appName, error: e.message, stack: e.stack });
      return {
        content: [{ type: 'text' as const, text: `locate_element failed: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── Tool 6: generate_pom ────────────────────────────────────────────────────

server.tool(
  'generate_pom',
  'Scan a running desktop app\'s Accessibility tree and generate a DesktopPage POM class file under tests/pom/desktop/.',
  {
    appName: z.string().describe('Application to scan'),
    className: z.string().describe('POM class name (e.g. "NotesScreen", "CalculatorScreen")'),
    updateIndex: z.boolean().optional().default(true).describe('Append export to tests/pom/index.ts'),
  },
  async ({ appName, className, updateIndex }) => {
    const tool = 'generate_pom';
    const t0 = Date.now();
    logger.info('tool_called', { tool, appName, className });
    try {
      await ensureConnected(appName);
      const elements =
        process.platform === 'win32'
          ? await (adapter as WindowsAdapter).getElements(appName, 500)
          : await adapter.getElements();
      if (elements.length === 0) {
        logger.error('tool_failed', { tool, appName, error: 'no elements' });
        return {
          content: [{ type: 'text' as const, text: 'No elements found — check that the app is running and Accessibility is enabled.' }],
          isError: true,
        };
      }

      const source = buildPomSource(className, elements);
      const fileBase = kebabFromClass(className);
      const outPath = path.join(ROOT, 'tests', 'pom', 'desktop', `${fileBase}.ts`);

      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, source, 'utf8');

      if (updateIndex) appendPomIndex(className, fileBase);

      const relPath = path.relative(ROOT, outPath);
      logger.info('tool_success', { tool, durationMs: Date.now() - t0 });
      return {
        content: [{
          type: 'text' as const,
          text: `Wrote ${relPath} (${elements.length} elements scanned)\n\n${source}`,
        }],
      };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('tool_failed', { tool, appName, error: e.message, stack: e.stack });
      return {
        content: [{ type: 'text' as const, text: `generate_pom failed: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ── Tool 7: generate_test ───────────────────────────────────────────────────

server.tool(
  'generate_test',
  'Scaffold a Playwright desktop test spec file (.desktop.spec.ts) that imports a POM class.',
  {
    appName: z.string().describe('Application name (used in test title and @app tag)'),
    className: z.string().describe('POM class name to import (e.g. "NotesScreen")'),
    intent: z.string().describe('Short description of what the test should verify (e.g. "create and search notes")'),
    fileName: z.string().optional().describe('Output file name without path (e.g. "notes.desktop.spec.ts"). Defaults to <kebab-app>.desktop.spec.ts'),
  },
  async ({ appName, className, intent, fileName }) => {
    const tool = 'generate_test';
    const t0 = Date.now();
    logger.info('tool_called', { tool, appName, className });
    try {
      const kebab = kebabFromClass(appName);
      const specName = fileName || `${kebab}.desktop.spec.ts`;
      const outPath = path.join(ROOT, 'tests', 'desktop', specName);

      const pomFileBase = kebabFromClass(className);
      const pomRelPath = `../pom/desktop/${pomFileBase}`;

      const source = buildTestSource(className, pomRelPath, appName, intent);

      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, source, 'utf8');

      const relPath = path.relative(ROOT, outPath);
      logger.info('tool_success', { tool, durationMs: Date.now() - t0 });
      return {
        content: [{
          type: 'text' as const,
          text: `Wrote ${relPath}\n\n${source}`,
        }],
      };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error('tool_failed', { tool, appName, error: e.message, stack: e.stack });
      return {
        content: [{ type: 'text' as const, text: `generate_test failed: ${e.message}` }],
        isError: true,
      };
    }
  },
);

// ─── Tool 8: office_action ────────────────────────────────────────────────────
server.tool(
  'office_action',
  'Run an Office automation action (Excel read/write, Word export, Outlook send) via the .NET sidecar. Only available on Windows with sidecar built.',
  {
    action: z
      .enum([
        'excel.read_cell',
        'excel.write_cell',
        'excel.read_range',
        'excel.run_macro',
        'word.insert_text',
        'word.export_pdf',
        'outlook.send_email',
        'outlook.list_inbox',
      ])
      .describe('The Office action to perform'),
    args: z.record(z.string(), z.unknown()).describe('Action-specific arguments (file, cell, value, etc.)'),
  },
  async ({ action, args }) => {
    try {
      if (process.platform !== 'win32') {
        return {
          content: [{ type: 'text' as const, text: 'office_action is Windows-only.' }],
          isError: true,
        };
      }
      const { getSidecar } = await import('../src/drivers/desktop/dotnet-bridge');
      const result = await getSidecar().call(action, args as Record<string, unknown>);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${err}` }], isError: true };
    }
  },
);

// ─── Tool 9: manage_secret ────────────────────────────────────────────────────
server.tool(
  'manage_secret',
  'Store or retrieve an encrypted secret using Windows DPAPI. Secrets are user-scoped and never stored in plaintext. Only available on Windows with sidecar built.',
  {
    operation: z.enum(['save', 'load']).describe('"save" encrypts and stores, "load" retrieves'),
    name: z.string().describe('Secret name key (e.g. "openai-api-key")'),
    value: z.string().optional().describe('The secret value (required for save)'),
  },
  async ({ operation, name, value }) => {
    try {
      if (process.platform !== 'win32') {
        return {
          content: [{ type: 'text' as const, text: 'manage_secret is Windows-only.' }],
          isError: true,
        };
      }
      const { getSidecar } = await import('../src/drivers/desktop/dotnet-bridge');
      const sidecar = getSidecar();
      if (operation === 'save') {
        if (!value) throw new Error('"value" is required for save operation');
        await sidecar.call('secrets.encrypt', { name, value });
        return { content: [{ type: 'text' as const, text: `Secret "${name}" stored securely.` }] };
      } else {
        const result = (await sidecar.call('secrets.decrypt', { name })) as { value: string };
        return { content: [{ type: 'text' as const, text: result.value }] };
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${err}` }], isError: true };
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`desktop-bridge MCP server failed to start: ${err}\n`);
  process.exit(1);
});
