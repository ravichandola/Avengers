import type { Locator } from 'playwright';

import type {
  CheckUncheckNoArguments,
  CheckUncheckWithArguments,
  ClickNoArguments,
  ClickWithArguments,
  FillNoArguments,
  FillWithArguments,
  SetCheckedNoArguments,
  SetCheckedWithArguments,
  SubmitNoArguments,
  SubmitWithArguments,
} from './enhanced-actions';
import type { VerifyNoArguments, VerifyWithArguments } from './enhanced-verification';

export type Override<T, TOverride> = Omit<T, keyof TOverride> & TOverride;

/**
 * Type-level helpers for `verify*` / `click*` / `fill*` methods derived from `_underscore` locators.
 * Wrap instances at runtime with your own proxy if you need those methods — this file is typings-only.
 */
export type EnhancedPageObject<T extends object> = Override<
  {
    [K in keyof T as K extends `_${infer Rest}` ? `verify${Capitalize<Rest>}` : never]: T[K] extends Locator
      ? VerifyNoArguments
      : T[K] extends (...args: infer TArgs) => Locator
        ? VerifyWithArguments<TArgs>
        : never;
  } & {
    [K in keyof T as K extends `_${infer Rest}Button` ? `click${Capitalize<Rest>}` : never]: T[K] extends Locator
      ? ClickNoArguments
      : T[K] extends (...args: infer TArgs) => Locator
        ? ClickWithArguments<TArgs>
        : never;
  } & {
    [K in keyof T as K extends `_${infer Rest}Link` ? `open${Capitalize<Rest>}` : never]: T[K] extends Locator
      ? ClickNoArguments
      : T[K] extends (...args: infer TArgs) => Locator
        ? ClickWithArguments<TArgs>
        : never;
  } & {
    [K in keyof T as K extends `_${infer Rest}Checkbox` ? `check${Capitalize<Rest>}` : never]: T[K] extends Locator
      ? CheckUncheckNoArguments
      : T[K] extends (...args: infer TArgs) => Locator
        ? CheckUncheckWithArguments<TArgs>
        : never;
  } & {
    [K in keyof T as K extends `_${infer Rest}Checkbox` ? `setChecked${Capitalize<Rest>}` : never]: T[K] extends Locator
      ? SetCheckedNoArguments
      : T[K] extends (...args: infer TArgs) => Locator
        ? SetCheckedWithArguments<TArgs>
        : never;
  } & {
    [K in keyof T as K extends `_${infer Rest}Checkbox` ? `uncheck${Capitalize<Rest>}` : never]: T[K] extends Locator
      ? CheckUncheckNoArguments
      : T[K] extends (...args: infer TArgs) => Locator
        ? CheckUncheckWithArguments<TArgs>
        : never;
  } & {
    [K in keyof T as K extends `_${infer Rest}Input` ? `fill${Capitalize<Rest>}` : never]: T[K] extends Locator
      ? FillNoArguments
      : T[K] extends (...args: infer TArgs) => Locator
        ? FillWithArguments<TArgs>
        : never;
  } & {
    [K in keyof T as K extends `_${infer Rest}Input` ? `submit${Capitalize<Rest>}` : never]: T[K] extends Locator
      ? SubmitNoArguments
      : T[K] extends (...args: infer TArgs) => Locator
        ? SubmitWithArguments<TArgs>
        : never;
  } & {
    [K in keyof T as K extends `_${infer Rest}Radio` ? `choose${Capitalize<Rest>}` : never]: T[K] extends Locator
      ? CheckUncheckNoArguments
      : T[K] extends (...args: infer TArgs) => Locator
        ? CheckUncheckWithArguments<TArgs>
        : never;
  },
  T
>;
