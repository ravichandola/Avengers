import { access, constants, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReportViewModel } from './report-model.js';
import { getHtmlReportAssetsDir } from './paths.js';
import { ReportPage } from './ReportPage.js';

/** Writes `index.html`, `report.css`, and `report.js` next to each other under `outputDir`. */
export async function writeHtmlReportBundle(outputDir: string, model: ReportViewModel): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const assetsDir = getHtmlReportAssetsDir();
  const cssPath = join(assetsDir, 'report.css');
  const jsPath = join(assetsDir, 'report.js');
  try {
    await access(cssPath, constants.R_OK);
    await access(jsPath, constants.R_OK);
  } catch {
    throw new Error(
      'HTML report assets missing (report.css / report.js). Run `npm run build:report-client` in performance-framework, or `npm install` (prepare hook) so report.js exists next to report.css.',
    );
  }
  await copyFile(cssPath, join(outputDir, 'report.css'));
  await copyFile(jsPath, join(outputDir, 'report.js'));
  const markup = renderToStaticMarkup(createElement(ReportPage, model));
  const html = `<!DOCTYPE html>\n${markup}\n`;
  await writeFile(join(outputDir, 'index.html'), html, 'utf8');
}
