import http from 'http';

import { disposalContext } from './disposal-context';
import { logger } from './logger';

/**
 * Minimal HTTP server for tests (local HTML fixture, callback URLs, etc.).
 * {@link Server.start} registers {@link Server.stop} on {@link disposalContext}.
 */
export class Server {
  server: http.Server;
  stopped = false;

  requestHandler = (request: http.IncomingMessage, response: http.ServerResponse): void => {
    logger.debug('Server', `Request received ${request.url ?? ''}`);
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<body>Hi, there!</body>');
  };

  constructor(requestHandler?: (request: http.IncomingMessage, response: http.ServerResponse) => void) {
    if (requestHandler) this.requestHandler = requestHandler;
    this.server = http.createServer(this.requestHandler);
  }

  start = (port = 3000): void => {
    disposalContext.add(() => this.stop());
    this.server.listen(port, () => {
      logger.debug('Server', `Running at http://localhost:${port}/`);
    });
  };

  stop = async (): Promise<void> => {
    if (this.stopped) return;
    this.stopped = true;
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
    logger.debug('Server', 'Stopped');
  };
}

/**
 * Spin up a {@link Server} with optional port and response body.
 */
export function startNewServer(options?: { port?: number; body?: string }): Server {
  const server = new Server((req, res) => {
    logger.debug('Server', `Request received ${req.url ?? ''}`);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(options?.body ?? '<body>Hi, there!</body>');
  });
  server.start(options?.port);
  return server;
}
