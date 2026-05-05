import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { MacOSAdapter } from '../src/drivers/desktop/macos-adapter';
import { WindowsAdapter } from '../src/drivers/desktop/windows-adapter';

const root = path.resolve(__dirname, '..');

type Platform = 'browser' | 'mobile' | 'desktop' | 'api';

interface BrowserElement {
  prop: string;
  selector: string;
  hint?: string;
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function parseArgs(argv: string[]): {
  platform: Platform;
  flags: Record<string, string | boolean>;
  rest: string[];
} {
  const a = argv.slice(2);
  if (a.length === 0 || a[0] === '--help' || a[0] === '-h') {
    return { platform: 'browser', flags: { help: true }, rest: [] };
  }
  const platform = a[0] as Platform;
  if (!['browser', 'mobile', 'desktop', 'api'].includes(platform)) {
    die(`Unknown platform "${a[0]}". Use: browser | mobile | desktop | api`);
  }
  const flags: Record<string, string | boolean> = {};
  for (let i = 1; i < a.length; i++) {
    const arg = a[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = a[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return { platform, flags, rest: [] };
}

function toCamelProps(label: string, used: Set<string>): string {
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
  while (used.has(out)) {
    out = `${base}${n++}`;
  }
  used.add(out);
  return out;
}

function urlToClassName(u: string, suffix: string): string {
  try {
    const host = new URL(u).hostname.replace(/^www\./, '');
    const bit = host.split('.')[0] || 'page';
    const pascal = bit
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
      .join('');
    return `${pascal || 'Generated'}${suffix}`;
  } catch {
    return `Generated${suffix}`;
  }
}

function escapeSelectorForTs(s: string): string {
  return JSON.stringify(s);
}

/** Playwright resolveSelector: use [ # . // xpath= or strings containing : or >> */
function bestBrowserSelector(
  meta: {
    tag: string;
    testId?: string;
    id?: string;
    name?: string;
    type?: string;
    aria?: string;
    placeholder?: string;
    text?: string;
    href?: string;
  },
  index: number,
): string {
  const t = meta.tag.toLowerCase();
  if (meta.testId) return `[data-testid=${JSON.stringify(meta.testId)}]`;
  if (meta.id && /^[a-zA-Z_][\w-]*$/.test(meta.id)) {
    return `#${meta.id}`;
  }
  if (meta.id) return `[id=${JSON.stringify(meta.id)}]`;
  if (meta.name) return `[name=${JSON.stringify(meta.name)}]`;
  if (meta.aria) return `[aria-label=${JSON.stringify(meta.aria)}]`;
  if (meta.placeholder) return `[placeholder=${JSON.stringify(meta.placeholder)}]`;
  const text = (meta.text || '').trim().slice(0, 60);
  if (text && text.length <= 50) {
    const esc = text.replace(/"/g, '\\"');
    if (t === 'a' && meta.href) return `a[href=${JSON.stringify(meta.href)}]`;
    if (t === 'a') return `a:has-text("${esc}")`;
    if (t === 'button' || meta.tag === 'BUTTON') return `button:has-text("${esc}")`;
    if (t === 'input' || t === 'textarea' || t === 'select') {
      const ph = (meta.placeholder || text).slice(0, 60);
      if (ph) {
        const safe = ph.replace(/'/g, "''");
        return `xpath=//${t}[contains(@placeholder, '${safe}')]`;
      }
      return `xpath=(//${t})[${index + 1}]`;
    }
  }
  if (t === 'input' && meta.type) return `input[type=${JSON.stringify(meta.type)}]`;
  return `xpath=(//${t})[${index + 1}]`;
}

async function scanBrowser(url: string, maxEl: number): Promise<{ entryUrl: string; elements: BrowserElement[] }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const raw = await page.evaluate(() => {
      type M = {
        tag: string;
        testId?: string;
        id?: string;
        name?: string;
        type?: string;
        aria?: string;
        placeholder?: string;
        text?: string;
        href?: string;
      };
      const out: M[] = [];
      const nodes = document.querySelectorAll(
        'a[href], button, [role="button"], [role="link"], input:not([type="hidden"]), select, textarea, [data-testid]',
      );
      nodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const rect = node.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;
        const st = window.getComputedStyle(node);
        if (st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0') return;
        const tag = node.tagName;
        let text = '';
        if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
          text = node.placeholder || node.value || '';
        } else if (node instanceof HTMLSelectElement) {
          text = node.value || '';
        } else {
          text = (node.innerText || node.textContent || '').trim().slice(0, 120);
        }
        const te = node.getAttribute('data-testid') || '';
        const id = node.getAttribute('id') || '';
        out.push({
          tag,
          testId: te || undefined,
          id: id || undefined,
          name: node.getAttribute('name') || undefined,
          type: node.getAttribute('type') || undefined,
          aria: node.getAttribute('aria-label') || undefined,
          placeholder: node.getAttribute('placeholder') || undefined,
          text: text || undefined,
          href: node instanceof HTMLAnchorElement ? node.getAttribute('href') || undefined : undefined,
        });
      });
      return out;
    });
    const used = new Set<string>();
    const elements: BrowserElement[] = [];
    raw.slice(0, maxEl).forEach((m, i) => {
      const sel = bestBrowserSelector(m, i);
      const label = m.testId || m.id || m.name || m.aria || m.placeholder || m.text || m.tag;
      const prop = toCamelProps(String(label), used);
      elements.push({ prop, selector: sel, hint: [m.tag, m.text].filter(Boolean).join(' ') });
    });
    return { entryUrl: url, elements };
  } finally {
    await browser.close();
  }
}

function parseMobileXml(xml: string): BrowserElement[] {
  const used = new Set<string>();
  const seenSel = new Set<string>();
  const out: BrowserElement[] = [];
  const tagRe =
    /<(XCUIElementType\w+|android\.widget\.\w+)[^>]*>/g;

  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    const chunk = m[0];
    const nameMatch = /\bname="([^"]*)"/.exec(chunk);
    const labelMatch = /\blabel="([^"]*)"/.exec(chunk);
    const ridMatch = /\bresource-id="([^"]*)"/.exec(chunk);
    const contentDesc = /\bcontent-desc="([^"]*)"/.exec(chunk);
    const textMatch = /\btext="([^"]*)"/.exec(chunk);

    const raw =
      (nameMatch && nameMatch[1]) ||
      (labelMatch && labelMatch[1]) ||
      (contentDesc && contentDesc[1]) ||
      (textMatch && textMatch[1]) ||
      (ridMatch && ridMatch[1].split('/').pop());

    if (!raw || !raw.trim()) continue;
    if (/^[0-9]+$/.test(raw.trim())) continue;

    const sel = raw.trim();
    if (seenSel.has(sel)) continue;
    seenSel.add(sel);

    const prop = toCamelProps(sel, used);
    out.push({ prop, selector: sel });
  }

  return out;
}

async function scanDesktop(appName: string, maxEl: number): Promise<BrowserElement[]> {
  const adapter: MacOSAdapter | WindowsAdapter =
    process.platform === 'darwin' ? new MacOSAdapter() : new WindowsAdapter();
  await adapter.connect(appName);
  const uiElements = await adapter.getElements();
  const used = new Set<string>();
  const out: BrowserElement[] = [];

  for (const el of uiElements.slice(0, maxEl)) {
    const label = el.name || el.label || el.id;
    if (!label || label.startsWith('ax-')) continue;
    const prop = toCamelProps(label, used);
    out.push({ prop, selector: label, hint: el.role });
  }

  await adapter.disconnect();
  return out;
}

interface DesktopJson {
  elements: Array<{ property?: string; selector: string }>;
}

interface ApiJson {
  className: string;
  comment?: string;
  endpoints: Array<{
    name: string;
    method: 'get' | 'post' | 'put' | 'patch' | 'delete';
    path: string;
  }>;
}

function generateBrowserPom(
  className: string,
  entryUrl: string,
  elements: BrowserElement[],
  outPath: string,
  staticUrlProp: string,
): string {
  const lines: string[] = [];
  lines.push(`import { DriverPage } from '../../../src/pom/driver-page';`);
  lines.push('');
  lines.push(`/** Auto-generated (browser) — ${entryUrl} */`);
  lines.push(`export class ${className} extends DriverPage {`);
  lines.push(`  static readonly ${staticUrlProp} = ${escapeSelectorForTs(entryUrl)};`);
  for (const e of elements) {
    lines.push(`  readonly ${e.prop} = this.element(${escapeSelectorForTs(e.selector)});`);
  }
  lines.push('');
  lines.push(`  async open(): Promise<void> {`);
  lines.push(`    await this.navigate(${className}.${staticUrlProp});`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push('');
  const body = lines.join('\n');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body, 'utf8');
  return body;
}

function generateMobilePom(className: string, elements: BrowserElement[], outPath: string): string {
  const lines: string[] = [];
  lines.push(`import { MobileScreen } from '../../../src/drivers/mobile/pom/mobile-screen';`);
  lines.push(`import { MobileDriver } from '../../../src/drivers/mobile/mobile-driver';`);
  lines.push('');
  lines.push(`/** Auto-generated (mobile) */`);
  lines.push(`export class ${className} extends MobileScreen {`);
  for (const e of elements) {
    lines.push(`  readonly ${e.prop} = this.element(${escapeSelectorForTs(e.selector)});`);
  }
  lines.push('');
  lines.push(`  constructor(driver: MobileDriver) {`);
  lines.push(`    super(driver);`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push('');
  const body = lines.join('\n');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body, 'utf8');
  return body;
}

function generateDesktopPom(className: string, elements: BrowserElement[], outPath: string): string {
  const lines: string[] = [];
  lines.push(`import { DesktopPage } from '../../../src/drivers/desktop/pom/desktop-page';`);
  lines.push(`import { DesktopDriver } from '../../../src/drivers/desktop/desktop-driver';`);
  lines.push('');
  lines.push(`/** Auto-generated (desktop — selectors = AX / System Events titles) */`);
  lines.push(`export class ${className} extends DesktopPage {`);
  for (const e of elements) {
    lines.push(`  readonly ${e.prop} = this.element(${escapeSelectorForTs(e.selector)});`);
  }
  lines.push('');
  lines.push(`  constructor(driver: DesktopDriver) {`);
  lines.push(`    super(driver);`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push('');
  const body = lines.join('\n');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body, 'utf8');
  return body;
}

function pathToParams(p: string): string[] {
  const parts: string[] = [];
  const re = /:([a-zA-Z_][\w]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p)) !== null) {
    parts.push(m[1]);
  }
  return parts;
}

function generateApiPom(spec: ApiJson, outPath: string): string {
  const lines: string[] = [];
  lines.push(`import { APIResponse } from '../../../src/core/types';`);
  lines.push(`import { APIDriver } from '../../../src/drivers/api/api-driver';`);
  lines.push(`import { EndpointGroup } from '../../../src/drivers/api/pom/endpoint-group';`);
  lines.push('');
  if (spec.comment) lines.push(`/** Auto-generated (api) — ${spec.comment} */`);
  else lines.push(`/** Auto-generated (api) */`);
  lines.push(`export class ${spec.className} extends EndpointGroup {`);
  lines.push(`  constructor(api: APIDriver) {`);
  lines.push(`    super(api);`);
  lines.push(`  }`);
  lines.push('');

  for (const ep of spec.endpoints) {
    const params = pathToParams(ep.path);
    const args = params.map((x) => `${x}: string | number`).join(', ');
    const argStr = args ? args : '';
    const pathExpr =
      params.length === 0
        ? escapeSelectorForTs(ep.path)
        : '`' +
          ep.path.replace(/:([a-zA-Z_][\w]*)/g, '${$1}') +
          '`';

    const method = ep.method.toLowerCase();
    const ret = `Promise<APIResponse>`;
    if (method === 'get') {
      lines.push(`  ${ep.name}(${argStr}): ${ret} {`);
      lines.push(`    return this.get(${pathExpr});`);
      lines.push(`  }`);
    } else if (method === 'post') {
      const head = argStr ? `${argStr}, body?: Record<string, unknown>` : `body?: Record<string, unknown>`;
      lines.push(`  ${ep.name}(${head}): ${ret} {`);
      lines.push(`    return this.post(${pathExpr}, body);`);
      lines.push(`  }`);
    } else if (method === 'put' || method === 'patch') {
      const mth = method;
      const head = argStr ? `${argStr}, body: Record<string, unknown>` : `body: Record<string, unknown>`;
      lines.push(`  ${ep.name}(${head}): ${ret} {`);
      lines.push(`    return this.${mth}(${pathExpr}, body);`);
      lines.push(`  }`);
    } else if (method === 'delete') {
      lines.push(`  ${ep.name}(${argStr}): ${ret} {`);
      lines.push(`    return this.del(${pathExpr});`);
      lines.push(`  }`);
    }
    lines.push('');
  }

  lines.push(`}`);
  lines.push('');
  const body = lines.join('\n');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body, 'utf8');
  return body;
}

function kebabFromClass(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function maybeUpdateIndex(platform: Platform, className: string, fileBase: string): void {
  const indexPath = path.join(root, 'tests', 'pom', 'index.ts');
  if (!fs.existsSync(indexPath)) return;
  const rel = `./${platform}/${fileBase}`;
  const exportLine = `export { ${className} } from '${rel}';`;
  const cur = fs.readFileSync(indexPath, 'utf8');
  if (cur.includes(exportLine) || cur.includes(`from '${rel}'`)) {
    console.log('index.ts already exports this POM — skip.');
    return;
  }
  const next = cur.trimEnd() + '\n' + exportLine + '\n';
  fs.writeFileSync(indexPath, next, 'utf8');
  console.log('Appended export to tests/pom/index.ts');
}

function printHelp(): void {
  console.log(`
Auto POM generator for desktop-agent

  npx ts-node --project scripts/tsconfig.json scripts/generate-pom.ts <platform> [options]

Platforms:
  browser   Scan a URL with Playwright and emit DriverPage (browser POM).
  mobile    Parse Appium page source XML (save from Inspector or driver.getPageSource()).
  desktop   Read JSON list of AX / UI titles → DesktopPage.
  api       Read JSON endpoint spec → EndpointGroup.

browser:
  --url <url>              (required) Page to open
  --class-name <Name>      Default: derived from host + "Page"
  --out <file.ts>          Default: tests/pom/browser/<kebab-class>.ts
  --static-prop <name>     Name for static URL property (default: entryUrl)
  --max-elements <n>       Cap fields (default: 80)
  --update-index           Append export to tests/pom/index.ts

mobile:
  --source <page.xml>      (required) Raw XML from iOS/Android
  --class-name <Name>      Default: GeneratedMobileScreen
  --out <file.ts>          Default: tests/pom/mobile/<kebab>.ts
  --update-index

desktop:
  --app <AppName>          Live-scan a running app's Accessibility tree (e.g. --app Notes)
  --json <spec.json>       Static JSON: { "elements": [{ "property"?: "signInButton", "selector": "Sign In" }] }
                           (one of --app or --json is required)
  --class-name <Name>      Default: <AppName>Screen or GeneratedDesktopScreen
  --max-elements <n>       Cap fields when using --app (default: 100)
  --out, --update-index    same as above

api:
  --json <spec.json>       (required)
        {
          "className": "UserApi",
          "comment": "optional",
          "endpoints": [
            { "name": "list", "method": "get", "path": "/posts" },
            { "name": "getById", "method": "get", "path": "/posts/:id" }
          ]
        }
  --out, --update-index
`);
}

async function main(): Promise<void> {
  const { platform, flags } = parseArgs(process.argv);
  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  const updateIndex = Boolean(flags['update-index']);

  if (platform === 'browser') {
    const url = flags.url as string | undefined;
    if (!url) die('browser: --url <url> is required');
    const className = (flags['class-name'] as string) || urlToClassName(url, 'Page');
    const maxEl = Math.min(500, Math.max(1, parseInt(String(flags['max-elements'] || '80'), 10) || 80));
    const staticProp = (flags['static-prop'] as string) || 'entryUrl';
    const fileBase = `${kebabFromClass(className)}.ts`;
    const out =
      (flags.out as string) || path.join(root, 'tests', 'pom', 'browser', fileBase);
    console.log(`Scanning ${url} ...`);
    const { entryUrl, elements } = await scanBrowser(url, maxEl);
    generateBrowserPom(className, entryUrl, elements, out, staticProp);
    console.log(`Wrote ${path.relative(root, out)} (${elements.length} elements)`);
    if (updateIndex) maybeUpdateIndex('browser', className, fileBase.replace(/\.ts$/, ''));
    return;
  }

  if (platform === 'mobile') {
    const srcPath = flags.source as string | undefined;
    if (!srcPath) die('mobile: --source <page.xml> is required');
    const xml = fs.readFileSync(path.resolve(srcPath), 'utf8');
    const className = (flags['class-name'] as string) || 'GeneratedMobileScreen';
    const fileBase = `${kebabFromClass(className)}.ts`;
    const out = (flags.out as string) || path.join(root, 'tests', 'pom', 'mobile', fileBase);
    const elements = parseMobileXml(xml);
    if (elements.length === 0) {
      console.warn('No elements parsed — check XML is Appium page source.');
    }
    generateMobilePom(className, elements, out);
    console.log(`Wrote ${path.relative(root, out)} (${elements.length} elements)`);
    if (updateIndex) maybeUpdateIndex('mobile', className, fileBase.replace(/\.ts$/, ''));
    return;
  }

  if (platform === 'desktop') {
    const jsonPath = flags.json as string | undefined;
    const appName = flags.app as string | undefined;

    if (!jsonPath && !appName) die('desktop: --json <spec.json> or --app <AppName> is required');

    let elements: BrowserElement[];

    if (appName) {
      const maxEl = Math.min(500, Math.max(1, parseInt(String(flags['max-elements'] || '100'), 10) || 100));
      console.log(`Live-scanning ${appName} via Accessibility tree ...`);
      elements = await scanDesktop(appName, maxEl);
      if (elements.length === 0) {
        die('No elements found — check the app is running and Accessibility is enabled.');
      }
    } else {
      const raw = JSON.parse(fs.readFileSync(path.resolve(jsonPath!), 'utf8')) as DesktopJson;
      if (!raw.elements?.length) die('desktop JSON needs { "elements": [ { "selector": "..." } ] }');
      const used = new Set<string>();
      elements = raw.elements.map((e) => {
        if (e.property) {
          let p = e.property;
          let n = 2;
          while (used.has(p)) p = `${e.property}${n++}`;
          used.add(p);
          return { prop: p, selector: e.selector };
        }
        return { prop: toCamelProps(e.selector, used), selector: e.selector };
      });
    }

    const className = (flags['class-name'] as string) || (appName ? `${appName.replace(/\s+/g, '')}Screen` : 'GeneratedDesktopScreen');
    const fileBase = `${kebabFromClass(className)}.ts`;
    const out = (flags.out as string) || path.join(root, 'tests', 'pom', 'desktop', fileBase);
    generateDesktopPom(className, elements, out);
    console.log(`Wrote ${path.relative(root, out)} (${elements.length} elements)`);
    if (updateIndex) maybeUpdateIndex('desktop', className, fileBase.replace(/\.ts$/, ''));
    return;
  }

  if (platform === 'api') {
    const jsonPath = flags.json as string | undefined;
    if (!jsonPath) die('api: --json <spec.json> is required');
    const spec = JSON.parse(fs.readFileSync(path.resolve(jsonPath), 'utf8')) as ApiJson;
    if (!spec.className || !spec.endpoints?.length) die('api JSON needs className + endpoints[]');
    const fileBase = `${kebabFromClass(spec.className)}.ts`;
    const out = (flags.out as string) || path.join(root, 'tests', 'pom', 'api', fileBase);
    generateApiPom(spec, out);
    console.log(`Wrote ${path.relative(root, out)}`);
    if (updateIndex) maybeUpdateIndex('api', spec.className, fileBase.replace(/\.ts$/, ''));
    return;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
