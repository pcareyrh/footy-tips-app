import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Settings page — iTipFooty section moved to /tips
// ---------------------------------------------------------------------------
test.describe('Settings page', () => {
  test('navigates to /settings', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText(/settings/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('does not show iTipFooty card (moved to /tips)', async ({ page }) => {
    await page.goto('/settings');
    // Wait for page to fully render
    await expect(page.getByText(/settings/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/itipfooty integration/i)).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tips page — dedicated iTipFooty submission page
// ---------------------------------------------------------------------------
test.describe('Tips page', () => {
  test('navigates to /tips via nav link', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /tips/i }).first().click();
    await expect(page).toHaveURL(/\/tips/);
    await expect(page.getByRole('heading', { name: /tips/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('shows iTipFooty connection section', async ({ page }) => {
    await page.goto('/tips');
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
      await page.route('**/api/tips/**', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      });

      await page.goto('/tips');
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
      await page.route('**/api/tips/**', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      });

      await page.goto('/tips');
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

      await page.route('**/api/tips/current-round', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            round: 1,
            season: '2026',
            predictions: [{
              fixtureId: 'fix-1',
              kickoff: new Date(Date.now() + 3 * 3600_000).toISOString(),
              homeTeam: { id: 'MEL', name: 'Storm' },
              awayTeam: { id: 'PEN', name: 'Panthers' },
              predictedWinnerId: 'MEL',
              predictedWinner: 'Storm',
              confidence: 'HIGH',
              confidenceScore: 70,
              override: null,
              effectivePickId: 'MEL',
            }],
          }),
        });
      });

      await page.route('**/api/tips/schedule', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      });

      await page.route('**/api/tips/history', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      });

      await page.route('**/api/tips/submit', (route) => {
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

      await page.goto('/tips');

      const submitBtn = page.getByRole('button', { name: /submit now/i });
      await expect(submitBtn).toBeVisible({ timeout: 10000 });
      await submitBtn.click();

      await expect(page.getByText(/submitted/i)).toBeVisible({ timeout: 10000 });
    });
  });
});
