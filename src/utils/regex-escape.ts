/** Escape a string for safe use inside a `RegExp` constructor. */
export function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
