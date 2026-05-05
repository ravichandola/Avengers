import { DriverPage } from '../../../src/pom/driver-page';

/** shop.example.com demo — resumable-checkout.browser.spec.ts */
export class ShopCheckoutPage extends DriverPage {
  static readonly productsUrl = 'https://shop.example.com/products';

  readonly productList = this.element('.product-list');
  readonly firstProductAddToCart = this.element('.product-card:first-child .add-to-cart');
  readonly cartBadge = this.element('.cart-badge');
  readonly cartIcon = this.element('.cart-icon');
  readonly cartPage = this.element('.cart-page');
  readonly checkoutButton = this.element('#checkout-btn');
  readonly checkoutForm = this.element('.checkout-form');
  readonly cardNumber = this.element('#card-number');
  readonly cardExpiry = this.element('#card-expiry');
  readonly cardCvc = this.element('#card-cvc');
  readonly confirmOrder = this.element('#confirm-order');
  readonly orderConfirmation = this.element('.order-confirmation');

  async browseProducts(): Promise<void> {
    await this.navigate(ShopCheckoutPage.productsUrl);
    await this.productList.waitFor();
  }

  async addFirstProductToCart(): Promise<void> {
    await this.firstProductAddToCart.click();
    await this.cartBadge.waitFor();
  }

  async openCart(): Promise<void> {
    await this.cartIcon.click();
    await this.cartPage.waitFor();
  }

  async proceedToCheckout(): Promise<void> {
    await this.checkoutButton.click();
    await this.checkoutForm.waitFor();
  }

  async fillPayment(card: string, expiry: string, cvc: string): Promise<void> {
    await this.cardNumber.fill(card);
    await this.cardExpiry.fill(expiry);
    await this.cardCvc.fill(cvc);
  }

  async confirmOrderAndWait(): Promise<void> {
    await this.confirmOrder.click();
    await this.orderConfirmation.waitFor();
  }
}
