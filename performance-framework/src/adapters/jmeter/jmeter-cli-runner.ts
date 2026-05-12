import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolveJmeterExecutable } from './jmeter-resolve.js';

export interface JMeterLaunchOptions {
  jmeterHome?: string;
  jmxPath: string;
  jtlPath: string;
  jmeterBin?: string;
  env?: NodeJS.ProcessEnv;
}

export async function runJmeterNonGui(opts: JMeterLaunchOptions): Promise<{ exitCode: number; log: string }> {
  const mergedEnv = { ...process.env, ...opts.env };

  let cmd: string;
  try {
    cmd = resolveJmeterExecutable(opts.jmeterHome, opts.jmeterBin, mergedEnv);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { exitCode: 127, log: msg };
  }

  const args = ['-n', '-t', opts.jmxPath, '-l', opts.jtlPath];
  const child = spawn(cmd, args, {
    env: mergedEnv,
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
