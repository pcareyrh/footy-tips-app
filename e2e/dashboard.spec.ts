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

  test('page heading or round info is visible', async ({ page }) => {
    // The dashboard should display a heading or some round/fixture content
    const heading = page.getByRole('heading').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Dashboard with mocked API', () => {
  test('displays round number when fixtures in Round 5 are returned', async ({ page }) => {
    await page.route('**/api/fixtures?current=true', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'fix-mock-1',
            roundId: '2026-R5',
            homeTeamId: 'MEL',
            awayTeamId: 'PEN',
            venue: 'AAMI Park',
            status: 'upcoming',
            homeScore: null,
            awayScore: null,
            result: null,
            kickoff: null,
            homeOdds: 1.75,
            awayOdds: 2.1,
            homeTeam: { id: 'MEL', name: 'Melbourne Storm', shortName: 'Storm' },
            awayTeam: { id: 'PEN', name: 'Penrith Panthers', shortName: 'Panthers' },
            round: { id: '2026-R5', number: 5, name: 'Round 5', isCurrent: true, seasonId: '2026' },
            picks: [],
          },
        ]),
      });
    });

    await page.goto('/');
    await expect(page.getByText(/round\s*5/i)).toBeVisible({ timeout: 10000 });
  });

  test('displays scores when a completed fixture is returned', async ({ page }) => {
    await page.route('**/api/fixtures?current=true', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'fix-mock-2',
            roundId: '2026-R3',
            homeTeamId: 'MEL',
            awayTeamId: 'PEN',
            venue: 'AAMI Park',
            status: 'completed',
            homeScore: 26,
            awayScore: 18,
            result: 'home',
            kickoff: new Date(Date.now() - 86400000).toISOString(),
            homeOdds: 1.75,
            awayOdds: 2.1,
            homeTeam: { id: 'MEL', name: 'Melbourne Storm', shortName: 'Storm' },
            awayTeam: { id: 'PEN', name: 'Penrith Panthers', shortName: 'Panthers' },
            round: { id: '2026-R3', number: 3, name: 'Round 3', isCurrent: true, seasonId: '2026' },
            picks: [],
          },
        ]),
      });
    });

    await page.goto('/');
    // Score "26" or "18" should appear somewhere on the dashboard
    await expect(page.getByText(/26/)).toBeVisible({ timeout: 10000 });
  });
});
