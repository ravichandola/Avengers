export interface RetryOptions {
  attempts?: number;
  delayMs?: number;
  backoff?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const { attempts = 3, delayMs = 500, backoff = 2, onRetry } = opts;
  let lastError: Error;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      onRetry?.(i + 1, lastError);
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(backoff, i)));
      }
    }
  }
  throw lastError!;
}
