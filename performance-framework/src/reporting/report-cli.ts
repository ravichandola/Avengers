import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jtl': 'text/plain; charset=utf-8',
  '.jmx': 'application/xml',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

/** Default HTTP port for the local report server (`PERF_REPORT_PORT` overrides). */
export const DEFAULT_REPORT_SERVER_PORT = 50552;

export function resolveReportServerPort(): number {
  const raw = process.env.PERF_REPORT_PORT;
  if (raw == null || raw === '') return DEFAULT_REPORT_SERVER_PORT;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n <= 65535 ? n : DEFAULT_REPORT_SERVER_PORT;
}

function openUrlInBrowser(url: string): void {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
  } else {
    spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  }
}

export function isInteractiveReportSession(): boolean {
  return (
    process.stdout.isTTY === true &&
    process.env.CI !== 'true' &&
    process.env.CI !== '1' &&
    process.env.PERF_NO_REPORT_SERVER !== '1'
  );
}

/** After a passing run: print a stable file URL and how to open it (Playwright-style link, no server). */
export function printPassedReportLink(reportDirAbsolute: string): void {
  const indexPath = join(reportDirAbsolute, 'index.html');
  const dirResolved = resolve(reportDirAbsolute);
  console.log('\n  Performance report directory:');
  console.log(`  ${pathToFileURL(dirResolved.endsWith(sep) ? dirResolved : dirResolved + sep).href}`);

  if (existsSync(indexPath)) {
    const href = pathToFileURL(indexPath).href;
    console.log('\n  HTML report:');
    console.log(`  ${href}`);
    if (process.platform === 'darwin') {
      console.log(`  Open: open ${JSON.stringify(indexPath)}`);
    } else if (process.platform === 'win32') {
      console.log(`  Open: start ${JSON.stringify(href)}`);
    } else {
      console.log(`  Open: xdg-open ${JSON.stringify(indexPath)}`);
    }
    console.log('');
    return;
  }

  const jsonPath = join(reportDirAbsolute, 'report.json');
  if (existsSync(jsonPath)) {
    const href = pathToFileURL(jsonPath).href;
    console.log('\n  (No index.html yet.) JSON summary:');
    console.log(`  ${href}`);
    if (process.platform === 'darwin') {
      console.log(`  Open: open ${JSON.stringify(jsonPath)}`);
    } else if (process.platform === 'win32') {
      console.log(`  Open: start ${JSON.stringify(href)}`);
    } else {
      console.log(`  Open: xdg-open ${JSON.stringify(jsonPath)}`);
    }
    console.log('');
    return;
  }

  console.log(
    '\n  No index.html or report.json in that directory (reporters may not have finished writing).\n',
  );
}

/**
 * Serve the report directory on 127.0.0.1 (default port {@link DEFAULT_REPORT_SERVER_PORT}).
 * Opens the browser and blocks until SIGINT/SIGTERM.
 */
/** True if resolved file path is inside root (root itself is not a downloadable file). */
function isFileInsideRoot(rootAbs: string, candidateAbs: string): boolean {
  const prefix = rootAbs.endsWith(sep) ? rootAbs : rootAbs + sep;
  return candidateAbs === rootAbs || candidateAbs.startsWith(prefix);
}

export function serveReportBlocking(
  reportDirAbsolute: string,
  options?: { port?: number; headline?: string },
): Promise<void> {
  const rootAbs = resolve(reportDirAbsolute);
  const port = options?.port ?? resolveReportServerPort();
  const headline = options?.headline ?? 'Serving HTML report (local)';

  return new Promise((resolvePromise) => {
    const server = http.createServer(async (req, res) => {
      try {
        let pathname = req.url?.split('?')[0] || '/';
        if (pathname === '/' || pathname === '') pathname = '/index.html';

        let decoded: string;
        try {
          decoded = decodeURIComponent(pathname);
        } catch {
          res.writeHead(400).end('Bad request');
          return;
        }

        const rel = decoded.replace(/^[/\\]+/, '').replace(/\\/g, '/');
        const segments = rel.split('/').filter(Boolean);
        if (segments.length === 0 || segments.some((s) => s === '..')) {
          res.writeHead(403).end('Forbidden');
          return;
        }

        const filePath = resolve(rootAbs, rel);
        if (!isFileInsideRoot(rootAbs, filePath)) {
          res.writeHead(403).end('Forbidden');
          return;
        }

        const data = await readFile(filePath);
        const ext = extname(filePath).toLowerCase();
        const type = MIME[ext] ?? 'application/octet-stream';
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'no-store');
        res.writeHead(200).end(data);
      } catch {
        res.writeHead(404).end('Not found');
      }
    });

    const shutdown = (): void => {
      server.close(() => resolvePromise());
    };

    server.once('error', (err: NodeJS.ErrnoException) => {
      console.error(`\n  Report server error (${port}): ${err.message}`);
      if (err.code === 'EADDRINUSE') {
        console.error(
          `  Port ${port} is in use — stop the other process or set PERF_REPORT_PORT to another port.\n`,
        );
      }
      resolvePromise();
    });

    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${port}/`;
      console.log(`\n  ${headline}:`);
      console.log(`  ${url}`);
      console.log('  Press Ctrl+C to stop the server.\n');
      openUrlInBrowser(url);
    });

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

/** Same as {@link serveReportBlocking} with the “run failed” headline. */
export function serveFailedReportBlocking(reportDirAbsolute: string): Promise<void> {
  return serveReportBlocking(reportDirAbsolute, {
    headline: 'Run failed — serving HTML report (local)',
  });
}

/**
 * Interactive: HTTP report on 127.0.0.1 (default port 50552, override with PERF_REPORT_PORT), opens browser, blocks until Ctrl+C.
 * CI / non-TTY: print file:// paths only (no server, no hang).
 */
export async function handlePerformanceReportCli(
  reportDirAbsolute: string,
  passed: boolean,
  options?: { forceNonInteractive?: boolean },
): Promise<void> {
  const interactive = isInteractiveReportSession() && !options?.forceNonInteractive;

  if (interactive) {
    await serveReportBlocking(reportDirAbsolute, {
      headline: passed
        ? 'Run passed — serving HTML report (local)'
        : 'Run failed — serving HTML report (local)',
    });
    return;
  }

  if (!passed) {
    console.log('\n  Run failed. Report directory:');
    console.log(`  ${reportDirAbsolute}`);
  }
  printPassedReportLink(reportDirAbsolute);
  if (!passed) {
    console.log('  (CI / non-TTY: local report server skipped — open file URL or collect artifacts.)\n');
  }
}
