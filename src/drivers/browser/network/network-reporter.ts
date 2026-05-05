import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';

interface NetworkAttachment {
  name: string;
  contentType: string;
  body?: Buffer;
  path?: string;
}

interface DomainStats {
  domain: string;
  count: number;
  failed: number;
  avgDuration: number;
}

/**
 * Playwright reporter that renders network data attached by the NetworkMonitor
 * fixture into a human-readable summary in the test output.
 *
 * Register in playwright.config.ts:
 *   reporter: [['./src/drivers/browser/network/network-reporter.ts'], ...]
 */
export default class NetworkReporter implements Reporter {
  private totalTests = 0;
  private testsWithNetwork = 0;

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.totalTests = 0;
    this.testsWithNetwork = 0;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.totalTests++;

    const networkAttachment = result.attachments.find(
      (a: NetworkAttachment) => a.name === 'network-log' && a.contentType === 'application/json',
    );
    if (!networkAttachment?.body) return;

    this.testsWithNetwork++;

    try {
      const summary = JSON.parse(networkAttachment.body.toString('utf8'));
      this.printTestNetworkSummary(test, result, summary);
    } catch {
      // malformed attachment — skip silently
    }
  }

  onEnd(_result: FullResult): void {
    if (this.testsWithNetwork > 0) {
      console.log('');
      console.log(`  Network Monitor: ${this.testsWithNetwork}/${this.totalTests} tests had network data attached`);
      console.log('');
    }
  }

  private printTestNetworkSummary(
    test: TestCase,
    result: TestResult,
    summary: {
      totalRequests: number;
      failedRequests: number;
      byMethod: Record<string, number>;
      byStatus: Record<string, number>;
      byResourceType: Record<string, number>;
      totalDuration: number;
      slowestCalls: Array<{
        request: { url: string; method: string; resourceType: string };
        response: { status: number; timing: { duration: number } } | null;
        failure: string | null;
      }>;
      entries: Array<{
        request: { url: string; method: string; resourceType: string };
        response: { status: number; timing: { duration: number } } | null;
        failure: string | null;
      }>;
    },
  ): void {
    const statusIcon = result.status === 'passed' ? 'PASS' : 'FAIL';
    const divider = '─'.repeat(80);

    console.log('');
    console.log(`  ${divider}`);
    console.log(`  NETWORK [${statusIcon}] ${test.title}`);
    console.log(`  ${divider}`);
    console.log(`  Total: ${summary.totalRequests} | Failed: ${summary.failedRequests} | Duration: ${summary.totalDuration}ms`);

    const methodParts = Object.entries(summary.byMethod)
      .map(([m, c]) => `${m}: ${c}`)
      .join(', ');
    if (methodParts) {
      console.log(`  By Method: ${methodParts}`);
    }

    const statusParts = Object.entries(summary.byStatus)
      .map(([s, c]) => `${s}: ${c}`)
      .join(', ');
    if (statusParts) {
      console.log(`  By Status: ${statusParts}`);
    }

    const domains = this.aggregateByDomain(summary.entries);
    if (domains.length > 0) {
      console.log('  By Domain:');
      for (const d of domains.slice(0, 8)) {
        const failStr = d.failed > 0 ? ` (${d.failed} failed)` : '';
        console.log(`    ${d.domain}: ${d.count} calls, avg ${d.avgDuration}ms${failStr}`);
      }
    }

    if (summary.failedRequests > 0) {
      const failures = summary.entries.filter(
        (e) => e.failure || (e.response && e.response.status >= 400),
      );
      console.log('  Failed Requests:');
      for (const f of failures.slice(0, 10)) {
        const reason = f.failure || `HTTP ${f.response!.status}`;
        const url = f.request.url.length > 70 ? f.request.url.slice(0, 67) + '...' : f.request.url;
        console.log(`    ${f.request.method} ${url} -> ${reason}`);
      }
    }

    if (summary.slowestCalls.length > 0) {
      console.log('  Slowest:');
      for (const s of summary.slowestCalls.slice(0, 3)) {
        if (!s.response) continue;
        const url = s.request.url.length > 65 ? s.request.url.slice(0, 62) + '...' : s.request.url;
        console.log(`    ${s.response.timing.duration}ms ${s.request.method} ${url}`);
      }
    }

    console.log(`  ${divider}`);
  }

  private aggregateByDomain(
    entries: Array<{
      request: { url: string; method: string };
      response: { status: number; timing: { duration: number } } | null;
      failure: string | null;
    }>,
  ): DomainStats[] {
    const map = new Map<string, { count: number; failed: number; totalDuration: number }>();

    for (const entry of entries) {
      let domain: string;
      try {
        domain = new URL(entry.request.url).hostname;
      } catch {
        domain = 'unknown';
      }

      const stats = map.get(domain) || { count: 0, failed: 0, totalDuration: 0 };
      stats.count++;
      if (entry.failure || (entry.response && entry.response.status >= 400)) {
        stats.failed++;
      }
      if (entry.response?.timing.duration) {
        stats.totalDuration += entry.response.timing.duration;
      }
      map.set(domain, stats);
    }

    return [...map.entries()]
      .map(([domain, stats]) => ({
        domain,
        count: stats.count,
        failed: stats.failed,
        avgDuration: stats.count > 0 ? Math.round(stats.totalDuration / stats.count) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }
}
