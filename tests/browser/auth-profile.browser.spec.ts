import { test, expect } from '../../src/fixtures';
import { AuthManager } from '../../src/auth/auth-manager';
import { ExampleAuthPage } from '../pom';

/**
 * Auth profile setup and reuse.
 * Browser auto-launch hota hai — no launch() needed.
 * First run login flow execute karta hai aur profile save karta hai.
 * Subsequent runs saved state load karte hain, login skip hota hai.
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
