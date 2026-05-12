import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

export interface JMeterLaunchOptions {
  jmeterHome?: string;
  jmxPath: string;
  jtlPath: string;
  jmeterBin?: string;
  env?: NodeJS.ProcessEnv;
}

function resolveJmeterCommand(opts: JMeterLaunchOptions): string {
  if (opts.jmeterBin) return opts.jmeterBin;
  if (opts.jmeterHome) {
    const isWin = process.platform === 'win32';
    return isWin ? `${opts.jmeterHome}/bin/jmeter.bat` : `${opts.jmeterHome}/bin/jmeter`;
  }
  return 'jmeter';
}

export async function runJmeterNonGui(opts: JMeterLaunchOptions): Promise<{ exitCode: number; log: string }> {
  const cmd = resolveJmeterCommand(opts);
  const args = ['-n', '-t', opts.jmxPath, '-l', opts.jtlPath];
  const child = spawn(cmd, args, {
    env: { ...process.env, ...opts.env },
    shell: process.platform === 'win32',
  });
  const chunks: Buffer[] = [];
  child.stdout.on('data', (d) => chunks.push(Buffer.from(d)));
  child.stderr.on('data', (d) => chunks.push(Buffer.from(d)));

  const exitCode: number = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });

  return { exitCode, log: Buffer.concat(chunks).toString('utf8') };
}

export async function readJtlFile(path: string): Promise<string> {
  return readFile(path, 'utf8');
}
