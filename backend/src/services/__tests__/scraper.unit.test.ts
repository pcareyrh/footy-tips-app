import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { syncPickResults } from '../scraper.js';

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
