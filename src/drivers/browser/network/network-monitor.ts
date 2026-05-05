import { Page, Request, Response } from 'playwright';
import {
  NetworkEntry,
  NetworkSummary,
  NetworkMonitorConfig,
  DEFAULT_NETWORK_CONFIG,
} from './network-types';

let entryCounter = 0;

export class NetworkMonitor {
  private readonly config: NetworkMonitorConfig;
  private entries: Map<string, NetworkEntry> = new Map();
  private page: Page | null = null;
  private active = false;
  private testId = '';

  private readonly boundOnRequest: (req: Request) => void;
  private readonly boundOnResponse: (res: Response) => void;
  private readonly boundOnRequestFailed: (req: Request) => void;
  private readonly boundOnRequestFinished: (req: Request) => void;

  constructor(config?: Partial<NetworkMonitorConfig>) {
    this.config = { ...DEFAULT_NETWORK_CONFIG, ...config };
    this.boundOnRequest = this.onRequest.bind(this);
    this.boundOnResponse = this.onResponse.bind(this);
    this.boundOnRequestFailed = this.onRequestFailed.bind(this);
    this.boundOnRequestFinished = this.onRequestFinished.bind(this);
  }

  start(page: Page, testId?: string): void {
    if (this.active && this.page === page) return;
    this.stop();

    this.page = page;
    this.testId = testId || '';
    this.active = true;

    page.on('request', this.boundOnRequest);
    page.on('response', this.boundOnResponse);
    page.on('requestfailed', this.boundOnRequestFailed);
    page.on('requestfinished', this.boundOnRequestFinished);
  }

  stop(): void {
    if (this.page && this.active) {
      try {
        this.page.off('request', this.boundOnRequest);
        this.page.off('response', this.boundOnResponse);
        this.page.off('requestfailed', this.boundOnRequestFailed);
        this.page.off('requestfinished', this.boundOnRequestFinished);
      } catch {
        // page may already be closed
      }
    }
    this.active = false;
    this.page = null;
  }

  clear(): void {
    this.entries.clear();
  }

  hasEntries(): boolean {
    return this.entries.size > 0;
  }

  getEntries(): ReadonlyArray<NetworkEntry> {
    return Object.freeze([...this.entries.values()]);
  }

  getEntriesByPattern(urlPattern: RegExp): NetworkEntry[] {
    return [...this.entries.values()].filter((e) => urlPattern.test(e.request.url));
  }

  getEntriesByMethod(method: string): NetworkEntry[] {
    const upper = method.toUpperCase();
    return [...this.entries.values()].filter((e) => e.request.method === upper);
  }

  getFailedRequests(): NetworkEntry[] {
    return [...this.entries.values()].filter(
      (e) => e.failure !== null || (e.response !== null && e.response.status >= 400),
    );
  }

  getRequestCount(): number {
    return this.entries.size;
  }

  getSummary(testId: string, testTitle: string, status: string): NetworkSummary {
    const allEntries = [...this.entries.values()];
    const byMethod: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byResourceType: Record<string, number> = {};
    let failedRequests = 0;
    let totalDuration = 0;

    for (const entry of allEntries) {
      const method = entry.request.method;
      byMethod[method] = (byMethod[method] || 0) + 1;

      const resType = entry.request.resourceType;
      byResourceType[resType] = (byResourceType[resType] || 0) + 1;

      if (entry.response) {
        const statusBucket = `${Math.floor(entry.response.status / 100)}xx`;
        byStatus[statusBucket] = (byStatus[statusBucket] || 0) + 1;
        totalDuration += entry.response.timing.duration;
        if (entry.response.status >= 400) failedRequests++;
      }

      if (entry.failure) failedRequests++;
    }

    const slowestCalls = [...allEntries]
      .filter((e) => e.response?.timing.duration != null)
      .sort((a, b) => (b.response!.timing.duration) - (a.response!.timing.duration))
      .slice(0, 5);

    return {
      testId,
      testTitle,
      status,
      totalRequests: allEntries.length,
      failedRequests,
      byMethod,
      byStatus,
      byResourceType,
      totalDuration,
      slowestCalls,
      entries: allEntries,
    };
  }

  toJSON(): string {
    return JSON.stringify([...this.entries.values()], null, 2);
  }

  toHumanReadable(): string {
    const entries = [...this.entries.values()];
    if (entries.length === 0) return 'No network calls captured.';

    const lines: string[] = [];
    const divider = '─'.repeat(120);

    lines.push(divider);
    lines.push(
      padRight('Method', 8) +
      padRight('Status', 8) +
      padRight('Duration', 12) +
      padRight('Type', 14) +
      'URL',
    );
    lines.push(divider);

    for (const entry of entries) {
      const method = entry.request.method;
      const status = entry.response ? String(entry.response.status) : (entry.failure ? 'FAIL' : '...');
      const duration = entry.response
        ? `${entry.response.timing.duration}ms`
        : '-';
      const resType = entry.request.resourceType;
      const url = truncateUrl(entry.request.url, 78);

      lines.push(
        padRight(method, 8) +
        padRight(status, 8) +
        padRight(duration, 12) +
        padRight(resType, 14) +
        url,
      );
    }

    lines.push(divider);

    const failed = entries.filter((e) => e.failure || (e.response && e.response.status >= 400));
    lines.push(`Total: ${entries.length} requests | Failed: ${failed.length}`);

    if (failed.length > 0) {
      lines.push('');
      lines.push('FAILED REQUESTS:');
      for (const f of failed) {
        const reason = f.failure || `HTTP ${f.response!.status}`;
        lines.push(`  ${f.request.method} ${truncateUrl(f.request.url, 90)} → ${reason}`);
      }
    }

    const withDuration = entries.filter((e) => e.response?.timing.duration != null);
    if (withDuration.length > 0) {
      const sorted = [...withDuration].sort(
        (a, b) => b.response!.timing.duration - a.response!.timing.duration,
      );
      const top5 = sorted.slice(0, 5);
      lines.push('');
      lines.push('SLOWEST REQUESTS:');
      for (const s of top5) {
        lines.push(`  ${s.response!.timing.duration}ms ${s.request.method} ${truncateUrl(s.request.url, 80)}`);
      }
    }

    return lines.join('\n');
  }

  private onRequest(request: Request): void {
    if (this.entries.size >= this.config.maxEntries) return;

    if (this.config.urlFilter && !this.config.urlFilter.test(request.url())) {
      return;
    }

    const id = `req_${++entryCounter}_${Date.now()}`;
    const headers = this.redactHeaders(request.headers());
    let postData: string | null = null;
    if (this.config.capturePostData) {
      postData = request.postData() ?? null;
    }

    const entry: NetworkEntry = {
      id,
      testId: this.testId,
      timestamp: Date.now(),
      request: {
        url: sanitizeUrl(request.url()),
        method: request.method(),
        headers,
        postData,
        resourceType: request.resourceType(),
      },
      response: null,
      failure: null,
      isNavigationRequest: request.isNavigationRequest(),
    };

    this.entries.set(this.requestKey(request), entry);
  }

  private onResponse(response: Response): void {
    const entry = this.entries.get(this.requestKey(response.request()));
    if (!entry) return;

    entry.response = {
      status: response.status(),
      statusText: response.statusText(),
      headers: this.redactHeaders(response.headers()),
      timing: {
        startTime: entry.timestamp,
        endTime: Date.now(),
        duration: Date.now() - entry.timestamp,
      },
    };
  }

  private onRequestFailed(request: Request): void {
    const key = this.requestKey(request);
    const entry = this.entries.get(key);
    if (entry) {
      entry.failure = request.failure()?.errorText ?? 'Unknown failure';
    } else if (this.entries.size < this.config.maxEntries) {
      const id = `req_${++entryCounter}_${Date.now()}`;
      this.entries.set(key, {
        id,
        testId: this.testId,
        timestamp: Date.now(),
        request: {
          url: sanitizeUrl(request.url()),
          method: request.method(),
          headers: this.redactHeaders(request.headers()),
          postData: null,
          resourceType: request.resourceType(),
        },
        response: null,
        failure: request.failure()?.errorText ?? 'Unknown failure',
        isNavigationRequest: request.isNavigationRequest(),
      });
    }
  }

  private onRequestFinished(request: Request): void {
    const entry = this.entries.get(this.requestKey(request));
    if (!entry || !entry.response) return;
    entry.response.timing.endTime = Date.now();
    entry.response.timing.duration = entry.response.timing.endTime - entry.response.timing.startTime;
  }

  private requestKey(request: Request): string {
    return `${request.method()}|${request.url()}|${request.resourceType()}`;
  }

  private redactHeaders(headers: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    const redactSet = new Set(this.config.redactHeaders.map((h) => h.toLowerCase()));

    for (const [key, value] of Object.entries(headers)) {
      result[key] = redactSet.has(key.toLowerCase()) ? '[REDACTED]' : value;
    }

    return result;
  }
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const sensitiveParams = ['token', 'api_key', 'apikey', 'access_token', 'auth', 'key', 'secret'];
    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, '[REDACTED]');
      }
    }
    if (parsed.password) {
      parsed.password = '[REDACTED]';
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function truncateUrl(url: string, maxLen: number): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 3) + '...';
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}
