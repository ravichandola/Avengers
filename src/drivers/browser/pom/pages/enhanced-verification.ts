import { expect, type Locator } from '@playwright/test';

import { regexEscape } from '../../../../utils/regex-escape';

export type VerifyNoArguments = (options: VerifyLocatorOptions) => Promise<void>;

export type VerifyWithArguments<T extends unknown[]> = (
  ...args: [...T, options: VerifyLocatorOptions]
) => Promise<void>;

export type VerifyLocatorOptions = {
  visible?: boolean;
  enabled?: boolean;
  useInnerText?: boolean;
  ignoreCase?: boolean;
  haveText?: string | RegExp | Array<string | RegExp>;
  notHaveText?: string | RegExp | Array<string | RegExp>;
  haveValue?: string | RegExp;
  notHaveValue?: string | RegExp;
  containsText?: string | RegExp | Array<string | RegExp>;
  notContainsText?: string | RegExp | Array<string | RegExp>;
  count?: number | ((c: number) => boolean);
  notCount?: number;
  arrayAnyOrder?: Array<string>;
  arrayOfSameText?: string | RegExp;
  checked?: boolean;
  timeout?: number;
};

async function assertCount(locator: Locator, options: VerifyLocatorOptions): Promise<void> {
  if (typeof options.count === 'number') {
    await expect.soft(locator).toHaveCount(options.count, { timeout: options.timeout });
  } else if (typeof options.count === 'function') {
    await expect
      .poll(
        async () => (options.count as (c: number) => boolean)(await locator.count()),
        { timeout: options.timeout ?? 5000, message: 'Expect count to satisfy predicate' },
      )
      .toBe(true);
  }
}

function addVisibilityDefault(options: VerifyLocatorOptions): boolean {
  if (
    options.visible == null &&
    (options.enabled != null ||
      options.haveText != null ||
      options.notHaveText != null ||
      options.containsText != null ||
      options.notContainsText != null ||
      (options.count != null && typeof options.count === 'number' && options.count > 0) ||
      (options.notCount != null && typeof options.notCount === 'number' && options.notCount === 0) ||
      options.arrayAnyOrder != null ||
      options.arrayOfSameText != null ||
      options.checked != null ||
      options.haveValue != null ||
      options.notHaveValue != null)
  ) {
    return true;
  }
  return false;
}

async function getNormalizedTexts(
  locator: Locator,
  options: VerifyLocatorOptions,
): Promise<string[]> {
  const raw = options?.useInnerText ? await locator.allInnerTexts() : await locator.allTextContents();
  return raw.map((c) => (options?.ignoreCase ? c.toLowerCase() : c));
}

function getNormalizedRegexp(regexp: string | RegExp, options: VerifyLocatorOptions): RegExp {
  if (typeof regexp === 'string') {
    return new RegExp(`^${regexEscape(regexp)}$`, options.ignoreCase ? 'i' : '');
  }
  if (!options.ignoreCase) return regexp;
  if (regexp.ignoreCase) return regexp;

  return new RegExp(regexp.source, `${regexp.flags}i`);
}

async function assertOptions(locator: Locator, options: VerifyLocatorOptions): Promise<void> {
  if (!options || Object.keys(options).length === 0) {
    throw new Error('verifyLocator: options object must not be empty');
  }

  const extraVisibilityCheck = addVisibilityDefault(options);
  const softOpts = { timeout: options.timeout };
  const tasks: Promise<unknown>[] = [];

  if (extraVisibilityCheck) {
    tasks.push(expect.soft(locator.first()).toBeVisible(softOpts));
  }
  if (options.visible != null) {
    tasks.push(expect.soft(locator).toBeVisible(softOpts));
  }
  if (options.enabled != null) {
    tasks.push(expect.soft(locator).toBeEnabled(softOpts));
  }
  if (options.haveText != null) {
    tasks.push(expect.soft(locator).toHaveText(options.haveText, softOpts));
  }
  if (options.notHaveText != null) {
    tasks.push(expect.soft(locator).not.toHaveText(options.notHaveText, softOpts));
  }
  if (options.haveValue != null) {
    tasks.push(expect.soft(locator).toHaveValue(options.haveValue, softOpts));
  }
  if (options.notHaveValue != null) {
    tasks.push(expect.soft(locator).not.toHaveValue(options.notHaveValue, softOpts));
  }
  if (options.containsText != null) {
    tasks.push(expect.soft(locator).toContainText(options.containsText, softOpts));
  }
  if (options.notContainsText != null) {
    tasks.push(expect.soft(locator).not.toContainText(options.notContainsText, softOpts));
  }
  if (options.count != null) {
    tasks.push(assertCount(locator, options));
  }
  if (options.notCount != null) {
    tasks.push(expect.soft(locator).not.toHaveCount(options.notCount, softOpts));
  }
  if (options.arrayAnyOrder != null) {
    tasks.push(expect.soft(locator).toHaveCount(options.arrayAnyOrder.length, softOpts));
    tasks.push(
      expect
        .poll(async () => getNormalizedTexts(locator, options), {
          timeout: options.timeout ?? 5000,
          message: 'Expect text to be in any order',
        })
        .toEqual(expect.arrayContaining(options.arrayAnyOrder)),
    );
  }
  if (options.arrayOfSameText != null) {
    const regexp = getNormalizedRegexp(options.arrayOfSameText, options);
    tasks.push(
      expect
        .poll(
          async () => {
            const contents = await getNormalizedTexts(locator, options);
            return contents.every((c) => regexp.test(c));
          },
          {
            timeout: options.timeout ?? 5000,
            message: `Expect all text contents to match ${String(options.arrayOfSameText)}`,
          },
        )
        .toBe(true),
    );
  }
  if (options.checked != null) {
    tasks.push(expect.soft(locator).toBeChecked({ checked: options.checked, timeout: options.timeout }));
  }

  await Promise.all(tasks);
}

export function verifyLocator(target: Locator): VerifyNoArguments;

export function verifyLocator<T extends unknown[]>(target: (...args: T) => Locator): VerifyWithArguments<T>;

export function verifyLocator<T extends unknown[]>(
  target: Locator | ((...args: T) => Locator),
): VerifyNoArguments | VerifyWithArguments<T> {
  if (typeof target === 'function') {
    return async (...args: [...T, options: VerifyLocatorOptions]) => {
      const options = args[args.length - 1] as VerifyLocatorOptions;
      const locatorArgs = args.slice(0, -1) as T;
      const locator = (target as (...a: T) => Locator)(...locatorArgs);
      await assertOptions(locator, options);
    };
  }
  return async (options: VerifyLocatorOptions) => {
    await assertOptions(target, options);
  };
}
