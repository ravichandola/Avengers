import { test, expect } from '../../src/fixtures';
import { AuthManager } from '../../src/auth/auth-manager';
import { ExampleAuthPage } from '../pom';

/**
 * Auth profile setup and reuse.
 * The browser is auto-launched — you normally do not call `launch()` yourself.
 * The first run executes the login flow and saves the profile.
 * Later runs load that saved state and skip login.
 */
test.describe('Auth Profile Persistence', () => {
  const PROFILE_NAME = 'test-user';

  test('setup auth profile (runs login once)', async ({ browser }) => {
    await AuthManager.setupProfile(
      PROFILE_NAME,
      async (driver) => {
        const login = new ExampleAuthPage(driver);
        await login.login('user@example.com', 'secret123');
      },
      browser
    );

    const exists = await AuthManager.exists(PROFILE_NAME);
    expect(exists).toBe(true);
  });

  test('use saved auth profile to skip login', async ({ app }) => {
    await app.launch({ authProfile: PROFILE_NAME });

    const url = await app.getURL();
    expect(url).toContain('dashboard');
  });

  test.afterAll(async () => {
    await AuthManager.deleteProfile(PROFILE_NAME);
  });
});
