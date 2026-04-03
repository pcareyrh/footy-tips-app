import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  formWinRate,
  winPct,
  impliedProb,
  confidenceLabel,
  calculateInjuryBurden,
  calculateReturnBoost,
  predictMatch,
} from '../analysis.js';
import type { InjuryInfo } from '../analysis.js';

// ---------------------------------------------------------------------------
// formWinRate
// ---------------------------------------------------------------------------
describe('formWinRate', () => {
  it('returns 0.5 for empty string', () => {
    expect(formWinRate('')).toBe(0.5);
  });

  it('returns 1.0 for WWWWW', () => {
    expect(formWinRate('WWWWW')).toBe(1);
  });

  it('returns 0 for LLLLL', () => {
    expect(formWinRate('LLLLL')).toBe(0);
  });

  it('returns 0.6 for WWLWL', () => {
    expect(formWinRate('WWLWL')).toBeCloseTo(0.6);
  });

  it('only considers first n characters', () => {
    // 3 chars: WWL → 2/3
    expect(formWinRate('WWLLLLL', 3)).toBeCloseTo(2 / 3);
  });

  it('treats D as non-win', () => {
    expect(formWinRate('WDWDW')).toBeCloseTo(3 / 5);
  });
});

// ---------------------------------------------------------------------------
// winPct
// ---------------------------------------------------------------------------
describe('winPct', () => {
  it('returns 0.5 when no games played', () => {
    expect(winPct(0, 0)).toBe(0.5);
  });

  it('calculates correctly for 10W-5L', () => {
    expect(winPct(10, 5)).toBeCloseTo(10 / 15);
  });

  it('returns 1 for all wins', () => {
    expect(winPct(8, 0)).toBe(1);
  });

  it('returns 0 for all losses', () => {
    expect(winPct(0, 8)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// impliedProb
// ---------------------------------------------------------------------------
describe('impliedProb', () => {
  it('returns 0.5 for null odds', () => {
    expect(impliedProb(null)).toBe(0.5);
  });

  it('returns 0.5 for odds <= 1', () => {
    expect(impliedProb(1)).toBe(0.5);
    expect(impliedProb(0.5)).toBe(0.5);
  });

  it('returns 0.5 for odds of 2.0', () => {
    expect(impliedProb(2.0)).toBe(0.5);
  });

  it('returns correct value for 1.75', () => {
    expect(impliedProb(1.75)).toBeCloseTo(1 / 1.75);
  });

  it('returns near 1 for very short odds', () => {
    expect(impliedProb(1.01)).toBeCloseTo(1 / 1.01);
  });
});

// ---------------------------------------------------------------------------
// confidenceLabel
// ---------------------------------------------------------------------------
describe('confidenceLabel', () => {
  it('returns VERY HIGH for score >= 80', () => {
    expect(confidenceLabel(80)).toBe('VERY HIGH');
    expect(confidenceLabel(95)).toBe('VERY HIGH');
  });

  it('returns HIGH for score 65-79', () => {
    expect(confidenceLabel(65)).toBe('HIGH');
    expect(confidenceLabel(79)).toBe('HIGH');
  });

  it('returns MEDIUM for score 50-64', () => {
    expect(confidenceLabel(50)).toBe('MEDIUM');
    expect(confidenceLabel(64)).toBe('MEDIUM');
  });

  it('returns LOW for score < 50', () => {
    expect(confidenceLabel(49)).toBe('LOW');
    expect(confidenceLabel(0)).toBe('LOW');
  });
});

// ---------------------------------------------------------------------------
// calculateInjuryBurden
// ---------------------------------------------------------------------------
describe('calculateInjuryBurden', () => {
  it('returns 0 for empty array', () => {
    expect(calculateInjuryBurden([])).toBe(0);
  });

  it('skips probable (returning) players', () => {
    const injuries: InjuryInfo[] = [
      { playerName: 'A', position: 'halfback', severity: 'season-ending', status: 'probable', injuryType: null },
    ];
    expect(calculateInjuryBurden(injuries)).toBe(0);
  });

  it('calculates halfback out + season-ending correctly (1.0 × 1.0 × 1.0)', () => {
    const injuries: InjuryInfo[] = [
      { playerName: 'A', position: 'halfback', severity: 'season-ending', status: 'out', injuryType: null },
    ];
    expect(calculateInjuryBurden(injuries)).toBeCloseTo(1.0);
  });

  it('calculates winger doubtful minor (0.4 × 0.2 × 0.5 = 0.04)', () => {
    const injuries: InjuryInfo[] = [
      { playerName: 'A', position: 'winger', severity: 'minor', status: 'doubtful', injuryType: null },
    ];
    expect(calculateInjuryBurden(injuries)).toBeCloseTo(0.04);
  });

  it('accumulates burden across multiple injuries', () => {
    const injuries: InjuryInfo[] = [
      { playerName: 'A', position: 'halfback', severity: 'season-ending', status: 'out', injuryType: null },
      { playerName: 'B', position: 'fullback', severity: 'major', status: 'out', injuryType: null },
    ];
    // 1.0*1.0*1.0 + 1.0*0.8*1.0 = 1.8
    expect(calculateInjuryBurden(injuries)).toBeCloseTo(1.8);
  });

  it('uses 0.4 criticality for unknown position', () => {
    const injuries: InjuryInfo[] = [
      { playerName: 'A', position: null, severity: 'major', status: 'out', injuryType: null },
    ];
    // 0.4 * 0.8 * 1.0 = 0.32
    expect(calculateInjuryBurden(injuries)).toBeCloseTo(0.32);
  });

  it('uses 0.4 severity weight for unknown severity', () => {
    const injuries: InjuryInfo[] = [
      { playerName: 'A', position: 'halfback', severity: null, status: 'out', injuryType: null },
    ];
    // 1.0 * 0.4 * 1.0 = 0.4
    expect(calculateInjuryBurden(injuries)).toBeCloseTo(0.4);
  });
});

// ---------------------------------------------------------------------------
// calculateReturnBoost
// ---------------------------------------------------------------------------
describe('calculateReturnBoost', () => {
  it('returns 0 for empty array', () => {
    expect(calculateReturnBoost([])).toBe(0);
  });

  it('returns 0 when no probable players', () => {
    const injuries: InjuryInfo[] = [
      { playerName: 'A', position: 'halfback', severity: 'major', status: 'out', injuryType: null },
    ];
    expect(calculateReturnBoost(injuries)).toBe(0);
  });

  it('gives halfback returning a boost of 1.0 × 0.5 = 0.5', () => {
    const injuries: InjuryInfo[] = [
      { playerName: 'A', position: 'halfback', severity: 'minor', status: 'probable', injuryType: null },
    ];
    expect(calculateReturnBoost(injuries)).toBeCloseTo(0.5);
  });

  it('ignores out/doubtful players', () => {
    const injuries: InjuryInfo[] = [
      { playerName: 'A', position: 'halfback', severity: 'major', status: 'out', injuryType: null },
      { playerName: 'B', position: 'fullback', severity: 'moderate', status: 'doubtful', injuryType: null },
      { playerName: 'C', position: 'halfback', severity: 'minor', status: 'probable', injuryType: null },
    ];
    expect(calculateReturnBoost(injuries)).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// predictMatch — mock Prisma
// ---------------------------------------------------------------------------

function makeMockPrisma(overrides: Record<string, unknown> = {}) {
  const defaultTeam = (shortName: string) => ({
    id: shortName === 'Storm' ? 'MEL' : 'PEN',
    name: shortName === 'Storm' ? 'Melbourne Storm' : 'Penrith Panthers',
    shortName,
  });

  const defaultLadder = (pos: number) => ({
    position: pos,
    wins: 10,
    losses: 5,
    pointsDiff: 50,
    titleOdds: null,
    streak: null,
  });

  return {
    team: {
      findUniqueOrThrow: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(defaultTeam(where.id === 'MEL' ? 'Storm' : 'Panthers'))
      ),
    },
    ladderEntry: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: { teamId: string; season: string } }) => {
        if (where.season === '2026') return Promise.resolve(null);
        return Promise.resolve(defaultLadder(where.teamId === 'MEL' ? 1 : 3));
      }),
    },
    fixture: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    injury: { findMany: vi.fn().mockResolvedValue([]) },
    teamStat: { findFirst: vi.fn().mockResolvedValue(null) },
    iTipMatchStat: { findUnique: vi.fn().mockResolvedValue(null) },
    ...overrides,
  } as unknown as PrismaClient;
}

describe('predictMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a MatchPrediction with all required fields', async () => {
    const prisma = makeMockPrisma();
    const result = await predictMatch(prisma, 'fix-1', 'MEL', 'PEN', 'AAMI Park');

    expect(result).toMatchObject({
      fixtureId: 'fix-1',
      venue: 'AAMI Park',
      predictedWinner: expect.any(String),
      predictedWinnerId: expect.any(String),
      confidence: expect.stringMatching(/^(LOW|MEDIUM|HIGH|VERY HIGH)$/),
      confidenceScore: expect.any(Number),
      factors: expect.any(Array),
      summary: expect.any(String),
    });
  });

  it('confidenceScore is capped at 95', async () => {
    // Give home team a huge advantage in every factor
    const prisma = makeMockPrisma({
      ladderEntry: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { teamId: string; season: string } }) => {
          if (where.season === '2026') return Promise.resolve(null);
          return Promise.resolve({
            position: where.teamId === 'MEL' ? 1 : 16,
            wins: where.teamId === 'MEL' ? 25 : 0,
            losses: where.teamId === 'MEL' ? 0 : 25,
            pointsDiff: where.teamId === 'MEL' ? 500 : -500,
            titleOdds: null,
            streak: null,
          });
        }),
      },
    });
    const result = await predictMatch(
      prisma, 'fix-1', 'MEL', 'PEN', 'AAMI Park',
      { homeOdds: 1.05, awayOdds: 10.0 }
    );
    expect(result.confidenceScore).toBeLessThanOrEqual(95);
  });

  it('does not include Match Odds factor when no odds provided', async () => {
    const prisma = makeMockPrisma();
    const result = await predictMatch(prisma, 'fix-1', 'MEL', 'PEN', 'AAMI Park');

    const oddsFactors = result.factors.filter(f => f.name.includes('Odds (Bookmaker)'));
    expect(oddsFactors).toHaveLength(0);
  });

  it('includes Match Odds factor when odds are provided', async () => {
    const prisma = makeMockPrisma();
    const result = await predictMatch(
      prisma, 'fix-1', 'MEL', 'PEN', 'AAMI Park',
      { homeOdds: 1.75, awayOdds: 2.1 }
    );

    const oddsFactors = result.factors.filter(f => f.name.includes('Odds (Bookmaker)'));
    expect(oddsFactors).toHaveLength(1);
  });

  it('always includes Home Ground Baseline factor with weight 3', async () => {
    const prisma = makeMockPrisma();
    const result = await predictMatch(prisma, 'fix-1', 'MEL', 'PEN', 'AAMI Park');

    const baseline = result.factors.find(f => f.name === 'Home Ground Baseline');
    expect(baseline).toBeDefined();
    expect(baseline!.weight).toBe(3);
    expect(baseline!.favouring).toBe('Storm');
  });

  it('factors are sorted descending by weight', async () => {
    const prisma = makeMockPrisma();
    const result = await predictMatch(prisma, 'fix-1', 'MEL', 'PEN', 'AAMI Park');

    for (let i = 1; i < result.factors.length; i++) {
      expect(result.factors[i].weight).toBeLessThanOrEqual(result.factors[i - 1].weight);
    }
  });

  it('summary mentions the predicted winner and venue', async () => {
    const prisma = makeMockPrisma();
    const result = await predictMatch(prisma, 'fix-1', 'MEL', 'PEN', 'AAMI Park');

    expect(result.summary).toContain(result.predictedWinner);
    expect(result.summary).toContain('AAMI Park');
  });

  it('predictedWinnerId matches the homeTeam or awayTeam id', async () => {
    const prisma = makeMockPrisma();
    const result = await predictMatch(prisma, 'fix-1', 'MEL', 'PEN', 'AAMI Park');

    expect(['MEL', 'PEN']).toContain(result.predictedWinnerId);
  });

  it('higher ladder-position team wins when all else is equal', async () => {
    // Both teams identical stats except ladder position
    const prisma = makeMockPrisma({
      ladderEntry: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { teamId: string; season: string } }) => {
          if (where.season === '2026') return Promise.resolve(null);
          return Promise.resolve({
            position: where.teamId === 'MEL' ? 1 : 16,
            wins: 10,
            losses: 5,
            pointsDiff: 0,
            titleOdds: null,
            streak: null,
          });
        }),
      },
    });
    const result = await predictMatch(prisma, 'fix-1', 'MEL', 'PEN', 'AAMI Park');
    // MEL is #1 vs PEN at #16, home advantage + better ladder → MEL should win
    expect(result.predictedWinnerId).toBe('MEL');
  });

  it('includes Crowd Sentiment factor when iTipMatchStat data is available', async () => {
    const prisma = makeMockPrisma({
      iTipMatchStat: {
        findUnique: vi.fn().mockResolvedValue({
          homeTipPct: 75,
          awayTipPct: 25,
        }),
      },
    });
    const result = await predictMatch(prisma, 'fix-1', 'MEL', 'PEN', 'AAMI Park');
    const sentimentFactor = result.factors.find(f => f.name === 'Crowd Sentiment (iTipFooty)');
    expect(sentimentFactor).toBeDefined();
    expect(sentimentFactor!.favouring).toBe('Storm');
    expect(sentimentFactor!.weight).toBeGreaterThan(0);
    expect(sentimentFactor!.detail).toContain('75%');
    expect(sentimentFactor!.detail).toContain('25%');
  });

  it('omits Crowd Sentiment factor when no iTipMatchStat data exists', async () => {
    const prisma = makeMockPrisma();
    const result = await predictMatch(prisma, 'fix-1', 'MEL', 'PEN', 'AAMI Park');
    const sentimentFactor = result.factors.find(f => f.name === 'Crowd Sentiment (iTipFooty)');
    expect(sentimentFactor).toBeUndefined();
  });
});
