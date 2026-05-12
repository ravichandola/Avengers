import type { Locator } from 'playwright';

export type LocatorActionNoArguments<TExtraParams extends unknown[]> = (
  ...extraParams: TExtraParams
) => Promise<void>;

export type LocatorActionWithArguments<T extends unknown[], TExtraParams extends unknown[]> = (
  ...args: [...T, ...TExtraParams]
) => Promise<void>;

export function createLocatorAction<TExtraParams extends unknown[]>(
  action: (locator: Locator, ...extraParams: TExtraParams) => Promise<void>,
): {
  (target: Locator): LocatorActionNoArguments<TExtraParams>;
  <T extends unknown[]>(target: (...args: T) => Locator): LocatorActionWithArguments<T, TExtraParams>;
} {
  function wrapper(target: Locator): LocatorActionNoArguments<TExtraParams>;
  function wrapper<T extends unknown[]>(
    target: (...args: T) => Locator,
  ): LocatorActionWithArguments<T, TExtraParams>;
  function wrapper<T extends unknown[]>(
    target: Locator | ((...args: T) => Locator),
  ): LocatorActionNoArguments<TExtraParams> | LocatorActionWithArguments<T, TExtraParams> {
    if (typeof target === 'function') {
      return async (...args: [...T, ...TExtraParams]) => {
        const extraParamsLength = action.length - 1;
        const locatorArgs =
          extraParamsLength > 0 ? (args.slice(0, -extraParamsLength) as T) : (args as unknown as T);
        const extraParams =
          extraParamsLength > 0 ? (args.slice(-extraParamsLength) as TExtraParams) : ([] as unknown as TExtraParams);
        const locator = (target as (...a: T) => Locator)(...locatorArgs);
        await action(locator, ...extraParams);
      };
    }
    return async (...extraParams: TExtraParams) => {
      await action(target, ...extraParams);
    };
  }
  return wrapper as typeof wrapper & {
    (target: Locator): LocatorActionNoArguments<TExtraParams>;
    <T extends unknown[]>(target: (...args: T) => Locator): LocatorActionWithArguments<T, TExtraParams>;
  };
}

export type CheckUncheckNoArguments = LocatorActionNoArguments<[]>;
export type CheckUncheckWithArguments<T extends unknown[]> = LocatorActionWithArguments<T, []>;
export type SetCheckedNoArguments = LocatorActionNoArguments<[state: boolean]>;
export type SetCheckedWithArguments<T extends unknown[]> = LocatorActionWithArguments<T, [state: boolean]>;

export const checkLocator = createLocatorAction<[]>(async (locator) => {
  await locator.check();
});

export const uncheckLocator = createLocatorAction<[]>(async (locator) => {
  await locator.uncheck();
});

export const setCheckedLocator = createLocatorAction<[state: boolean]>(async (locator, state) => {
  await locator.setChecked(state);
});

export type ClickNoArguments = LocatorActionNoArguments<[]>;
export type ClickWithArguments<T extends unknown[]> = LocatorActionWithArguments<T, []>;

export const clickLocator = createLocatorAction<[]>(async (locator) => {
  await locator.click();
});

export type FillNoArguments = LocatorActionNoArguments<[value: string]>;
export type FillWithArguments<T extends unknown[]> = LocatorActionWithArguments<T, [value: string]>;

export type SubmitNoArguments = LocatorActionNoArguments<[value?: string]>;
export type SubmitWithArguments<T extends unknown[]> = LocatorActionWithArguments<T, [value?: string]>;

export const fillLocator = createLocatorAction<[value: string]>(async (locator, value) => {
  await locator.fill(value);
});

export const submitLocator = createLocatorAction<[value?: string]>(async (locator, value) => {
  if (value) await locator.fill(value);
  await locator.press('Enter');
});
