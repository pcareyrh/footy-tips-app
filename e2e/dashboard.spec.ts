import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads dashboard without error', async ({ page }) => {
    // No uncaught JS errors
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });

  test('shows "Footy Tips" in the header', async ({ page }) => {
    await expect(page.getByText('Footy Tips')).toBeVisible();
  });

  test('shows sidebar navigation links', async ({ page }) => {
    // Sidebar nav is visible on desktop viewport (default)
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: /predictions/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: /matches/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: /settings/i })).toBeVisible({ timeout: 5000 });
  });

  test('renders main content area', async ({ page }) => {
    // There should be some content in main after loading
    const main = page.locator('main, [role="main"], .space-y-6').first();
    await expect(main).toBeVisible({ timeout: 10000 });
  });
});
