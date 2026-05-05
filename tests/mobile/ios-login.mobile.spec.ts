import { test, expect } from '../../src/fixtures';
import { MobileDriver } from '../../src/drivers/mobile/mobile-driver';
import { IosLoginScreen } from '../pom';

test.describe('iOS App - Mobile Automation', () => {
  test.skip(!process.env.APPIUM_RUNNING, 'Requires Appium server running');

  test('launches iOS app and verifies it opens', async ({ app }) => {
    const screen = new IosLoginScreen(app as MobileDriver);
    const visible = await screen.isMainScreenVisible();
    expect(visible).toBe(true);
  });

  test('login flow on iOS', async ({ app }) => {
    const screen = new IosLoginScreen(app as MobileDriver);
    await screen.login('user@example.com', 'password123');
  });
});
