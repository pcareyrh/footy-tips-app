import { PrismaClient } from '@prisma/client';
import { fetchDraw, fetchLadder, fetchSeasonDraw, fetchTeamStats, computeTeamStats, ScrapeResult } from './nrl-api.js';
import { fetchRoundDetails, fetchSeasonRoundDetails } from './rlp-scraper.js';
import { scrapeITipMatchStats, isConfigured as itipConfigured } from './itipfooty.js';

/**
 * Sync pick results from completed fixtures.
 * Called after scraping so correct/incorrect is set for analytics.
 */
export async function syncPickResults(prisma: PrismaClient): Promise<void> {
  const pendingPicks = await prisma.pick.findMany({
    where: { result: null },
    include: { fixture: true },
  });

  for (const pick of pendingPicks) {
    const fixture = pick.fixture;
    if (fixture.status !== 'completed' || !fixture.result) continue;

    let result: string;
    if (fixture.result === 'draw') {
      result = 'draw';
    } else if (
      (fixture.result === 'home' && pick.pickedTeamId === fixture.homeTeamId) ||
      (fixture.result === 'away' && pick.pickedTeamId === fixture.awayTeamId)
    ) {
      result = 'correct';
    } else {
      result = 'incorrect';
    }

    await prisma.pick.update({ where: { id: pick.id }, data: { result } });
  }
}

export type { ScrapeResult };

/**
 * Scrape current round fixtures + ladder from NRL.com JSON API.
 */
export async function scrapeCurrentRound(prisma: PrismaClient, season: number = 2026): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];

  // Auto-detect current round from the NRL API (default draw endpoint returns current round)
  let roundNum = 1;
  try {
    const url = `https://www.nrl.com/draw/data?competition=111&season=${season}`;
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (resp.ok) {
      const data = await resp.json() as any;
      if (typeof data.selectedRoundId === 'number') {
        roundNum = data.selectedRoundId;
      }
    }
  } catch {
    // Fall back to DB if API call fails
    const currentRound = await prisma.round.findFirst({
      where: { seasonId: String(season), isCurrent: true },
      orderBy: { number: 'desc' },
    });
    roundNum = currentRound?.number ?? 1;
  }

  // Fetch fixtures for current round and the previous round.
  // The NRL API advances selectedRoundId to the new round before all games
  // in the previous round are complete, so scraping only the current round
  // leaves any remaining "upcoming" fixtures from the prior round stale.
  if (roundNum > 1) {
    results.push(await fetchDraw(prisma, season, roundNum - 1));
  }
  results.push(await fetchDraw(prisma, season, roundNum));

  // Explicitly mark the detected round as current in the DB.
  // fetchDraw relies on f.isCurrentRound from the NRL API which is not always
  // set reliably, so we force-update it here using the roundNum we detected
  // from the top-level selectedRoundId field (which is always present).
  const roundId = `${season}-R${roundNum}`;
  await prisma.round.upsert({
    where: { id: roundId },
    update: { isCurrent: true },
    create: { id: roundId, seasonId: String(season), number: roundNum, name: `Round ${roundNum}`, isCurrent: true },
  });
  await prisma.round.updateMany({
    where: { seasonId: String(season), id: { not: roundId } },
    data: { isCurrent: false },
  });

  // Fetch ladder
  results.push(await fetchLadder(prisma, season));

  await syncPickResults(prisma);

  return results;
}

/**
 * Alias for backwards compatibility with scrape routes
 */
export async function scrapeLadder(prisma: PrismaClient, season: string = '2026'): Promise<ScrapeResult> {
  return fetchLadder(prisma, parseInt(season));
}

/**
 * Alias for backwards compatibility with scrape routes
 */
export async function scrapeFixtures(prisma: PrismaClient, season: string = '2026', round?: number): Promise<ScrapeResult> {
  if (round) {
    return fetchDraw(prisma, parseInt(season), round);
  }
  // Auto-detect current round
  const results = await scrapeCurrentRound(prisma, parseInt(season));
  // Return just the first draw result (current round fixtures)
  return results[0] ?? { source: 'nrl.com/api', type: 'draw', recordsAffected: 0, errors: ['No results'], details: '' };
}

/**
 * Scrape all data for current season: current round fixtures + ladder + team stats.
 *
 * Also lazily bootstraps 2025 historical data on first run. The prediction engine
 * needs 2025 ladder entries (ladderPos2025, pd2025) and 2025 fixture results
 * (recentForm, home/away records, attack/defence avg scores). Since the 2025
 * season is complete this is a one-time cost — subsequent scrapes skip it.
 */
export async function scrapeAll(prisma: PrismaClient, season: string = '2026'): Promise<ScrapeResult[]> {
  const results = await scrapeCurrentRound(prisma, parseInt(season));
  results.push(await scrapeTeamStats(prisma, season));

  // Scrape iTipFooty crowd tipping ratios (only if credentials are configured)
  if (itipConfigured()) {
    try {
      const currentRound = await prisma.round.findFirst({
        where: { seasonId: season, isCurrent: true },
      });
      if (currentRound) {
        results.push(await scrapeITipMatchStats(prisma, currentRound.number, season));
      }
    } catch (err) {
      console.error('[scrapeAll] iTipFooty match stats scrape failed:', err instanceof Error ? err.message : err);
    }
  }

  // Ensure the 2025 season row exists before inserting child records
  await prisma.season.upsert({
    where: { id: '2025' },
    update: {},
    create: { id: '2025', year: 2025, current: false },
  });

  // Bootstrap 2025 ladder — one API call, skipped once data is present
  const ladder2025Count = await prisma.ladderEntry.count({ where: { season: '2025' } });
  if (ladder2025Count === 0) {
    console.log('[scrapeAll] Fetching 2025 ladder (one-time bootstrap)...');
    results.push(await fetchLadder(prisma, 2025));
  }

  // Bootstrap 2025 fixture results — needed for recentForm, home/away records,
  // attack/defence scoring averages. Skipped once > 100 fixtures are present.
  const fixture2025Count = await prisma.fixture.count({
    where: { roundId: { startsWith: '2025-' } },
  });
  if (fixture2025Count < 100) {
    console.log('[scrapeAll] Fetching 2025 season fixtures (one-time bootstrap)...');
    const drawResults = await fetchSeasonDraw(prisma, 2025);
    results.push(...drawResults);
    // Compute team stats from the newly imported fixture data
    results.push(await computeTeamStats(prisma, 2025));
  }

  await syncPickResults(prisma);

  return results;
}

/**
 * Scrape team-level statistics from NRL.com stats API.
 * Falls back to computing stats from completed fixture data if API unavailable.
 */
export async function scrapeTeamStats(prisma: PrismaClient, season: string = '2026'): Promise<ScrapeResult> {
  return fetchTeamStats(prisma, parseInt(season));
}

/**
 * Scrape iTipFooty crowd tipping ratios for the current round.
 */
export async function scrapeITipStats(prisma: PrismaClient, season: string = '2026'): Promise<ScrapeResult> {
  const currentRound = await prisma.round.findFirst({
    where: { seasonId: season, isCurrent: true },
  });
  if (!currentRound) {
    return { source: 'itipfooty', type: 'match-stats', recordsAffected: 0, errors: ['No current round found'], details: '' };
  }
  return scrapeITipMatchStats(prisma, currentRound.number, season);
}

/**
 * Bulk historical import: all fixtures + ladder for a given year range.
 * Fetches all rounds from NRL.com API, then enriches with RLP data.
 */
export async function scrapeHistorical(
  prisma: PrismaClient,
  startYear: number = 2025,
  endYear: number = 2025,
  onProgress?: (msg: string) => void
): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];

  for (let year = startYear; year <= endYear; year++) {
    // Ensure season exists
    await prisma.season.upsert({
      where: { id: String(year) },
      update: {},
      create: { id: String(year), year, current: year === endYear },
    });

    onProgress?.(`Fetching ${year} season draw from NRL.com...`);
    const drawResults = await fetchSeasonDraw(prisma, year);
    results.push(...drawResults);

    onProgress?.(`Fetching ${year} ladder from NRL.com...`);
    const ladderResult = await fetchLadder(prisma, year);
    results.push(ladderResult);

    // Enrich completed fixtures with RLP data (referee, crowd, halftime)
    // Only for past seasons where match details are available
    if (year < new Date().getFullYear() || (year === new Date().getFullYear() && new Date().getMonth() > 3)) {
      const maxRound = drawResults.filter(r => r.recordsAffected > 0).length;
      if (maxRound > 0) {
        onProgress?.(`Enriching ${year} fixtures from Rugby League Project (${maxRound} rounds)...`);
        const rlpResults = await fetchSeasonRoundDetails(prisma, year, maxRound);
        results.push(...rlpResults);
      }
    }

    // Compute team stats from fixture data for this season
    onProgress?.(`Computing ${year} team statistics from fixtures...`);
    const statsResult = await computeTeamStats(prisma, year);
    results.push(statsResult);
  }

  return results;
}
