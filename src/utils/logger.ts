export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

let currentLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function ts(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(tag: string, msg: string, data?: unknown): void {
    if (currentLevel <= LogLevel.DEBUG) console.debug(`[${ts()}] [DEBUG] [${tag}] ${msg}`, data ?? '');
  },
  info(tag: string, msg: string, data?: unknown): void {
    if (currentLevel <= LogLevel.INFO) console.info(`[${ts()}] [INFO] [${tag}] ${msg}`, data ?? '');
  },
  warn(tag: string, msg: string, data?: unknown): void {
    if (currentLevel <= LogLevel.WARN) console.warn(`[${ts()}] [WARN] [${tag}] ${msg}`, data ?? '');
  },
  error(tag: string, msg: string, data?: unknown): void {
    if (currentLevel <= LogLevel.ERROR) console.error(`[${ts()}] [ERROR] [${tag}] ${msg}`, data ?? '');
  },
};
