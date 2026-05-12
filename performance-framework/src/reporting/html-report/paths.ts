import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Directory containing `report.css` and `report.js` (next to compiled JS in dist, or next to TS in src when using tsx). */
export function getHtmlReportAssetsDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

export function htmlReportAssetPath(name: 'report.css' | 'report.js'): string {
  return join(getHtmlReportAssetsDir(), name);
}
