import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  parseExpectedReturnRound,
  inferStatus,
  inferSeverity,
  resolveTeamId,
  resolveReturnDate,
  scrapeCasualtyWard,
} from '../casualty-ward.js';

describe('parseExpectedReturnRound', () => {
  it('parses "Round 8" → 8', () => {
    expect(parseExpectedReturnRound('Round 8')).toBe(8);
  });

  it('parses "Round 17" → 17', () => {
    expect(parseExpectedReturnRound('Round 17')).toBe(17);
  });

  it('returns null for "Indefinite"', () => {
    expect(parseExpectedReturnRound('Indefinite')).toBeNull();
  });

  it('returns null for "Next Season"', () => {
    expect(parseExpectedReturnRound('Next Season')).toBeNull();
  });

  it('returns null for "TBC"', () => {
    expect(parseExpectedReturnRound('TBC')).toBeNull();
  });

  it('returns null for "Trials"', () => {
    expect(parseExpectedReturnRound('Trials')).toBeNull();
  });
});

describe('inferStatus', () => {
  it('returns "suspended" for Suspension', () => {
    expect(inferStatus('Suspension')).toBe('suspended');
  });

  it('case-insensitive suspension detection', () => {
    expect(inferStatus('suspension')).toBe('suspended');
    expect(inferStatus('SUSPENSION')).toBe('suspended');
  });

  it('returns "out" for any non-suspension injury', () => {
    expect(inferStatus('Hamstring')).toBe('out');
    expect(inferStatus('ACL')).toBe('out');
    expect(inferStatus('Head knock')).toBe('out');
  });
});

describe('inferSeverity', () => {
  it('returns "season-ending" for Next Season', () => {
    expect(inferSeverity('Next Season', 8)).toBe('season-ending');
  });

  it('returns "minor" when return is current round', () => {
    expect(inferSeverity('Round 8', 8)).toBe('minor');
  });

  it('returns "minor" when return is next round (1 away)', () => {
    expect(inferSeverity('Round 9', 8)).toBe('minor');
  });

  it('returns "moderate" when return is 2-3 rounds away', () => {
    expect(inferSeverity('Round 10', 8)).toBe('moderate');
    expect(inferSeverity('Round 11', 8)).toBe('moderate');
  });

  it('returns "major" when return is 4+ rounds away', () => {
    expect(inferSeverity('Round 12', 8)).toBe('major');
    expect(inferSeverity('Round 17', 8)).toBe('major');
  });

  it('returns "major" for Indefinite/TBC/Trials', () => {
    expect(inferSeverity('Indefinite', 8)).toBe('major');
    expect(inferSeverity('TBC', 8)).toBe('major');
    expect(inferSeverity('Trials', 8)).toBe('major');
  });

  it('returns "major" when current round unknown', () => {
    expect(inferSeverity('Round 9', null)).toBe('major');
  });
});

describe('resolveTeamId', () => {
  it('maps standard nicknames', () => {
    expect(resolveTeamId('Broncos')).toBe('BRI');
    expect(resolveTeamId('Storm')).toBe('MEL');
    expect(resolveTeamId('Panthers')).toBe('PEN');
  });

  it('maps Sea Eagles → MAN', () => {
    expect(resolveTeamId('Sea Eagles')).toBe('MAN');
  });

  it('maps Wests Tigers → WST', () => {
    expect(resolveTeamId('Wests Tigers')).toBe('WST');
    expect(resolveTeamId('Tigers')).toBe('WST');
  });

  it('returns null for unknown nickname', () => {
    expect(resolveTeamId('Bunnies')).toBeNull();
  });
});

describe('resolveReturnDate', () => {
  function makePrisma(fixture: { kickoff: Date | null } | null) {
    return {
      fixture: {
        findFirst: vi.fn().mockResolvedValue(fixture),
      },
    } as unknown as PrismaClient;
  }

  it('returns YYYY-MM-DD of earliest fixture for the round', async () => {
    const prisma = makePrisma({ kickoff: new Date('2026-05-01T07:00:00Z') });
    const result = await resolveReturnDate(prisma, 'Round 9', '2026');
    expect(result).toBe('2026-05-01');
  });

  it('returns null when round has no fixtures', async () => {
    const prisma = makePrisma(null);
    const result = await resolveReturnDate(prisma, 'Round 9', '2026');
    expect(result).toBeNull();
  });

  it('returns null for non-round expectedReturn values', async () => {
    const prisma = makePrisma({ kickoff: new Date('2026-05-01T07:00:00Z') });
    expect(await resolveReturnDate(prisma, 'Indefinite', '2026')).toBeNull();
    expect(await resolveReturnDate(prisma, 'Next Season', '2026')).toBeNull();
  });
});

describe('scrapeCasualtyWard', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makePrisma() {
    return {
      injury: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({}),
      },
      round: {
        findFirst: vi.fn().mockResolvedValue({ number: 8 }),
      },
      fixture: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;
  }

  it('imports casualties and replaces existing casualty-ward rows', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        casualties: [
          {
            firstName: 'Cory',
            lastName: 'Paix',
            expectedReturn: 'Round 9',
            injury: 'Head knock',
            teamNickname: 'Broncos',
          },
          {
            firstName: 'Patrick',
            lastName: 'Carrigan',
            expectedReturn: 'Round 10',
            injury: 'Suspension',
            teamNickname: 'Broncos',
          },
        ],
      }),
    });
    const prisma = makePrisma();

    const result = await scrapeCasualtyWard(prisma, '2026');

    expect(prisma.injury.deleteMany).toHaveBeenCalledWith({ where: { source: 'casualty-ward' } });
    expect(prisma.injury.create).toHaveBeenCalledTimes(2);
    expect(result.recordsAffected).toBe(2);
    expect(result.errors).toHaveLength(0);

    const firstCall = (prisma.injury.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstCall.data).toMatchObject({
      teamId: 'BRI',
      playerName: 'Cory Paix',
      injuryType: 'Head knock',
      severity: 'minor',
      status: 'out',
      source: 'casualty-ward',
    });

    const secondCall = (prisma.injury.create as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(secondCall.data).toMatchObject({
      playerName: 'Patrick Carrigan',
      status: 'suspended',
      severity: 'moderate',
    });
  });

  it('skips entries with unknown team nicknames', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        casualties: [
          {
            firstName: 'Some',
            lastName: 'Player',
            expectedReturn: 'Round 9',
            injury: 'Hamstring',
            teamNickname: 'Bunnies',
          },
        ],
      }),
    });
    const prisma = makePrisma();

    const result = await scrapeCasualtyWard(prisma, '2026');

    expect(result.recordsAffected).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Bunnies');
    expect(prisma.injury.create).not.toHaveBeenCalled();
  });

  it('records error when fetch fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const prisma = makePrisma();

    const result = await scrapeCasualtyWard(prisma, '2026');

    expect(result.recordsAffected).toBe(0);
    expect(result.errors[0]).toContain('HTTP 500');
    expect(prisma.injury.deleteMany).not.toHaveBeenCalled();
  });
});
