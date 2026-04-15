/**
 * Unit tests for the scheduler — focuses on the tip-submission trigger paths.
 *
 * Key failure mode covered: Round 6 was never submitted because handleRoundSubmit
 * didn't scrape before submitting. If fixtures for the new round weren't in the DB
 * yet, predictRound returned [] → all games unmatched → "No tips to submit".
 *
 * The fix: handleRoundSubmit now calls scrapeCurrentRound + scrapeITipMatchStats
 * before submitTips, matching handlePreGameRescrape's behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// Mock all external service dependencies before importing scheduler
vi.mock('../itipfooty.js', () => ({
  submitTips: vi.fn(),
  isConfigured: vi.fn().mockReturnValue(true),
  scrapeITipMatchStats: vi.fn(),
}));

vi.mock('../scraper.js', () => ({
  scrapeCurrentRound: vi.fn(),
  scrapeAll: vi.fn(),
}));

import { handleRoundSubmit, tick } from '../scheduler.js';
import { submitTips, scrapeITipMatchStats, isConfigured } from '../itipfooty.js';
import { scrapeCurrentRound } from '../scraper.js';

// ---------------------------------------------------------------------------
// Shared mock Prisma
// ---------------------------------------------------------------------------

function makeMockPrisma(overrides: Partial<{
  recentSubmission: object | null;
  fixtures: object[];
  firstInRound: object | null;
}> = {}): PrismaClient {
  const {
    recentSubmission = null,
    fixtures = [],
    firstInRound = null,
  } = overrides;

  return {
    dataSourceLog: {
      findFirst: vi.fn().mockResolvedValue(recentSubmission),
      create: vi.fn().mockResolvedValue({}),
    },
    tipOverride: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    fixture: {
      findMany: vi.fn().mockResolvedValue(fixtures),
      findFirst: vi.fn().mockResolvedValue(firstInRound),
    },
  } as unknown as PrismaClient;
}

const SUBMIT_RESULT_SUCCESS = {
  success: true,
  round: 6,
  tips: [{ gameNumber: 1, homeTeam: 'Broncos', awayTeam: 'Roosters', pick: 'H', pickedTeam: 'Broncos', confidence: 'HIGH' }],
  message: 'Submitted 1 tips for Round 6',
  errors: [],
};

const SUBMIT_RESULT_NO_TIPS = {
  success: false,
  round: 6,
  tips: [],
  message: 'No tips to submit — all games locked or unmatched',
  errors: ['No prediction found for Broncos vs Roosters — run the scraper to populate this fixture'],
};

// ---------------------------------------------------------------------------
// handleRoundSubmit
// ---------------------------------------------------------------------------

describe('handleRoundSubmit()', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isConfigured).mockReturnValue(true);
  });

  it('calls scrapeCurrentRound before submitTips', async () => {
    const prisma = makeMockPrisma();

    const callOrder: string[] = [];
    vi.mocked(scrapeCurrentRound).mockImplementationOnce(async () => { callOrder.push('scrape'); });
    vi.mocked(submitTips).mockImplementationOnce(async () => { callOrder.push('submit'); return SUBMIT_RESULT_SUCCESS; });

    await handleRoundSubmit(prisma, 6);

    expect(callOrder).toEqual(['scrape', 'submit']);
  });

  it('calls scrapeITipMatchStats before submitTips', async () => {
    const prisma = makeMockPrisma();

    const callOrder: string[] = [];
    vi.mocked(scrapeCurrentRound).mockImplementationOnce(async () => { callOrder.push('scrape'); });
    vi.mocked(scrapeITipMatchStats).mockImplementationOnce(async () => { callOrder.push('itipmatch'); return { source: 'itipfooty', type: 'match-stats', recordsAffected: 0, errors: [], details: '' }; });
    vi.mocked(submitTips).mockImplementationOnce(async () => { callOrder.push('submit'); return SUBMIT_RESULT_SUCCESS; });

    await handleRoundSubmit(prisma, 6);

    expect(callOrder).toEqual(['scrape', 'itipmatch', 'submit']);
  });

  it('still submits even when scrapeCurrentRound throws', async () => {
    const prisma = makeMockPrisma();
    vi.mocked(scrapeCurrentRound).mockRejectedValueOnce(new Error('NRL API unavailable'));
    vi.mocked(submitTips).mockResolvedValueOnce(SUBMIT_RESULT_SUCCESS);

    await handleRoundSubmit(prisma, 6);

    // submitTips must still be called despite scrape failure
    expect(submitTips).toHaveBeenCalledOnce();
  });

  it('still submits even when scrapeITipMatchStats throws', async () => {
    const prisma = makeMockPrisma();
    vi.mocked(scrapeCurrentRound).mockResolvedValueOnce(undefined as never);
    vi.mocked(scrapeITipMatchStats).mockRejectedValueOnce(new Error('iTipFooty stats unavailable'));
    vi.mocked(submitTips).mockResolvedValueOnce(SUBMIT_RESULT_SUCCESS);

    await handleRoundSubmit(prisma, 6);

    expect(submitTips).toHaveBeenCalledOnce();
  });

  it('skips submitTips when a successful submission already exists within 7 days', async () => {
    const recentSubmission = {
      source: 'itipfooty-auto',
      status: 'success',
      message: 'Round 6: submitted',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60_000), // 3 days ago
    };
    const prisma = makeMockPrisma({ recentSubmission });

    await handleRoundSubmit(prisma, 6);

    expect(submitTips).not.toHaveBeenCalled();
    expect(scrapeCurrentRound).not.toHaveBeenCalled();
  });

  it('logs the submission result to DataSourceLog', async () => {
    const prisma = makeMockPrisma();
    vi.mocked(scrapeCurrentRound).mockResolvedValueOnce(undefined as never);
    vi.mocked(submitTips).mockResolvedValueOnce(SUBMIT_RESULT_SUCCESS);

    await handleRoundSubmit(prisma, 6);

    expect(prisma.dataSourceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'itipfooty-auto',
          status: 'success',
        }),
      })
    );
  });

  it('logs "partial" status when submitTips returns success with errors', async () => {
    const prisma = makeMockPrisma();
    vi.mocked(scrapeCurrentRound).mockResolvedValueOnce(undefined as never);
    vi.mocked(submitTips).mockResolvedValueOnce({
      ...SUBMIT_RESULT_SUCCESS,
      errors: ['Game 3 locked — skipping'],
    });

    await handleRoundSubmit(prisma, 6);

    expect(prisma.dataSourceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'itipfooty-auto',
          status: 'partial',
        }),
      })
    );
  });

  it('logs "error" status when submitTips returns success:false (no tips to submit)', async () => {
    const prisma = makeMockPrisma();
    vi.mocked(scrapeCurrentRound).mockResolvedValueOnce(undefined as never);
    vi.mocked(submitTips).mockResolvedValueOnce(SUBMIT_RESULT_NO_TIPS);

    await handleRoundSubmit(prisma, 6);

    expect(prisma.dataSourceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'itipfooty-auto',
          status: 'error',
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// tick() — scheduler polling core
// ---------------------------------------------------------------------------

describe('tick()', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isConfigured).mockReturnValue(true);
  });

  it('does nothing when no fixtures are in the T-60min window', async () => {
    const prisma = makeMockPrisma({ fixtures: [] });

    await tick(prisma);

    expect(submitTips).not.toHaveBeenCalled();
    expect(scrapeCurrentRound).not.toHaveBeenCalled();
  });

  it('calls handleRoundSubmit for the first game of a round', async () => {
    const kickoff = new Date(Date.now() + 60 * 60_000); // exactly 1h from now
    const fixture = { id: 'fix-1', roundId: 'r-6', kickoff, status: 'upcoming', round: { number: 6 } };

    const prisma = makeMockPrisma({
      fixtures: [fixture],
      firstInRound: fixture, // same fixture = it IS the first in round
    });

    vi.mocked(scrapeCurrentRound).mockResolvedValueOnce(undefined as never);
    vi.mocked(submitTips).mockResolvedValueOnce(SUBMIT_RESULT_SUCCESS);

    await tick(prisma);

    // scrapeCurrentRound should be called (handleRoundSubmit behaviour)
    expect(scrapeCurrentRound).toHaveBeenCalledOnce();
    expect(submitTips).toHaveBeenCalledOnce();
  });

  it('skips fixtures that are not the first kickoff in their round', async () => {
    const kickoff = new Date(Date.now() + 60 * 60_000);
    const fixture = { id: 'fix-2', roundId: 'r-6', kickoff, status: 'upcoming', round: { number: 6 } };
    const firstFixture = { id: 'fix-1', roundId: 'r-6', kickoff: new Date(kickoff.getTime() - 2 * 3600_000), status: 'upcoming' };

    const prisma = makeMockPrisma({
      fixtures: [fixture],
      firstInRound: firstFixture, // different from fixture = NOT the first in round
    });

    await tick(prisma);

    // No submission should happen for non-first games — pre-game resubmits were
    // removed because they risked clearing locked picks on iTipFooty.
    expect(scrapeCurrentRound).not.toHaveBeenCalled();
    expect(submitTips).not.toHaveBeenCalled();
    expect(prisma.dataSourceLog.create).not.toHaveBeenCalled();
  });

  it('does not re-submit after the round\'s first game has completed', async () => {
    // Regression: completed-game picks were getting cleared because the
    // firstInRound query excluded completed games, letting a later game in the
    // round masquerade as "first" and trigger a second submission.
    const game2Kickoff = new Date(Date.now() + 60 * 60_000);
    const game1Kickoff = new Date(game2Kickoff.getTime() - 2 * 3600_000);
    const game2 = { id: 'fix-2', roundId: 'r-6', kickoff: game2Kickoff, status: 'upcoming', round: { number: 6 } };
    const game1Completed = { id: 'fix-1', roundId: 'r-6', kickoff: game1Kickoff, status: 'completed' };

    const prisma = makeMockPrisma({
      fixtures: [game2],
      firstInRound: game1Completed, // the completed game IS still the first in round
    });

    await tick(prisma);

    expect(submitTips).not.toHaveBeenCalled();
    expect(scrapeCurrentRound).not.toHaveBeenCalled();
  });
});
