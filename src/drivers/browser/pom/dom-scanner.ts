import { Page } from 'playwright';

export interface ScannedElement {
  tag: string;
  testId?: string;
  id?: string;
  name?: string;
  type?: string;
  ariaLabel?: string;
  ariaRole?: string;
  placeholder?: string;
  text?: string;
  href?: string;
  formAction?: string;
  value?: string;
  bounds: { x: number; y: number; width: number; height: number };
  region: SemanticRegion;
  parentFormName?: string;
  isInteractive: boolean;
  childCount: number;
}

export type SemanticRegion =
  | 'nav'
  | 'header'
  | 'main'
  | 'footer'
  | 'form'
  | 'modal'
  | 'sidebar'
  | 'section'
  | 'unknown';

export interface DOMScanResult {
  url: string;
  title: string;
  elements: ScannedElement[];
  regions: Record<SemanticRegion, number>;
  timestamp: number;
}

export interface DOMScannerOptions {
  maxElements?: number;
  includeHidden?: boolean;
  minSize?: number;
  scanShadowDOM?: boolean;
}

const DEFAULT_OPTIONS: Required<DOMScannerOptions> = {
  maxElements: 200,
  includeHidden: false,
  minSize: 2,
  scanShadowDOM: true,
};

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="searchbox"]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[data-testid]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export class DOMScanner {
  private readonly opts: Required<DOMScannerOptions>;

  constructor(options?: DOMScannerOptions) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }

  async scan(page: Page): Promise<DOMScanResult> {
    const url = page.url();
    const title = await page.title();

    const elements = await page.evaluate(
      (args: { selector: string; minSize: number; includeHidden: boolean; scanShadowDOM: boolean; maxElements: number }) => {
        const { selector, minSize, includeHidden, scanShadowDOM, maxElements } = args;

        type RawEl = {
          tag: string;
          testId?: string;
          id?: string;
          name?: string;
          type?: string;
          ariaLabel?: string;
          ariaRole?: string;
          placeholder?: string;
          text?: string;
          href?: string;
          formAction?: string;
          value?: string;
          bounds: { x: number; y: number; width: number; height: number };
          region: string;
          parentFormName?: string;
          isInteractive: boolean;
          childCount: number;
        };

        function getRegion(el: Element): string {
          let node: Element | null = el;
          while (node) {
            const tag = node.tagName?.toLowerCase();
            const role = node.getAttribute?.('role');

            if (tag === 'nav' || role === 'navigation') return 'nav';
            if (tag === 'header' || role === 'banner') return 'header';
            if (tag === 'main' || role === 'main') return 'main';
            if (tag === 'footer' || role === 'contentinfo') return 'footer';
            if (tag === 'form') return 'form';
            if (tag === 'aside' || role === 'complementary') return 'sidebar';
            if (role === 'dialog' || role === 'alertdialog' || tag === 'dialog') return 'modal';
            if (tag === 'section' || role === 'region') return 'section';

            node = node.parentElement;
          }
          return 'unknown';
        }

        function getParentFormName(el: Element): string | undefined {
          const form = el.closest('form');
          if (!form) return undefined;
          return form.getAttribute('name')
            || form.getAttribute('id')
            || form.getAttribute('aria-label')
            || undefined;
        }

        function extractText(node: HTMLElement): string {
          if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
            return node.placeholder || node.value || '';
          }
          if (node instanceof HTMLSelectElement) {
            const selected = node.options[node.selectedIndex];
            return selected?.text || node.value || '';
          }
          const text = (node.innerText || node.textContent || '').trim();
          return text.slice(0, 150);
        }

        function isVisible(el: HTMLElement, rect: DOMRect): boolean {
          if (rect.width < minSize || rect.height < minSize) return false;
          if (includeHidden) return true;
          const st = window.getComputedStyle(el);
          return st.visibility !== 'hidden'
            && st.display !== 'none'
            && st.opacity !== '0'
            && st.clipPath !== 'inset(100%)';
        }

        function processNode(node: HTMLElement): RawEl | null {
          const rect = node.getBoundingClientRect();
          if (!isVisible(node, rect)) return null;

          const tag = node.tagName.toLowerCase();
          const text = extractText(node);
          const role = node.getAttribute('role') || undefined;
          const interactiveTags = new Set([
            'a', 'button', 'input', 'select', 'textarea',
          ]);
          const interactiveRoles = new Set([
            'button', 'link', 'tab', 'menuitem', 'option',
            'switch', 'checkbox', 'radio', 'combobox', 'listbox',
            'slider', 'spinbutton', 'searchbox',
          ]);
          const isInteractive = interactiveTags.has(tag)
            || (role != null && interactiveRoles.has(role))
            || node.hasAttribute('data-testid')
            || node.getAttribute('contenteditable') === 'true'
            || (node.hasAttribute('tabindex') && node.getAttribute('tabindex') !== '-1');

          return {
            tag,
            testId: node.getAttribute('data-testid') || undefined,
            id: node.getAttribute('id') || undefined,
            name: node.getAttribute('name') || undefined,
            type: node.getAttribute('type') || undefined,
            ariaLabel: node.getAttribute('aria-label') || undefined,
            ariaRole: role,
            placeholder: node.getAttribute('placeholder') || undefined,
            text: text || undefined,
            href: node instanceof HTMLAnchorElement ? (node.getAttribute('href') || undefined) : undefined,
            formAction: node instanceof HTMLFormElement ? (node.getAttribute('action') || undefined) : undefined,
            value: (node instanceof HTMLInputElement || node instanceof HTMLSelectElement)
              ? (node.value || undefined)
              : undefined,
            bounds: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            region: getRegion(node),
            parentFormName: getParentFormName(node),
            isInteractive,
            childCount: node.children.length,
          };
        }

        function collectFromRoot(root: Document | ShadowRoot): HTMLElement[] {
          const nodes = Array.from(root.querySelectorAll(selector)) as HTMLElement[];
          if (!scanShadowDOM) return nodes;

          const allElements = Array.from(root.querySelectorAll('*'));
          for (const el of allElements) {
            if (el.shadowRoot) {
              nodes.push(...collectFromRoot(el.shadowRoot));
            }
          }
          return nodes;
        }

        const rawNodes = collectFromRoot(document);
        const seen = new Set<string>();
        const results: RawEl[] = [];

        for (const node of rawNodes) {
          if (results.length >= maxElements) break;

          const el = processNode(node);
          if (!el) continue;

          const fingerprint = `${el.tag}|${el.testId || ''}|${el.id || ''}|${el.name || ''}|${el.ariaLabel || ''}|${el.text?.slice(0, 40) || ''}|${el.bounds.x},${el.bounds.y}`;
          if (seen.has(fingerprint)) continue;
          seen.add(fingerprint);

          let isDuplicate = false;
          if (!el.testId && !el.id && !el.name && !el.ariaLabel) {
            const parentNode = node.parentElement;
            if (parentNode) {
              const parentTag = parentNode.tagName.toLowerCase();
              if (
                (parentTag === 'button' || parentTag === 'a' || parentNode.getAttribute('role') === 'button')
                && (el.tag === 'span' || el.tag === 'svg' || el.tag === 'img' || el.tag === 'i')
              ) {
                isDuplicate = true;
              }
            }
          }

          if (!isDuplicate) {
            results.push(el);
          }
        }

        return results;
      },
      {
        selector: INTERACTIVE_SELECTOR,
        minSize: this.opts.minSize,
        includeHidden: this.opts.includeHidden,
        scanShadowDOM: this.opts.scanShadowDOM,
        maxElements: this.opts.maxElements,
      },
    );

    const typedElements: ScannedElement[] = elements.map((el) => ({
      ...el,
      region: el.region as SemanticRegion,
    }));

    const regions = {} as Record<SemanticRegion, number>;
    for (const el of typedElements) {
      regions[el.region] = (regions[el.region] || 0) + 1;
    }

    return {
      url,
      title,
      elements: typedElements,
      regions,
      timestamp: Date.now(),
    };
  }
}
