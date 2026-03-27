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

      await page.route('**/api/predictions**', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            season: '2026',
            round: 1,
            totalMatches: 1,
            summary: [],
            predictions: [{
              fixtureId: 'fix-1',
              homeTeam: { id: 'MEL', name: 'Storm', ladderPos2025: 1, wins2025: 20, losses2025: 5, recentForm: 'WWWWL', titleOdds: null, injuries: [], completionRate: null, tackleEfficiency: null, errorCount: null, penaltyCount: null, possessionAvg: null },
              awayTeam: { id: 'PEN', name: 'Panthers', ladderPos2025: 3, wins2025: 17, losses2025: 8, recentForm: 'WLWWL', titleOdds: null, injuries: [], completionRate: null, tackleEfficiency: null, errorCount: null, penaltyCount: null, possessionAvg: null },
              venue: 'AAMI Park',
              h2h: '3-2 in 5 games',
              predictedWinner: 'Storm',
              predictedWinnerId: 'MEL',
              confidence: 'HIGH',
              confidenceScore: 70,
              factors: [],
              summary: 'Storm predicted to win.',
            }],
          }),
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

      // Open the review panel
      const reviewBtn = page.getByRole('button', { name: /review.*submit tips/i });
      await expect(reviewBtn).toBeVisible({ timeout: 10000 });
      await reviewBtn.click();

      // Wait for predictions to load and confirm button to appear
      const confirmBtn = page.getByRole('button', { name: /confirm.*submit/i });
      await expect(confirmBtn).toBeVisible({ timeout: 10000 });
      await confirmBtn.click();

      // Success message should appear
      await expect(page.getByText(/submitted/i)).toBeVisible({ timeout: 10000 });
    });
  });
});
