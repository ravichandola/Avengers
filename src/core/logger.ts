import { createLogger, transports, format } from 'winston';
import path from 'path';
import fs from 'fs';

const logDir =
  process.env.LOG_DIR ?? path.join(process.env.APPDATA ?? process.env.HOME ?? '.', 'desktop-agent', 'logs');

try {
  fs.mkdirSync(logDir, { recursive: true });
} catch {
  /* best-effort */
}

export const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
  ),
  transports: [
    new transports.File({
      filename: path.join(logDir, 'automation.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    }),
  ],
});
