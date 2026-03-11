import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';

const NRL_BASE = 'https://www.nrl.com';

const TEAM_ID_MAP: Record<string, string> = {
  'broncos': 'BRI', 'brisbane broncos': 'BRI',
  'raiders': 'CAN', 'canberra raiders': 'CAN',
  'bulldogs': 'CBY', 'canterbury-bankstown bulldogs': 'CBY', 'canterbury bulldogs': 'CBY',
  'sharks': 'CRO', 'cronulla-sutherland sharks': 'CRO', 'cronulla sharks': 'CRO',
  'dolphins': 'DOL',
  'titans': 'GLD', 'gold coast titans': 'GLD',
  'sea eagles': 'MAN', 'manly warringah sea eagles': 'MAN', 'manly sea eagles': 'MAN',
  'storm': 'MEL', 'melbourne storm': 'MEL',
  'knights': 'NEW', 'newcastle knights': 'NEW',
  'warriors': 'NZW', 'new zealand warriors': 'NZW',
  'cowboys': 'NQL', 'north queensland cowboys': 'NQL',
  'eels': 'PAR', 'parramatta eels': 'PAR',
  'panthers': 'PEN', 'penrith panthers': 'PEN',
  'rabbitohs': 'SOU', 'south sydney rabbitohs': 'SOU',
  'dragons': 'SGI', 'st george illawarra dragons': 'SGI',
  'roosters': 'SYD', 'sydney roosters': 'SYD',
  'wests tigers': 'WST', 'tigers': 'WST',
};

function resolveTeamId(name: string): string | null {
  const lower = name.toLowerCase().trim();
  if (TEAM_ID_MAP[lower]) return TEAM_ID_MAP[lower];
  for (const [key, val] of Object.entries(TEAM_ID_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return val;
  }
  return null;
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'FootyTipsApp/1.0 (personal NRL tipping tool)',
          'Accept': 'text/html,application/json',
        },
      });
      if (res.ok) return res;
      if (i < retries - 1) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

export interface ScrapeResult {
  source: string;
  type: string;
  recordsAffected: number;
  errors: string[];
  details: string;
}

export async function scrapeLadder(prisma: PrismaClient, season: string = '2026'): Promise<ScrapeResult> {
  const result: ScrapeResult = { source: 'nrl.com', type: 'ladder', recordsAffected: 0, errors: [], details: '' };

  try {
    const res = await fetchWithRetry(`${NRL_BASE}/ladder/`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // Try parsing JSON-LD or embedded data first
    const scriptTags = $('script[type="application/ld+json"]');
    let ladderData: Array<{ team: string; position: number; played: number; wins: number; draws: number; losses: number; pf: number; pa: number; pd: number; pts: number }> = [];

    // Parse ladder table from HTML
    $('table tbody tr, .ladder-table__row, [class*="ladder"] tr').each((_i, row) => {
      const cells = $(row).find('td, .ladder-table__cell');
      if (cells.length >= 6) {
        const teamName = $(row).find('a, .team-name, [class*="team"]').first().text().trim()
          || cells.eq(1).text().trim() || cells.eq(0).text().trim();
        const position = parseInt(cells.eq(0).text().trim()) || _i + 1;
        const played = parseInt(cells.eq(2).text().trim()) || 0;
        const wins = parseInt(cells.eq(3).text().trim()) || 0;
        const draws = parseInt(cells.eq(4).text().trim()) || 0;
        const losses = parseInt(cells.eq(5).text().trim()) || 0;

        // Look for PF/PA/PD/Pts in remaining cells
        let pf = 0, pa = 0, pd = 0, pts = 0;
        if (cells.length >= 10) {
          pf = parseInt(cells.eq(6).text().trim()) || 0;
          pa = parseInt(cells.eq(7).text().trim()) || 0;
          pd = parseInt(cells.eq(8).text().trim()) || 0;
          pts = parseInt(cells.eq(9).text().trim()) || 0;
        }

        if (teamName) {
          ladderData.push({ team: teamName, position, played, wins, draws, losses, pf, pa, pd, pts });
        }
      }
    });

    if (ladderData.length === 0) {
      result.errors.push('Could not parse ladder table from NRL.com — site structure may have changed');
      result.details = 'HTML fetched but no table rows matched. Manual update may be required.';
      return result;
    }

    // Get current round number from the latest round
    const currentSeason = await prisma.season.findFirst({ where: { year: parseInt(season) } });
    const currentRound = await prisma.round.findFirst({
      where: { seasonId: currentSeason?.id ?? `season-${season}`, isCurrent: true },
      orderBy: { number: 'desc' },
    });
    const roundNum = currentRound?.number ?? 1;

    for (const entry of ladderData) {
      const teamId = resolveTeamId(entry.team);
      if (!teamId) {
        result.errors.push(`Could not resolve team: "${entry.team}"`);
        continue;
      }

      await prisma.ladderEntry.upsert({
        where: { teamId_season_round: { teamId, season, round: roundNum } },
        update: {
          position: entry.position,
          played: entry.played,
          wins: entry.wins,
          draws: entry.draws,
          losses: entry.losses,
          pointsFor: entry.pf,
          pointsAgainst: entry.pa,
          pointsDiff: entry.pd,
          competitionPoints: entry.pts,
        },
        create: {
          teamId,
          season,
          round: roundNum,
          position: entry.position,
          played: entry.played,
          wins: entry.wins,
          draws: entry.draws,
          losses: entry.losses,
          pointsFor: entry.pf,
          pointsAgainst: entry.pa,
          pointsDiff: entry.pd,
          competitionPoints: entry.pts,
        },
      });
      result.recordsAffected++;
    }

    result.details = `Updated ${result.recordsAffected} ladder entries for round ${roundNum}`;
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

export async function scrapeFixtures(prisma: PrismaClient, season: string = '2026', round?: number): Promise<ScrapeResult> {
  const result: ScrapeResult = { source: 'nrl.com', type: 'fixtures', recordsAffected: 0, errors: [], details: '' };

  try {
    const roundParam = round ? `?round=${round}` : '';
    const res = await fetchWithRetry(`${NRL_BASE}/draw/${roundParam}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    interface ParsedFixture {
      homeTeam: string;
      awayTeam: string;
      venue: string;
      kickoff: string;
      homeScore: number | null;
      awayScore: number | null;
    }

    const fixtures: ParsedFixture[] = [];

    // Parse match cards from the draw page
    $('[class*="match-card"], [class*="fixture"], .match, article').each((_i, el) => {
      const $el = $(el);
      const teams = $el.find('[class*="team-name"], .team-name, .team h3, .team h4').map((_j, t) => $(t).text().trim()).get();
      const venue = $el.find('[class*="venue"], .venue, [class*="location"]').first().text().trim();
      const dateText = $el.find('[class*="date"], time, [datetime]').first().attr('datetime')
        || $el.find('[class*="date"], time').first().text().trim();
      const scores = $el.find('[class*="score"], .score').map((_j, s) => parseInt($(s).text().trim())).get();

      if (teams.length >= 2) {
        fixtures.push({
          homeTeam: teams[0],
          awayTeam: teams[1],
          venue: venue || '',
          kickoff: dateText || '',
          homeScore: scores[0] ?? null,
          awayScore: scores[1] ?? null,
        });
      }
    });

    if (fixtures.length === 0) {
      result.errors.push('Could not parse fixtures from NRL.com — site structure may have changed');
      result.details = 'HTML fetched but no match cards found. Manual update may be required.';
      return result;
    }

    // Find or determine the round
    const currentSeason = await prisma.season.findFirst({ where: { year: parseInt(season) } });
    const seasonId = currentSeason?.id ?? `season-${season}`;
    const targetRound = round
      ? await prisma.round.findFirst({ where: { seasonId, number: round } })
      : await prisma.round.findFirst({ where: { seasonId, isCurrent: true }, orderBy: { number: 'desc' } });

    if (!targetRound) {
      result.errors.push(`Could not find round ${round ?? 'current'} in season ${season}`);
      return result;
    }

    for (const fix of fixtures) {
      const homeId = resolveTeamId(fix.homeTeam);
      const awayId = resolveTeamId(fix.awayTeam);

      if (!homeId || !awayId) {
        result.errors.push(`Could not resolve teams: "${fix.homeTeam}" vs "${fix.awayTeam}"`);
        continue;
      }

      // Check if fixture already exists for this round + teams
      const existing = await prisma.fixture.findFirst({
        where: { roundId: targetRound.id, homeTeamId: homeId, awayTeamId: awayId },
      });

      const fixtureData = {
        venue: fix.venue || undefined,
        kickoff: fix.kickoff ? new Date(fix.kickoff) : undefined,
        homeScore: fix.homeScore,
        awayScore: fix.awayScore,
        status: fix.homeScore !== null ? 'completed' : 'upcoming',
        result: fix.homeScore !== null && fix.awayScore !== null
          ? (fix.homeScore > fix.awayScore ? 'home' : fix.awayScore > fix.homeScore ? 'away' : 'draw')
          : undefined,
      };

      if (existing) {
        await prisma.fixture.update({ where: { id: existing.id }, data: fixtureData });
      } else {
        await prisma.fixture.create({
          data: {
            roundId: targetRound.id,
            homeTeamId: homeId,
            awayTeamId: awayId,
            ...fixtureData,
          },
        });
      }
      result.recordsAffected++;
    }

    result.details = `Processed ${result.recordsAffected} fixtures for round ${targetRound.number}`;
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

export async function scrapeAll(prisma: PrismaClient, season: string = '2026'): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];

  // Rate limit between requests
  results.push(await scrapeLadder(prisma, season));
  await new Promise(r => setTimeout(r, 2000));
  results.push(await scrapeFixtures(prisma, season));

  return results;
}
