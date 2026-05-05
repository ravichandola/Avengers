/**
 * Maps shorthand test ids / labels to a Playwright locator string (comma-separated fallbacks).
 */
export function resolveSelector(selector: string): string {
  if (selector.startsWith('//') || selector.startsWith('xpath=')) return selector;
  if (selector.startsWith('#') || selector.startsWith('.') || selector.startsWith('[')) return selector;
  if (selector.includes('>>') || selector.includes(':')) return selector;

  return [
    `[data-testid="${selector}"]`,
    `#${selector}`,
    `[name="${selector}"]`,
    `[aria-label="${selector}"]`,
    `text="${selector}"`,
  ].join(', ');
}
