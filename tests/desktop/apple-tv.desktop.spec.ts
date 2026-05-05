import { test, expect } from '../../src/fixtures';
import { DesktopDriver } from '../../src/drivers/desktop/desktop-driver';
import { AppleTVSignInScreen } from '../pom';

test.describe('Apple TV - Desktop Automation', () => {
  test.skip(process.platform !== 'darwin', 'macOS only');

  test('opens Apple TV app and verifies window title', async ({ app }) => {
    const title = await app.getTitle();
    expect(title.length).toBeGreaterThan(0);
  });

  test('opens Apple TV app and performs login flow', async ({ app }) => {
    const email = process.env.APPLE_TV_EMAIL;
    const password = process.env.APPLE_TV_PASSWORD;
    test.skip(!email || !password, 'APPLE_TV_EMAIL and APPLE_TV_PASSWORD required');

    const signIn = new AppleTVSignInScreen(app as DesktopDriver);
    await signIn.signInWithAppleId(email!, password!);
  });
});
