import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('loads the dashboard at /', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');
    // Dashboard title or content should be visible
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
  });

  test('navigates to /predictions via sidebar link', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /predictions/i }).click();
    await expect(page).toHaveURL('/predictions');
    await expect(page.getByText('Round Predictions')).toBeVisible({ timeout: 10000 });
  });

  test('navigates to /matches via sidebar link', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /matches/i }).click();
    await expect(page).toHaveURL('/matches');
  });

  test('navigates to /settings via sidebar link', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /settings/i }).click();
    await expect(page).toHaveURL('/settings');
  });

  test('app header shows "Footy Tips" branding', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Footy Tips')).toBeVisible();
  });
});
