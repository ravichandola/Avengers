import { test, expect, runSteps, Step } from '../../src/fixtures';
import { BrowserDriver } from '../../src/drivers/browser/browser-driver';
import { ShopCheckoutPage } from '../pom';

/**
 * Resumable checkout flow with auto-checkpoint.
 * Browser auto-launch hota hai — no launch() needed.
 * If step N fails, next run restores from step N-1 and retries from N.
 */
test.describe('Resumable Checkout Flow', () => {
  test('multi-step checkout with auto-checkpoint', async ({ app }, testInfo) => {
    const browserDriver = app as BrowserDriver;
    const getContext = () => browserDriver.getContext();

    const steps: Step[] = [
      {
        name: 'browse products',
        fn: async (driver) => {
          await new ShopCheckoutPage(driver).browseProducts();
        },
      },
      {
        name: 'add to cart',
        fn: async (driver) => {
          await new ShopCheckoutPage(driver).addFirstProductToCart();
        },
      },
      {
        name: 'go to cart',
        fn: async (driver) => {
          await new ShopCheckoutPage(driver).openCart();
        },
      },
      {
        name: 'proceed to checkout',
        fn: async (driver) => {
          await new ShopCheckoutPage(driver).proceedToCheckout();
        },
      },
      {
        name: 'fill payment info',
        fn: async (driver) => {
          await new ShopCheckoutPage(driver).fillPayment('4242424242424242', '12/28', '123');
        },
      },
      {
        name: 'confirm order',
        fn: async (driver) => {
          await new ShopCheckoutPage(driver).confirmOrderAndWait();
        },
      },
    ];

    await runSteps({
      testId: testInfo.testId,
      driver: app,
      steps,
      getContext,
    });

    const title = await app.getTitle();
    expect(title).toContain('Confirmation');
  });
});
