import { PrismaClient } from '@prisma/client';
import type { ScrapeResult } from './nrl-api.js';

const CASUALTY_URL = 'https://www.nrl.com/casualty-ward/data';

// NRL.com nicknames → our 3-letter team IDs
const NICKNAME_MAP: Record<string, string> = {
  'broncos': 'BRI',
  'raiders': 'CAN',
  'bulldogs': 'CBY',
  'sharks': 'CRO',
  'dolphins': 'DOL',
  'titans': 'GLD',
  'sea eagles': 'MAN',
  'storm': 'MEL',
  'knights': 'NEW',
  'warriors': 'NZW',
  'cowboys': 'NQL',
  'eels': 'PAR',
  'panthers': 'PEN',
  'rabbitohs': 'SOU',
  'dragons': 'SGI',
  'roosters': 'SYD',
  'wests tigers': 'WST',
  'tigers': 'WST',
};

export interface CasualtyEntry {
  firstName: string;
  lastName: string;
  expectedReturn: string;
  injury: string;
  teamNickname: string;
}

export function resolveTeamId(nickname: string): string | null {
  return NICKNAME_MAP[nickname.toLowerCase().trim()] ?? null;
}

/**
 * Parse "Round 8" → 8. Returns null for non-round values
 * like "Indefinite", "TBC", "Trials", "Next Season".
 */
export function parseExpectedReturnRound(expectedReturn: string): number | null {
  const m = expectedReturn.match(/^Round\s+(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Status: 'suspended' for Suspension entries, otherwise 'out'.
 * The casualty ward only lists players unavailable to play, so doubtful/probable
 * are not represented here.
 */
export function inferStatus(injury: string): 'suspended' | 'out' {
  return injury.trim().toLowerCase() === 'suspension' ? 'suspended' : 'out';
}

/**
 * Severity from rounds-away. Casualty ward has no medical detail, so this
 * is a coarse mapping based on how long until the player returns.
 *   ≤ 1 round away  → minor
 *   ≤ 3 rounds away → moderate
 *   > 3             → major
 *   "Next Season"   → season-ending
 *   "Indefinite" / "TBC" / "Trials" / unknown → major
 */
export function inferSeverity(expectedReturn: string, currentRound: number | null): string {
  const lower = expectedReturn.trim().toLowerCase();
  if (lower === 'next season') return 'season-ending';

  const returnRound = parseExpectedReturnRound(expectedReturn);
  if (returnRound === null || currentRound === null) return 'major';

  const roundsAway = returnRound - currentRound;
  if (roundsAway <= 1) return 'minor';
  if (roundsAway <= 3) return 'moderate';
  return 'major';
}

/**
 * Resolve "Round N" → ISO YYYY-MM-DD of that round's earliest fixture kickoff.
 * Returns null when the round has no fixtures with kickoff dates yet.
 */
export async function resolveReturnDate(
  prisma: PrismaClient,
  expectedReturn: string,
  season: string
): Promise<string | null> {
  const round = parseExpectedReturnRound(expectedReturn);
  if (round === null) return null;

  const fixture = await prisma.fixture.findFirst({
    where: { roundId: `${season}-R${round}`, kickoff: { not: null } },
    orderBy: { kickoff: 'asc' },
  });
  if (!fixture?.kickoff) return null;
  return fixture.kickoff.toISOString().slice(0, 10);
}

/**
 * Fetch + parse the NRL casualty ward, replace all source='casualty-ward'
 * Injury rows with the latest snapshot. Manual entries are untouched.
 */
export async function scrapeCasualtyWard(
  prisma: PrismaClient,
  season: string = '2026'
): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    source: 'nrl.com/casualty-ward',
    type: 'injuries',
    recordsAffected: 0,
    errors: [],
    details: '',
  };

  let casualties: CasualtyEntry[];
  try {
    const res = await fetch(CASUALTY_URL, {
      headers: {
        'User-Agent': 'FootyTipsApp/1.0 (personal tipping assistant)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { casualties?: CasualtyEntry[] };
    casualties = data.casualties ?? [];
  } catch (err) {
    result.errors.push(`Failed to fetch casualty ward: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  const currentRound = await prisma.round.findFirst({
    where: { seasonId: season, isCurrent: true },
  });
  const currentRoundNum = currentRound?.number ?? null;

  // Replace strategy: drop all existing casualty-ward rows, re-insert.
  // Keeps any manually-entered injuries intact.
  await prisma.injury.deleteMany({ where: { source: 'casualty-ward' } });

  let skipped = 0;
  for (const entry of casualties) {
    const teamId = resolveTeamId(entry.teamNickname);
    if (!teamId) {
      result.errors.push(`Unknown team nickname: ${entry.teamNickname}`);
      skipped++;
      continue;
    }

    const playerName = `${entry.firstName} ${entry.lastName}`.trim();
    const status = inferStatus(entry.injury);
    const severity = inferSeverity(entry.expectedReturn, currentRoundNum);
    const returnDate = await resolveReturnDate(prisma, entry.expectedReturn, season);

    await prisma.injury.create({
      data: {
        teamId,
        playerName,
        injuryType: entry.injury,
        severity,
        status,
        returnDate,
        notes: `Expected return: ${entry.expectedReturn}`,
        source: 'casualty-ward',
      },
    });
    result.recordsAffected++;
  }

  result.details = `Imported ${result.recordsAffected} casualty ward entries${skipped ? `, skipped ${skipped}` : ''}`;
  return result;
}
