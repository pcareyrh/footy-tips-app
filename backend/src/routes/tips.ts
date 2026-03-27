import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { predictRound } from '../services/analysis.js';
import { submitTips, isConfigured } from '../services/itipfooty.js';

export const tipsRoutes = Router();

// ---------------------------------------------------------------------------
// GET /api/tips/current-round
// Returns predictions for the current round merged with any stored overrides.
// ---------------------------------------------------------------------------
tipsRoutes.get('/current-round', async (_req, res) => {
  try {
    const season = String(new Date().getFullYear());
    const predictions = await predictRound(prisma, season);

    if (predictions.length === 0) {
      return res.json({ round: null, season, predictions: [] });
    }

    // Load all overrides keyed by fixtureId
    const overrides = await prisma.tipOverride.findMany();
    const overrideMap = new Map(overrides.map((o) => [o.fixtureId, o.winnerId]));

    const enriched = predictions.map((p) => {
      const override = overrideMap.get(p.fixtureId) ?? null;
      return {
        fixtureId: p.fixtureId,
        kickoff: null, // not in MatchPrediction — enriched below
        homeTeam: { id: p.homeTeam.id, name: p.homeTeam.name },
        awayTeam: { id: p.awayTeam.id, name: p.awayTeam.name },
        venue: p.venue,
        predictedWinnerId: p.predictedWinnerId,
        predictedWinner: p.predictedWinner,
        confidence: p.confidence,
        confidenceScore: p.confidenceScore,
        override: override ? { winnerId: override } : null,
        effectivePickId: override ?? p.predictedWinnerId,
      };
    });

    // Enrich with kickoff times from the fixture table
    const fixtureIds = enriched.map((e) => e.fixtureId);
    const fixtures = await prisma.fixture.findMany({
      where: { id: { in: fixtureIds } },
      select: { id: true, kickoff: true, roundId: true },
    });
    const kickoffMap = new Map(fixtures.map((f) => [f.id, f.kickoff]));
    const roundId = fixtures[0]?.roundId ?? '';
    const roundNum = parseInt(roundId.split('-R')[1] ?? '0', 10);

    for (const p of enriched) {
      (p as any).kickoff = kickoffMap.get(p.fixtureId) ?? null;
    }

    return res.json({ round: roundNum, season, predictions: enriched });
  } catch (err) {
    console.error('tips/current-round error:', err);
    return res.status(500).json({ error: 'Failed to load current round' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/tips/overrides
// ---------------------------------------------------------------------------
tipsRoutes.get('/overrides', async (_req, res) => {
  const overrides = await prisma.tipOverride.findMany({
    include: { fixture: { select: { homeTeamId: true, awayTeamId: true, roundId: true } } },
  });
  res.json(overrides);
});

// ---------------------------------------------------------------------------
// PUT /api/tips/overrides/:fixtureId   { winnerId }
// ---------------------------------------------------------------------------
tipsRoutes.put('/overrides/:fixtureId', async (req, res) => {
  const { fixtureId } = req.params;
  const { winnerId } = req.body as { winnerId: string };

  if (!winnerId) return res.status(400).json({ error: 'winnerId is required' });

  const override = await prisma.tipOverride.upsert({
    where: { fixtureId },
    update: { winnerId },
    create: { fixtureId, winnerId },
  });
  res.json(override);
});

// ---------------------------------------------------------------------------
// DELETE /api/tips/overrides/:fixtureId
// ---------------------------------------------------------------------------
tipsRoutes.delete('/overrides/:fixtureId', async (req, res) => {
  const { fixtureId } = req.params;
  try {
    await prisma.tipOverride.delete({ where: { fixtureId } });
  } catch {
    // Already deleted — idempotent
  }
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// GET /api/tips/schedule
// Returns upcoming auto-submit event times so the UI can display them.
// ---------------------------------------------------------------------------
tipsRoutes.get('/schedule', async (_req, res) => {
  const now = new Date();

  const upcoming = await prisma.fixture.findMany({
    where: {
      kickoff: { gt: now },
      status: 'upcoming',
    },
    include: { round: true },
    orderBy: { kickoff: 'asc' },
    take: 100,
  });

  // Group fixtures by round
  const rounds = new Map<string, typeof upcoming>();
  for (const f of upcoming) {
    if (!rounds.has(f.roundId)) rounds.set(f.roundId, []);
    rounds.get(f.roundId)!.push(f);
  }

  const schedule = Array.from(rounds.entries()).map(([roundId, fixtures]) => {
    const first = fixtures[0];
    return {
      roundId,
      roundNumber: first.round.number,
      firstGameKickoff: first.kickoff,
      roundSubmitAt: first.kickoff
        ? new Date(first.kickoff.getTime() - 60 * 60_000)
        : null,
      games: fixtures.map((f) => ({
        fixtureId: f.id,
        kickoff: f.kickoff,
        preGameScrapeAt: f.kickoff
          ? new Date(f.kickoff.getTime() - 60 * 60_000)
          : null,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
      })),
    };
  });

  res.json(schedule);
});

// ---------------------------------------------------------------------------
// GET /api/tips/history
// Recent iTipFooty submission logs (manual + auto).
// ---------------------------------------------------------------------------
tipsRoutes.get('/history', async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10), 50);
  const logs = await prisma.dataSourceLog.findMany({
    where: { source: { in: ['itipfooty', 'itipfooty-auto'] } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json(logs);
});

// ---------------------------------------------------------------------------
// POST /api/tips/submit   { round?: number }
// Manual submit from the Tips page — reads overrides from DB automatically.
// ---------------------------------------------------------------------------
tipsRoutes.post('/submit', async (req, res) => {
  if (!isConfigured()) {
    return res.status(400).json({
      error: 'iTipFooty not configured. Set ITIPFOOTY_USERNAME, ITIPFOOTY_PASSWORD, ITIPFOOTY_COMP_ID in backend/.env',
    });
  }

  const round = req.body?.round ? parseInt(String(req.body.round), 10) : undefined;

  const overrides = await prisma.tipOverride.findMany({
    include: { fixture: true },
  });
  const picks = overrides.map((o) => ({
    homeTeamId: o.fixture.homeTeamId,
    awayTeamId: o.fixture.awayTeamId,
    winnerId: o.winnerId,
  }));

  const result = await submitTips(prisma, round, picks);
  res.json(result);
});
