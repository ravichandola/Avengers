import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src/reporting/html-report');
const dstDir = join(root, 'dist/reporting/html-report');
mkdirSync(dstDir, { recursive: true });
for (const f of ['report.css', 'report.js']) {
  cpSync(join(srcDir, f), join(dstDir, f));
}
