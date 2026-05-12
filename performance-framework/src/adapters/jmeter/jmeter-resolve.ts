import { existsSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

function jmeterBinFile(): string {
  return process.platform === 'win32' ? 'jmeter.bat' : 'jmeter';
}

/** Typical Homebrew layouts (no shelling out to `brew`). */
function standardInstallCandidates(): string[] {
  if (process.platform === 'win32') {
    return ['C:/apache-jmeter-5.6.3', 'C:/jmeter'];
  }
  return [
    '/opt/homebrew/opt/jmeter/libexec',
    '/usr/local/opt/jmeter/libexec',
    join(process.env.HOME ?? '', 'apache-jmeter-5.6.3'),
    join(process.env.HOME ?? '', 'tools/apache-jmeter-5.6.3'),
    '/opt/apache-jmeter-5.6.3',
    '/usr/local/apache-jmeter-5.6.3',
  ];
}

function tryWhichJmeter(mergedEnv: NodeJS.ProcessEnv): string | undefined {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('where.exe', ['jmeter'], {
        encoding: 'utf8',
        env: mergedEnv,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .trim()
        .split(/\r?\n/)
        .find((line) => line && !line.includes('INFO:'));
      const first = out?.trim();
      if (first && existsSync(first)) return realpathSync(first);
    } else {
      const out = execFileSync('/bin/sh', ['-c', 'command -v jmeter'], {
        encoding: 'utf8',
        env: mergedEnv,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (out && existsSync(out)) return realpathSync(out);
    }
  } catch {
    /* not on PATH */
  }
  return undefined;
}

function tryHome(home: string): string | undefined {
  const normalized = home.replace(/\/$/, '');
  const bin = join(normalized, 'bin', jmeterBinFile());
  if (existsSync(bin)) return realpathSync(bin);
  return undefined;
}

export const JMETER_INSTALL_HELP = `JMeter was not found. Do one of the following (pick one — persists across runs):
  • Install Apache JMeter and add its bin/ directory to your PATH, or
  • Set JMETER_HOME to the JMeter root folder (the one that contains bin/jmeter), e.g. in ~/.zshrc:
      export JMETER_HOME=/path/to/apache-jmeter-5.6.3
  • Or pass --jmeter-home when using the CLI.
  macOS (Homebrew): brew install jmeter — then re-open your terminal, or set JMETER_HOME to "$(brew --prefix jmeter)/libexec".`;

/**
 * Resolves an executable path for JMeter (non-GUI). Uses, in order:
 * explicit binary, explicit JMETER_HOME, JMETER_HOME / APACHE_JMETER_HOME in env,
 * jmeter on PATH (realpath), then common install locations.
 */
export function resolveJmeterExecutable(
  explicitHome: string | undefined,
  explicitBin: string | undefined,
  env: NodeJS.ProcessEnv,
): string {
  const merged = { ...process.env, ...env };

  if (explicitBin?.trim()) {
    const b = explicitBin.trim();
    if (existsSync(b)) return realpathSync(b);
    throw new Error(`--jmeter-bin path not found: ${b}\n\n${JMETER_INSTALL_HELP}`);
  }

  const homes = [
    explicitHome?.trim(),
    merged.JMETER_HOME,
    merged.APACHE_JMETER_HOME,
  ].filter(Boolean) as string[];

  for (const h of homes) {
    const hit = tryHome(h);
    if (hit) return hit;
  }

  const fromPath = tryWhichJmeter(merged);
  if (fromPath) return fromPath;

  for (const root of standardInstallCandidates()) {
    const hit = tryHome(root);
    if (hit) return hit;
  }

  throw new Error(JMETER_INSTALL_HELP);
}
