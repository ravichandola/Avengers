/** OpenTelemetry hooks — bind to your org’s SDK in infrastructure layer */
export interface TelemetrySink {
  recordMetric(name: string, attributes: Record<string, string | number | boolean>): void;
  recordSpan(name: string, fn: () => Promise<void>): Promise<void>;
}

export class NoopTelemetry implements TelemetrySink {
  recordMetric(_name: string, _attributes: Record<string, string | number | boolean>): void {}

  async recordSpan(_name: string, fn: () => Promise<void>): Promise<void> {
    await fn();
  }
}
