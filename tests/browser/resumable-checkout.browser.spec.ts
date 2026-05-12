import { test, expect, narrator } from '../../src/fixtures';
import { ShopCheckoutPage } from '../pom';

/**
 * Resumable checkout flow with auto-checkpoint.
 * The browser is auto-launched — you do not need a manual `launch()` for the default case.
 *
 * Use the `resumable` fixture for linear steps (same resume behaviour as `runSteps`).
 * After a failure: `BROWSER_CHECKPOINT_RESUME=true npx playwright test resumable-checkout --project=chrome`
 */
test.describe('Resumable Checkout Flow', () => {
  test('multi-step checkout with auto-checkpoint', async ({ app, resumable }) => {
    const shop = narrator.newPage(ShopCheckoutPage);

    await resumable.step('browse products', async () => {
      await shop.browseProducts();
    });
    await resumable.step('add to cart', async () => {
      await shop.addFirstProductToCart();
    });
    await resumable.step('go to cart', async () => {
      await shop.openCart();
    });
    await resumable.step('proceed to checkout', async () => {
      await shop.proceedToCheckout();
    });
    await resumable.step('fill payment info', async () => {
      await shop.fillPayment('4242424242424242', '12/28', '123');
    });
    await resumable.step('confirm order', async () => {
      await shop.confirmOrderAndWait();
    });

    const title = await app.getTitle();
    expect(title).toContain('Confirmation');
  });
});
