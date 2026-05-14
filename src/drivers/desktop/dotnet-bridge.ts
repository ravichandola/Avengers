import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

export interface BridgeRequest {
  method: string;
  args: Record<string, unknown>;
}

export interface BridgeResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
  method?: string;
}

function resolveSidecarExe(): string {
  const base = path.resolve(
    __dirname,
    '../../../sidecar/OfficeInterop/bin/Release/net8.0-windows',
  );
  const publishExe = path.join(base, 'publish', 'OfficeInterop.exe');
  const buildExe = path.join(base, 'OfficeInterop.exe');
  if (fs.existsSync(publishExe)) return publishExe;
  return buildExe;
}

/**
 * DotNetBridge — lazy, on-demand sidecar.
 *
 * Rules:
 * - The sidecar is NOT started at import time.
 * - It is started only on the first call() invocation.
 * - If the sidecar binary is absent, call() throws a clear error
 *   (existing UIA/PS automation is unaffected).
 * - Dispose via bridge.dispose() or use `await using`.
 */
export class DotNetBridge {
  private proc: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private ready = false;
  private startError: Error | null = null;
  private readonly queue: Array<{
    resolve: (r: BridgeResponse) => void;
    reject: (e: Error) => void;
  }> = [];

  private readonly sidecarPath = resolveSidecarExe();

  async call(method: string, args: Record<string, unknown> = {}): Promise<unknown> {
    await this.ensureStarted();
    if (this.startError) throw this.startError;
    return new Promise<unknown>((resolve, reject) => {
      this.queue.push({
        resolve: (r) =>
          r.ok ? resolve(r.data) : reject(new Error(r.error ?? 'Sidecar error')),
        reject,
      });
      const line = JSON.stringify({ method, args }) + '\n';
      this.proc!.stdin!.write(line);
    });
  }

  private rejectAllPending(err: Error): void {
    while (this.queue.length) {
      this.queue.shift()?.reject(err);
    }
  }

  private async ensureStarted(): Promise<void> {
    if (this.ready) return;
    if (this.startError) throw this.startError;

    if (this.proc) {
      await new Promise<void>((res, rej) => {
        const poll = setInterval(() => {
          if (this.ready) {
            clearInterval(poll);
            res();
          }
          if (this.startError) {
            clearInterval(poll);
            rej(this.startError);
          }
        }, 50);
        setTimeout(() => {
          clearInterval(poll);
          rej(new Error('Sidecar start timeout'));
        }, 10_000);
      });
      return;
    }

    if (!fs.existsSync(this.sidecarPath)) {
      this.startError = new Error(
        `DotNetBridge: sidecar not found at ${this.sidecarPath}. ` +
          `Run 'npm run sidecar:build' on Windows (.NET 8 SDK required).`,
      );
      throw this.startError;
    }

    this.proc = spawn(this.sidecarPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.proc.on('error', (err) => {
      this.startError = new Error(
        `DotNetBridge: cannot start sidecar at ${this.sidecarPath}. ` +
          `Run 'npm run sidecar:build' first.\nOriginal: ${err.message}`,
      );
      this.rejectAllPending(this.startError);
    });

    this.proc.on('exit', () => {
      if (!this.ready) {
        this.startError = new Error('Sidecar exited before signaling ready');
      }
      const err = new Error('Sidecar process exited unexpectedly');
      this.rejectAllPending(err);
      this.ready = false;
      this.proc = null;
      this.rl = null;
    });

    this.proc.stderr?.on('data', (d: Buffer) => {
      process.stderr.write(`[sidecar stderr] ${d.toString()}`);
    });

    this.rl = readline.createInterface({ input: this.proc.stdout! });
    this.rl.on('line', (line) => {
      let response: BridgeResponse & { ready?: boolean };
      try {
        response = JSON.parse(line) as BridgeResponse & { ready?: boolean };
      } catch {
        return;
      }

      if (!this.ready && response.ready === true) {
        this.ready = true;
        return;
      }

      const pending = this.queue.shift();
      if (pending) pending.resolve(response);
    });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        clearInterval(poll);
        reject(new Error('Sidecar did not signal ready in 10s'));
      }, 10_000);
      const poll = setInterval(() => {
        if (this.ready) {
          clearTimeout(t);
          clearInterval(poll);
          resolve();
        }
        if (this.startError) {
          clearTimeout(t);
          clearInterval(poll);
          reject(this.startError);
        }
      }, 50);
    });
  }

  async dispose(): Promise<void> {
    this.rl?.close();
    this.proc?.stdin?.end();
    this.proc?.kill();
    this.proc = null;
    this.rl = null;
    this.ready = false;
    this.startError = null;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
}

let _instance: DotNetBridge | null = null;
export function getSidecar(): DotNetBridge {
  _instance ??= new DotNetBridge();
  return _instance;
}
