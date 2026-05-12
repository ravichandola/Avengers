/**
 * Hierarchy POMs (`RootContainer`, {@link WebPage}, {@link Block}, {@link Container}),
 * locator action helpers, and soft verification builders.
 *
 * Import as a **namespace** to avoid clashing with scoped `Block` in `block.ts`:
 *
 * ```ts
 * import { pomPages } from '../../../src/drivers/browser/pom';
 *
 * class Login extends pomPages.WebPage { ... }
 * ```
 */
export { GenericPageObject } from './generic-page-object';
export { RootContainer } from './root-container';
export { Block, Window } from './block';
export { Container } from './container';
export { WebPage } from './web-page';
export {
  createLocatorAction,
  checkLocator,
  uncheckLocator,
  setCheckedLocator,
  clickLocator,
  fillLocator,
  submitLocator,
  type LocatorActionNoArguments,
  type LocatorActionWithArguments,
  type CheckUncheckNoArguments,
  type CheckUncheckWithArguments,
  type SetCheckedNoArguments,
  type SetCheckedWithArguments,
  type ClickNoArguments,
  type ClickWithArguments,
  type FillNoArguments,
  type FillWithArguments,
  type SubmitNoArguments,
  type SubmitWithArguments,
} from './enhanced-actions';
export {
  verifyLocator,
  type VerifyNoArguments,
  type VerifyWithArguments,
  type VerifyLocatorOptions,
} from './enhanced-verification';
export { type EnhancedPageObject, type Override } from './enhanced-page-object';
