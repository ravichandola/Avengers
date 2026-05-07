import type { Page } from 'playwright';
import type { IDriver } from '../core/base-driver';
import { tryUnwrapBrowserDriver } from '../core/unwrap-browser-driver';
import type { CheckpointData } from './checkpoint-manager';
import type { CreateResumableFlowOptions } from './resumable-steps';

/**
 * Browser-only snapshot: what you need to recreate session + URL, plus optional dataset stamp.
 * Step indices live in {@link ResumableBrowserCheckpoint}.
 */
export interface BrowserCheckpoint {
  storageStatePath: string;
  lastUrl: string;
  resumeKey?: string;
  createdAt: number;
}

/** {@link BrowserCheckpoint} plus fields persisted for step skipping / mid-step resume. */
export interface ResumableBrowserCheckpoint extends BrowserCheckpoint {
  step: number;
  subCheckpoint?: string;
}

export function checkpointDataToResumableBrowser(cp: CheckpointData): ResumableBrowserCheckpoint {
  return {
    storageStatePath: cp.statePath,
    lastUrl: cp.url,
    resumeKey: cp.resumeKey,
    createdAt: cp.timestamp,
    step: cp.step,
    subCheckpoint: cp.subCheckpoint,
  };
}

export function resumableBrowserToCheckpointData(cp: ResumableBrowserCheckpoint): CheckpointData {
  return {
    step: cp.step,
    subCheckpoint: cp.subCheckpoint,
    url: cp.lastUrl,
    statePath: cp.storageStatePath,
    timestamp: cp.createdAt,
    resumeKey: cp.resumeKey,
  };
}

/**
 * Playwright-native resume hooks (`Page` instead of `IDriver`).
 *
 * - **`validateResume`** — return `false` to force a full replay; **thrown** errors propagate (treat as test / hook failure).
 * - **`uiResumeValidator`** — optional second check; **throws** (e.g. locator timeout) are treated like `false` (invalid resume).
 * - If both are set, both must succeed (**AND**).
 */
export interface ResumeOptions {
  resumeKey?: string;
  validateResume?: (args: { page: Page }) => boolean | Promise<boolean>;
  uiResumeValidator?: (args: { page: Page }) => boolean | Promise<boolean>;
  onResumeInvalidated?: (args: { page: Page }) => void | Promise<void>;
}

function requirePage(driver: IDriver): Page {
  const bd = tryUnwrapBrowserDriver(driver);
  if (!bd) {
    throw new Error('ResumeOptions requires a BrowserDriver (unwrap failed or not browser)');
  }
  return bd.pages.current();
}

/**
 * Maps {@link ResumeOptions} into {@link CreateResumableFlowOptions} fields for `createResumableFlow` / `runSteps`.
 */
export function resumeOptionsForDriver(
  driver: IDriver,
  opts: ResumeOptions,
): Pick<CreateResumableFlowOptions, 'resumeKey' | 'validateResume' | 'onResumeInvalidated'> {
  const { resumeKey, validateResume, uiResumeValidator, onResumeInvalidated } = opts;

  let merged: CreateResumableFlowOptions['validateResume'];
  if (validateResume || uiResumeValidator) {
    merged = async (d, _cp) => {
      const page = requirePage(d);
      if (validateResume) {
        const ok = await validateResume({ page });
        if (!ok) return false;
      }
      if (uiResumeValidator) {
        try {
          return await uiResumeValidator({ page });
        } catch {
          return false;
        }
      }
      return true;
    };
  }

  return {
    resumeKey,
    validateResume: merged,
    onResumeInvalidated: onResumeInvalidated
      ? async (d) => {
          await onResumeInvalidated({ page: requirePage(d) });
        }
      : undefined,
  };
}
