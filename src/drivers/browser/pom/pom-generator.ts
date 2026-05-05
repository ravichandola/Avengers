import * as fs from 'fs';
import * as path from 'path';
import type { ScannedElement, DOMScanResult, SemanticRegion } from './dom-scanner';
import { SelectorStrategy, type RankedSelector } from './selector-strategy';

export interface POMField {
  property: string;
  selector: string;
  confidence: RankedSelector['confidence'];
  strategy: RankedSelector['strategy'];
  tag: string;
  region: SemanticRegion;
  hint?: string;
}

export interface POMGeneratorOptions {
  className?: string;
  outputPath?: string;
  baseClass?: 'PageObject' | 'DriverPage';
  staticUrlProp?: string;
  updateBarrel?: boolean;
  barrelPath?: string;
  generateHelpers?: boolean;
}

interface RegionGroup {
  region: SemanticRegion;
  fields: POMField[];
}

const REGION_ORDER: SemanticRegion[] = [
  'nav', 'header', 'form', 'main', 'section', 'sidebar', 'modal', 'footer', 'unknown',
];

const REGION_COMMENTS: Record<SemanticRegion, string> = {
  nav: 'Navigation',
  header: 'Header',
  form: 'Form Fields',
  main: 'Main Content',
  section: 'Sections',
  sidebar: 'Sidebar',
  modal: 'Modal / Dialog',
  footer: 'Footer',
  unknown: 'Other',
};

export class POMGenerator {
  private readonly strategy = new SelectorStrategy();

  generate(scan: DOMScanResult, options?: POMGeneratorOptions): string {
    const opts = this.resolveOptions(scan, options);
    const fields = this.buildFields(scan.elements);
    const groups = this.groupByRegion(fields);
    const code = this.emit(opts, scan.url, groups);
    return code;
  }

  generateAndWrite(scan: DOMScanResult, options?: POMGeneratorOptions): { code: string; outputPath: string; fields: POMField[] } {
    const opts = this.resolveOptions(scan, options);
    const fields = this.buildFields(scan.elements);
    const groups = this.groupByRegion(fields);
    const code = this.emit(opts, scan.url, groups);

    const outputPath = opts.outputPath!;
    this.writeAtomic(outputPath, code);

    if (opts.updateBarrel && opts.barrelPath) {
      this.updateBarrelExport(opts.barrelPath, opts.className!, outputPath);
    }

    return { code, outputPath, fields };
  }

  buildFields(elements: ScannedElement[]): POMField[] {
    const usedProps = new Set<string>();
    const fields: POMField[] = [];

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const ranked = this.strategy.rank(el, i);
      const label = el.testId || el.id || el.name || el.ariaLabel || el.placeholder || el.text || el.tag;
      const property = toCamelCase(String(label), usedProps);
      const hint = [el.tag, el.text?.slice(0, 40)].filter(Boolean).join(' — ');

      fields.push({
        property,
        selector: ranked.selector,
        confidence: ranked.confidence,
        strategy: ranked.strategy,
        tag: el.tag,
        region: el.region,
        hint,
      });
    }

    return fields;
  }

  private resolveOptions(scan: DOMScanResult, options?: POMGeneratorOptions): Required<POMGeneratorOptions> {
    const className = options?.className || urlToClassName(scan.url);
    const kebab = toKebabCase(className);
    const root = findProjectRoot();
    return {
      className,
      outputPath: options?.outputPath || path.join(root, 'tests', 'pom', 'browser', `${kebab}.ts`),
      baseClass: options?.baseClass || 'PageObject',
      staticUrlProp: options?.staticUrlProp || 'entryUrl',
      updateBarrel: options?.updateBarrel ?? false,
      barrelPath: options?.barrelPath || path.join(root, 'tests', 'pom', 'index.ts'),
      generateHelpers: options?.generateHelpers ?? true,
    };
  }

  private groupByRegion(fields: POMField[]): RegionGroup[] {
    const map = new Map<SemanticRegion, POMField[]>();
    for (const f of fields) {
      const list = map.get(f.region) || [];
      list.push(f);
      map.set(f.region, list);
    }

    const groups: RegionGroup[] = [];
    for (const region of REGION_ORDER) {
      const regionFields = map.get(region);
      if (regionFields && regionFields.length > 0) {
        groups.push({ region, fields: regionFields });
      }
    }
    return groups;
  }

  private emit(
    opts: Required<POMGeneratorOptions>,
    url: string,
    groups: RegionGroup[],
  ): string {
    const lines: string[] = [];

    if (opts.baseClass === 'PageObject') {
      lines.push(`import { PageObject } from '../../../src/drivers/browser/pom/page-object';`);
      lines.push(`import { Page } from 'playwright';`);
    } else {
      lines.push(`import { DriverPage } from '../../../src/pom/driver-page';`);
    }
    lines.push('');
    lines.push(`/** Auto-generated POM for ${url} */`);

    if (opts.baseClass === 'PageObject') {
      lines.push(`export class ${opts.className} extends PageObject {`);
      lines.push(`  static readonly ${opts.staticUrlProp} = ${JSON.stringify(url)};`);
      lines.push('');

      for (const group of groups) {
        lines.push(`  // ─── ${REGION_COMMENTS[group.region]} ${'─'.repeat(Math.max(0, 50 - REGION_COMMENTS[group.region].length))}`)
        lines.push('');
        for (const f of group.fields) {
          lines.push(`  readonly ${f.property} = this.locator(${JSON.stringify(f.selector)});`);
        }
        lines.push('');
      }

      lines.push(`  async open(): Promise<void> {`);
      lines.push(`    await this.navigate(${opts.className}.${opts.staticUrlProp});`);
      lines.push(`  }`);

      if (opts.generateHelpers) {
        const formFields = groups
          .filter((g) => g.region === 'form')
          .flatMap((g) => g.fields)
          .filter((f) => ['input', 'textarea', 'select'].includes(f.tag));

        if (formFields.length >= 2) {
          lines.push('');
          const paramType = formFields
            .map((f) => `${f.property}?: string`)
            .join('; ');
          lines.push(`  async fillForm(data: { ${paramType} }): Promise<void> {`);
          for (const f of formFields) {
            lines.push(`    if (data.${f.property} !== undefined) await this.${f.property}.fill(data.${f.property});`);
          }
          lines.push(`  }`);
        }
      }
    } else {
      lines.push(`export class ${opts.className} extends DriverPage {`);
      lines.push(`  static readonly ${opts.staticUrlProp} = ${JSON.stringify(url)};`);
      lines.push('');

      for (const group of groups) {
        lines.push(`  // ─── ${REGION_COMMENTS[group.region]} ${'─'.repeat(Math.max(0, 50 - REGION_COMMENTS[group.region].length))}`)
        lines.push('');
        for (const f of group.fields) {
          lines.push(`  readonly ${f.property} = this.element(${JSON.stringify(f.selector)});`);
        }
        lines.push('');
      }

      lines.push(`  async open(): Promise<void> {`);
      lines.push(`    await this.navigate(${opts.className}.${opts.staticUrlProp});`);
      lines.push(`  }`);
    }

    lines.push('}');
    lines.push('');
    return lines.join('\n');
  }

  private writeAtomic(outputPath: string, content: string): void {
    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${outputPath}.tmp`;
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, outputPath);
  }

  private updateBarrelExport(barrelPath: string, className: string, outputPath: string): void {
    if (!fs.existsSync(barrelPath)) return;

    const relDir = path.dirname(barrelPath);
    const relativePath = path.relative(relDir, outputPath).replace(/\.ts$/, '');
    const normalizedRel = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
    const exportLine = `export { ${className} } from '${normalizedRel}';`;

    const current = fs.readFileSync(barrelPath, 'utf8');
    if (current.includes(exportLine) || current.includes(`from '${normalizedRel}'`)) {
      return;
    }

    const updated = current.trimEnd() + '\n' + exportLine + '\n';
    this.writeAtomic(barrelPath, updated);
  }
}

function toCamelCase(label: string, usedProps: Set<string>): string {
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
  if (base.length > 40) base = base.slice(0, 40);

  let out = base;
  let n = 2;
  while (usedProps.has(out)) {
    out = `${base}${n++}`;
  }
  usedProps.add(out);
  return out;
}

function urlToClassName(u: string): string {
  try {
    const host = new URL(u).hostname.replace(/^www\./, '');
    const bit = host.split('.')[0] || 'page';
    const pascal = bit
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
      .join('');
    return `${pascal || 'Generated'}Page`;
  } catch {
    return 'GeneratedPage';
  }
}

function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function findProjectRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
