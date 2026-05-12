import type { Page } from 'playwright';

import type { IDriver } from '../../core/base-driver';

export type LazyReadonlyPomOptions<T> =
  | {
      kind: 'pageobject';
      ctor: new (page: Page, ...args: unknown[]) => T;
      getPage: () => Page;
      extraArgs: unknown[];
      registerReset: (reset: () => void) => void;
    }
  | {
      kind: 'driverpage';
      ctor: new (driver: IDriver, ...args: unknown[]) => T;
      getDriver: () => IDriver;
      extraArgs: unknown[];
      registerReset: (reset: () => void) => void;
    };

/**
 * Lazy readonly POM: empty proxy that instantiates on first property read,
 * always bound to the latest `getPage()` / `getDriver()`. Caches clear when
 * {@link BrowserNarrator.resetPageInstances} runs.
 */
export function createLazyReadonlyPom<T extends object>(opts: LazyReadonlyPomOptions<T>): Readonly<T> {
  let instance: T | null = null;

  const ensure = (): T => {
    if (instance === null) {
      instance =
        opts.kind === 'pageobject'
          ? new opts.ctor(opts.getPage(), ...opts.extraArgs)
          : new opts.ctor(opts.getDriver(), ...opts.extraArgs);
    }
    return instance;
  };

  opts.registerReset(() => {
    instance = null;
  });

  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      if (prop === 'then') return undefined;
      const inst = ensure();
      const value = Reflect.get(inst as object, prop, receiver);
      if (typeof value === 'function') {
        return (value as (...a: unknown[]) => unknown).bind(inst);
      }
      return value;
    },
    set() {
      throw new Error('narrator.newPage POM is frozen (readonly)');
    },
    defineProperty() {
      return false;
    },
    deleteProperty() {
      return false;
    },
  }) as Readonly<T>;
}
