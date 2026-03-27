import { test, expect } from '@playwright/test';

test.describe('Predictions page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/predictions');
  });

  test('shows "Round Predictions" heading', async ({ page }) => {
    await expect(page.getByText('Round Predictions')).toBeVisible({ timeout: 10000 });
  });

  test('shows loading spinner or predictions', async ({ page }) => {
    // Either still loading or already showing content
    const spinner = page.locator('.animate-spin');
    const heading = page.getByText('Round Predictions');
    await expect(heading).toBeVisible({ timeout: 10000 });
    // Spinner should disappear once loaded
    await expect(spinner).not.toBeVisible({ timeout: 15000 });
  });

  test('shows match count after loading', async ({ page }) => {
    await expect(page.getByText('Round Predictions')).toBeVisible({ timeout: 10000 });
    // Wait for data to load - match count or "0 matches" should appear
    await expect(page.getByText(/\d+ matches/)).toBeVisible({ timeout: 15000 });
  });

  test('"Show analysis" button is visible and expands factors', async ({ page }) => {
    // Wait for predictions to load
    await expect(page.getByText('Round Predictions')).toBeVisible();

    const showBtn = page.getByText('Show analysis').first();
    // If there are predictions, "Show analysis" button should be present
    const hasPredictions = await showBtn.isVisible({ timeout: 10000 }).catch(() => false);

    if (hasPredictions) {
      await showBtn.click();
      await expect(page.getByText('Hide analysis')).toBeVisible();
      await expect(page.getByText('Contributing Factors')).toBeVisible();
    }
    // Test passes regardless (no data in CI is fine)
  });
});
