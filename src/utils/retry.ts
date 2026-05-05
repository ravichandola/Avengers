import { RetryConfig } from '../core/config';
import { logger } from './logger';

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  label: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < config.maxRetries) {
        const delay = config.backoff === 'exponential'
          ? config.delayMs * Math.pow(2, attempt)
          : config.delayMs * (attempt + 1);

        logger.warn('Retry', `${label} failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error(`${label} failed after ${config.maxRetries + 1} attempts`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
