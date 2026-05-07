import {
  CheckpointManager as CheckpointManagerBase,
  type CheckpointData,
  type CheckpointManagerOptions,
} from './copyable/checkpoint-manager';
import { logger } from '../utils/logger';

export type { CheckpointData };

type FrameworkOptions = Omit<CheckpointManagerOptions, 'log'>;

/**
 * CheckpointManager with framework logging. For a portable implementation,
 * import from `../session/copyable/checkpoint-manager` instead.
 */
export class CheckpointManager extends CheckpointManagerBase {
  constructor(testId: string, options?: FrameworkOptions) {
    super(testId, {
      ...options,
      log: (level, msg) => {
        if (level === 'debug') logger.debug('Checkpoint', msg);
        else logger.warn('Checkpoint', msg);
      },
    });
  }
}
