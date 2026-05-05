import { test, expect } from '../../src/fixtures';
import { AuthManager } from '../../src/auth/auth-manager';
import { DriverFactory } from '../../src/core/driver-factory';
import { AppLoginPage } from '../pom';

/**
 * Multi-user test with different auth profiles.
 * Browser auto-launch hota hai — no launch() needed.
 * Har user ka apna saved session hota hai, switching me re-login nahi hota.
 */
test.describe('Multi-User Scenarios', () => {
  test('admin and regular user see different dashboards', async ({ browser }) => {
    await AuthManager.setupProfile(
      'admin',
      async (driver) => {
        await new AppLoginPage(driver).loginAsAdmin();
      },
      browser
    );

    await AuthManager.setupProfile(
      'regular-user',
      async (driver) => {
        await new AppLoginPage(driver).loginAsRegularUser();
      },
      browser
    );

    const adminDriver = DriverFactory.create({ platform: 'chromium', browser });
    await adminDriver.launch({ url: 'https://app.example.com/dashboard', authProfile: 'admin' });
    const adminTitle = await adminDriver.getTitle();
    expect(adminTitle).toContain('Admin');
    await adminDriver.close();

    const userDriver = DriverFactory.create({ platform: 'chromium', browser });
    await userDriver.launch({ url: 'https://app.example.com/dashboard', authProfile: 'regular-user' });
    const userTitle = await userDriver.getTitle();
    expect(userTitle).toContain('Dashboard');
    await userDriver.close();
  });

  test.afterAll(async () => {
    await AuthManager.deleteProfile('admin');
    await AuthManager.deleteProfile('regular-user');
  });
});
