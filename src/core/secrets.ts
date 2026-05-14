import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const KEY_PATH = path.join(process.env.APPDATA ?? '.', 'desktop-agent', 'openai.enc');

function runEncodedPs(script: string): Buffer {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return execSync(
    `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
    { maxBuffer: 1024 * 1024 },
  );
}

/**
 * Persist the API key with DPAPI (Windows CurrentUser). On other platforms this is a no-op
 * and callers should use environment variables.
 */
export function saveApiKey(plaintext: string): void {
  if (process.platform !== 'win32') {
    throw new Error('saveApiKey is only supported on Windows');
  }
  const dir = path.dirname(KEY_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const keyEsc = KEY_PATH.replace(/'/g, "''");
  const b64 = Buffer.from(plaintext, 'utf8').toString('base64');
  const script = `
$ErrorActionPreference = 'Stop'
$bytes = [System.Convert]::FromBase64String('${b64.replace(/'/g, "''")}')
$enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
[System.IO.File]::WriteAllBytes('${keyEsc}', $enc)
`.trim();
  runEncodedPs(script);
}

export function loadApiKey(): string {
  if (process.platform === 'win32' && fs.existsSync(KEY_PATH)) {
    const keyEsc = KEY_PATH.replace(/'/g, "''");
    const script = `
$ErrorActionPreference = 'Stop'
$enc = [System.IO.File]::ReadAllBytes('${keyEsc}')
$bytes = [System.Security.Cryptography.ProtectedData]::Unprotect($enc, $null, 'CurrentUser')
[Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($bytes))
`.trim();
    return runEncodedPs(script).toString('utf8').trim();
  }
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }
  throw new Error(
    'No API key found. On Windows run saveApiKey() once to store it, or set OPENAI_API_KEY.',
  );
}

export function hasStoredOrEnvApiKey(): boolean {
  if (process.env.OPENAI_API_KEY) return true;
  if (process.platform === 'win32' && fs.existsSync(KEY_PATH)) return true;
  return false;
}
