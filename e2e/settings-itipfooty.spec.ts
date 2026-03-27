import { test, expect } from '@playwright/test';

test.describe('Settings — iTipFooty section', () => {
  test('navigates to /settings', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText(/settings/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('shows iTipFooty section', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText(/itipfooty/i).first()).toBeVisible({ timeout: 10000 });
  });

  test.describe('with mocked API responses', () => {
    test('shows "Connected as" when status is configured', async ({ page }) => {
      await page.route('**/api/itipfooty/status', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ configured: true, username: '***', compId: '12345' }),
        });
      });

      await page.goto('/settings');
      await expect(page.getByText(/connected as/i)).toBeVisible({ timeout: 10000 });
    });

    test('shows "Not configured" when status is unconfigured', async ({ page }) => {
      await page.route('**/api/itipfooty/status', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ configured: false, username: null, compId: null }),
        });
      });

      await page.goto('/settings');
      await expect(page.getByText(/not configured/i)).toBeVisible({ timeout: 10000 });
    });

    test('shows success result after tip submission', async ({ page }) => {
      await page.route('**/api/itipfooty/status', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ configured: true, username: '***', compId: '12345' }),
        });
      });

      await page.route('**/api/itipfooty/submit', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            round: 1,
            tips: [{ gameNumber: 1, homeTeam: 'Storm', awayTeam: 'Panthers', pick: 'H', pickedTeam: 'Storm', confidence: 'HIGH' }],
            message: 'Successfully submitted 1 tips for Round 1',
            errors: [],
          }),
        });
      });

      await page.goto('/settings');

      // Click submit button
      const submitBtn = page.getByRole('button', { name: /submit tips/i });
      await expect(submitBtn).toBeVisible({ timeout: 10000 });
      await submitBtn.click();

      // Success message should appear
      await expect(page.getByText(/submitted/i)).toBeVisible({ timeout: 10000 });
    });
  });
});
