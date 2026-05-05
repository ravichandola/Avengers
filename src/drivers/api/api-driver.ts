import { IDriver } from '../../core/base-driver';
import { FrameworkConfig, APIConfig } from '../../core/config';
import { LaunchOptions, WaitOptions, UIElement, APIResponse, RequestOptions } from '../../core/types';
import { logger } from '../../utils/logger';

export class APIDriver implements IDriver {
  readonly platform = 'api';
  private config: FrameworkConfig;
  private baseURL: string = '';
  private defaultHeaders: Record<string, string> = {};
  private timeout: number = 30000;

  constructor(config: FrameworkConfig) {
    this.config = config;
    if (config.api) {
      this.baseURL = config.api.baseURL;
      this.defaultHeaders = config.api.headers ?? {};
      this.timeout = config.api.timeout ?? 30000;
      this.applyAuth(config.api.auth);
    }
  }

  async launch(target: LaunchOptions): Promise<void> {
    if (target.url) {
      this.baseURL = target.url;
    }
    logger.info('APIDriver', `Base URL: ${this.baseURL}`);
  }

  async close(): Promise<void> {
    logger.info('APIDriver', 'Closed');
  }

  async get(path: string, opts?: RequestOptions): Promise<APIResponse> {
    return this.request('GET', path, undefined, opts);
  }

  async post(path: string, body?: any, opts?: RequestOptions): Promise<APIResponse> {
    return this.request('POST', path, body, opts);
  }

  async put(path: string, body?: any, opts?: RequestOptions): Promise<APIResponse> {
    return this.request('PUT', path, body, opts);
  }

  async patch(path: string, body?: any, opts?: RequestOptions): Promise<APIResponse> {
    return this.request('PATCH', path, body, opts);
  }

  async delete(path: string, opts?: RequestOptions): Promise<APIResponse> {
    return this.request('DELETE', path, undefined, opts);
  }

  async graphql(query: string, variables?: Record<string, any>, opts?: RequestOptions): Promise<APIResponse> {
    return this.request('POST', '/graphql', { query, variables }, opts);
  }

  private async request(
    method: string,
    path: string,
    body?: any,
    opts?: RequestOptions
  ): Promise<APIResponse> {
    const url = this.buildURL(path, opts?.params);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...opts?.headers,
    };

    const start = Date.now();
    logger.info('APIDriver', `${method} ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts?.timeout ?? this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const duration = Date.now() - start;
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => { responseHeaders[k] = v; });

      let responseBody: any;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      const result: APIResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        duration,
      };

      logger.info('APIDriver', `${method} ${url} → ${response.status} (${duration}ms)`);
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildURL(path: string, params?: Record<string, string>): string {
    const base = path.startsWith('http') ? path : `${this.baseURL}${path}`;
    if (!params) return base;

    const url = new URL(base);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
  }

  private applyAuth(auth?: APIConfig['auth']): void {
    if (!auth) return;
    switch (auth.type) {
      case 'bearer':
        this.defaultHeaders['Authorization'] = `Bearer ${auth.token}`;
        break;
      case 'basic':
        const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
        this.defaultHeaders['Authorization'] = `Basic ${encoded}`;
        break;
      case 'apikey':
        this.defaultHeaders[auth.headerName ?? 'X-API-Key'] = auth.key ?? '';
        break;
    }
  }

  // IDriver interface methods (not applicable for API but required by interface)
  async click(): Promise<void> { throw new Error('click() not applicable for API testing'); }
  async fill(): Promise<void> { throw new Error('fill() not applicable for API testing'); }
  async getText(): Promise<string> { throw new Error('getText() not applicable for API testing'); }
  async waitFor(): Promise<void> { throw new Error('waitFor() not applicable for API testing'); }
  async hover(): Promise<void> { throw new Error('hover() not applicable for API testing'); }
  async check(): Promise<void> { throw new Error('check() not applicable for API testing'); }
  async uncheck(): Promise<void> { throw new Error('uncheck() not applicable for API testing'); }
  async select(): Promise<void> { throw new Error('select() not applicable for API testing'); }
  async keyPress(): Promise<void> { throw new Error('keyPress() not applicable for API testing'); }
  async scroll(): Promise<void> { throw new Error('scroll() not applicable for API testing'); }
  async navigate(url: string): Promise<void> { this.baseURL = url; }
  async screenshot(): Promise<Buffer> { return Buffer.alloc(0); }
  async getTitle(): Promise<string> { return 'API'; }
  async getURL(): Promise<string> { return this.baseURL; }
  async isVisible(): Promise<boolean> { return false; }
  async isEnabled(): Promise<boolean> { return false; }
  async getElements(): Promise<UIElement[]> { return []; }
}
