import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { syncPickResults, scrapeCurrentRound } from '../scraper.js';

// Mock nrl-api module so we can intercept fetchDraw/fetchLadder calls
vi.mock('../nrl-api.js', () => ({
  fetchDraw: vi.fn().mockResolvedValue({ source: 'nrl.com/api', type: 'draw', recordsAffected: 0, errors: [], details: '' }),
  fetchLadder: vi.fn().mockResolvedValue({ source: 'nrl.com/api', type: 'ladder', recordsAffected: 0, errors: [], details: '' }),
}));

// ---------------------------------------------------------------------------
// syncPickResults — unit tests
// ---------------------------------------------------------------------------

describe('syncPickResults', () => {
  // Minimal mock prisma used in all tests
  function makePrisma(picks: Array<{
    id: string;
    pickedTeamId: string;
    result: string | null;
    fixture: {
      status: string;
      result: string | null;
      homeTeamId: string;
      awayTeamId: string;
    };
  }>) {
    const mockUpdate = vi.fn().mockResolvedValue({});
    const mockPrisma = {
      pick: {
        findMany: vi.fn().mockResolvedValue(picks),
        update: mockUpdate,
      },
    } as unknown as PrismaClient;
    return { mockPrisma, mockUpdate };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks pick as correct when picked team matches fixture result (home win)', async () => {
    const { mockPrisma, mockUpdate } = makePrisma([
      {
        id: 'pick-1',
        pickedTeamId: 'MEL',
        result: null,
        fixture: {
          status: 'completed',
          result: 'home',
          homeTeamId: 'MEL',
          awayTeamId: 'PEN',
        },
      },
    ]);

    await syncPickResults(mockPrisma);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'pick-1' },
      data: { result: 'correct' },
    });
  });

  it('marks pick as correct when picked team matches fixture result (away win)', async () => {
    const { mockPrisma, mockUpdate } = makePrisma([
      {
        id: 'pick-2',
        pickedTeamId: 'PEN',
        result: null,
        fixture: {
          status: 'completed',
          result: 'away',
          homeTeamId: 'MEL',
          awayTeamId: 'PEN',
        },
      },
    ]);

    await syncPickResults(mockPrisma);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'pick-2' },
      data: { result: 'correct' },
    });
  });

  it('marks pick as incorrect when picked team does not match fixture result', async () => {
    const { mockPrisma, mockUpdate } = makePrisma([
      {
        id: 'pick-3',
        pickedTeamId: 'PEN',
        result: null,
        fixture: {
          status: 'completed',
          result: 'home',  // home win, but we picked away team
          homeTeamId: 'MEL',
          awayTeamId: 'PEN',
        },
      },
    ]);

    await syncPickResults(mockPrisma);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'pick-3' },
      data: { result: 'incorrect' },
    });
  });

  it('marks pick as draw when fixture result is draw', async () => {
    const { mockPrisma, mockUpdate } = makePrisma([
      {
        id: 'pick-4',
        pickedTeamId: 'MEL',
        result: null,
        fixture: {
          status: 'completed',
          result: 'draw',
          homeTeamId: 'MEL',
          awayTeamId: 'PEN',
        },
      },
    ]);

    await syncPickResults(mockPrisma);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'pick-4' },
      data: { result: 'draw' },
    });
  });

  it('skips picks where fixture is not completed', async () => {
    const { mockPrisma, mockUpdate } = makePrisma([
      {
        id: 'pick-5',
        pickedTeamId: 'MEL',
        result: null,
        fixture: {
          status: 'upcoming',
          result: null,
          homeTeamId: 'MEL',
          awayTeamId: 'PEN',
        },
      },
    ]);

    await syncPickResults(mockPrisma);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('skips picks that already have a result (result is not null)', async () => {
    // The findMany query filters result: null, so already-decided picks won't be returned.
    // Verify that findMany is called with where: { result: null }
    const mockUpdate = vi.fn().mockResolvedValue({});
    const mockFindMany = vi.fn().mockResolvedValue([]);
    const mockPrisma = {
      pick: {
        findMany: mockFindMany,
        update: mockUpdate,
      },
    } as unknown as PrismaClient;

    await syncPickResults(mockPrisma);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { result: null },
      })
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('processes multiple picks in one call', async () => {
    const { mockPrisma, mockUpdate } = makePrisma([
      {
        id: 'pick-a',
        pickedTeamId: 'MEL',
        result: null,
        fixture: {
          status: 'completed',
          result: 'home',
          homeTeamId: 'MEL',
          awayTeamId: 'PEN',
        },
      },
      {
        id: 'pick-b',
        pickedTeamId: 'PEN',
        result: null,
        fixture: {
          status: 'completed',
          result: 'home',  // PEN picked but MEL won
          homeTeamId: 'MEL',
          awayTeamId: 'PEN',
        },
      },
      {
        id: 'pick-c',
        pickedTeamId: 'BRI',
        result: null,
        fixture: {
          status: 'upcoming',  // not completed — skip
          result: null,
          homeTeamId: 'BRI',
          awayTeamId: 'SYD',
        },
      },
    ]);

    await syncPickResults(mockPrisma);

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'pick-a' }, data: { result: 'correct' } });
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'pick-b' }, data: { result: 'incorrect' } });
  });
});

// ---------------------------------------------------------------------------
// scrapeCurrentRound — fetches previous round to catch stale upcoming fixtures
// ---------------------------------------------------------------------------

describe('scrapeCurrentRound', () => {
  function makePrisma() {
    return {
      round: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({}),
      },
      pick: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaClient;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches both the current round and the previous round', async () => {
    // NRL API returns selectedRoundId: 5
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ selectedRoundId: 5 }),
    } as Response);

    const { fetchDraw, fetchLadder } = await import('../nrl-api.js');
    const mockFetchDraw = vi.mocked(fetchDraw);
    const mockFetchLadder = vi.mocked(fetchLadder);

    const prisma = makePrisma();
    await scrapeCurrentRound(prisma, 2026);

    // Should scrape round 4 (previous) and round 5 (current)
    expect(mockFetchDraw).toHaveBeenCalledWith(prisma, 2026, 4);
    expect(mockFetchDraw).toHaveBeenCalledWith(prisma, 2026, 5);
    expect(mockFetchDraw).toHaveBeenCalledTimes(2);
    expect(mockFetchLadder).toHaveBeenCalledWith(prisma, 2026);
  });

  it('does not fetch a previous round when current round is 1', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ selectedRoundId: 1 }),
    } as Response);

    const { fetchDraw } = await import('../nrl-api.js');
    const mockFetchDraw = vi.mocked(fetchDraw);

    const prisma = makePrisma();
    await scrapeCurrentRound(prisma, 2026);

    // Only round 1 — no previous round to fetch
    expect(mockFetchDraw).toHaveBeenCalledWith(prisma, 2026, 1);
    expect(mockFetchDraw).toHaveBeenCalledTimes(1);
  });
});
