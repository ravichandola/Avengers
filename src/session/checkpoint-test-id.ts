/**
 * Scope checkpoint files per Playwright worker so parallel runs (or shared `.checkpoints/` dirs)
 * do not overwrite each other's state. Use with `testInfo.testId` (stable per test definition).
 */
export function scopedCheckpointTestId(testId: string): string {
  const w = process.env.TEST_WORKER_INDEX ?? '0';
  return `${testId}-w${w}`;
}
