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
  lines.push(`  test.skip(process.platform !== 'darwin', 'macOS only');`);
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
    try {
      await ensureConnected(appName);
      const title = await adapter.getTitle();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ appName, title, platform: process.platform }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error connecting to ${appName}: ${err}` }],
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
    try {
      await ensureConnected(appName);
      const elements = await adapter.getElements();
      const trimmed = elements.slice(0, max);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(trimmed, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error reading elements: ${err}` }],
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
    try {
      const snap = await captureWindow(appName);
      if (snap.buf.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'Screenshot captured but was empty (check Screen Recording permission).' }],
          isError: true,
        };
      }
      return {
        content: [{
          type: 'image' as const,
          data: snap.buf.toString('base64'),
          mimeType: 'image/png',
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Screenshot failed: ${err}` }],
        isError: true,
      };
    }
  },
);

// ── Tool 4: describe_screen ─────────────────────────────────────────────────

server.tool(
  'describe_screen',
  'Focus the target app, capture only its window, and use GPT-4o vision to describe what is shown. Window-scoped capture means the description is about THIS app, not whatever happens to be on screen. Requires OPENAI_API_KEY.',
  {
    appName: z.string().describe('Application to describe'),
  },
  async ({ appName }) => {
    if (!vision.isAvailable()) {
      return {
        content: [{ type: 'text' as const, text: 'OPENAI_API_KEY is not set — vision features unavailable.' }],
        isError: true,
      };
    }
    try {
      const snap = await captureWindow(appName);
      const description = await vision.describeScreen(snap.buf);
      return {
        content: [{ type: 'text' as const, text: description }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `describe_screen failed: ${err}` }],
        isError: true,
      };
    }
  },
);

// ── Tool 5: locate_element ──────────────────────────────────────────────────

server.tool(
  'locate_element',
  'Find a UI element by natural-language description in the target app\'s window. Returns SCREEN-SPACE LOGICAL coordinates (ready to click) translated from image-pixel coords using the captured window bounds + DPI scale. Returns null if the located coord falls outside the window (hallucination guard). Requires OPENAI_API_KEY.',
  {
    appName: z.string().describe('Application to search in'),
    description: z.string().describe('Natural-language description of the element (e.g. "the Save button", "email text field")'),
  },
  async ({ appName, description: desc }) => {
    if (!vision.isAvailable()) {
      return {
        content: [{ type: 'text' as const, text: 'OPENAI_API_KEY is not set — vision features unavailable.' }],
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
      return {
        content: [{ type: 'text' as const, text: `locate_element failed: ${err}` }],
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
    try {
      await ensureConnected(appName);
      const elements = await adapter.getElements();
      if (elements.length === 0) {
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
      return {
        content: [{
          type: 'text' as const,
          text: `Wrote ${relPath} (${elements.length} elements scanned)\n\n${source}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `generate_pom failed: ${err}` }],
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
      return {
        content: [{
          type: 'text' as const,
          text: `Wrote ${relPath}\n\n${source}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `generate_test failed: ${err}` }],
        isError: true,
      };
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
