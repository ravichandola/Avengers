export { test, expect } from './fixtures';
export type { TestFixtures } from './fixtures';

export {
  runResumableSteps,
  resumeEnabledFromEnv,
  newContextFromStorageFile,
  CheckpointManager as PortableCheckpointManager,
} from './session/copyable';
export { scopedCheckpointTestId } from './session/checkpoint-test-id';
export type {
  ResumableStep,
  RunResumableStepsOptions,
  CheckpointData,
  CheckpointManagerOptions,
  CheckpointLog,
  ResumableLog,
  NewContextFromStorageOptions,
} from './session/copyable';

export { IDriver } from './core/base-driver';
export { DriverFactory } from './core/driver-factory';
export type { FrameworkConfig, BrowserConfig, DesktopConfig, MobileConfig, APIConfig } from './core/config';
export type { Platform, LaunchOptions, WaitOptions, ActionResult, UIElement, APIResponse, RequestOptions } from './core/types';

export { BrowserDriver } from './drivers/browser/browser-driver';
export { PageManager } from './drivers/browser/page-manager';
export { DesktopDriver } from './drivers/desktop/desktop-driver';
export { MobileDriver } from './drivers/mobile/mobile-driver';
export { APIDriver } from './drivers/api/api-driver';

export { VisionProvider, VisionDriverWrapper } from './vision';
export type { VisionConfig, VisionDetection } from './vision';

export { EvalLabel, LlmJudge, EvalRunner } from './eval';
export {
  evalJsonFormat, evalMaxWords, evalPattern, evalDomain, evalNonEmpty,
  composeRuleEvals, runAllRuleEvals, passRate,
} from './eval';
export {
  OpenAIProvider, AnthropicProvider, GeminiProvider,
  resolveProvider, resolveProviderConfig,
} from './eval';
export type {
  LlmProvider, ResolveProviderOpts,
} from './eval';
export type {
  EvalResult, JudgeRequest, JudgeFewShotExample, AlignmentEntry,
  AlignmentResult, EvalMetrics, BootstrapResult, ConsistencyResult,
} from './eval';
