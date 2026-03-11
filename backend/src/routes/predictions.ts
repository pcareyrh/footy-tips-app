import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { predictRound } from '../services/analysis.js';

export const predictionsRoutes = Router();

// GET /api/predictions — predictions for the upcoming round
// Query: ?season=2026&round=1
predictionsRoutes.get('/', async (req, res) => {
  try {
    const season = (req.query.season as string) ?? '2026';
    const round = req.query.round ? parseInt(req.query.round as string, 10) : undefined;

    const predictions = await predictRound(prisma, season, round);

    // Determine the actual round number from the first prediction's fixture
    let actualRound = round ?? null;
    if (!actualRound && predictions.length > 0) {
      const fixture = await prisma.fixture.findUnique({
        where: { id: predictions[0].fixtureId },
        include: { round: true },
      });
      actualRound = fixture?.round?.number ?? null;
    }

    const summary = predictions.map(p => ({
      match: `${p.homeTeam.name} v ${p.awayTeam.name}`,
      venue: p.venue,
      pick: p.predictedWinner,
      pickTeamId: p.predictedWinnerId,
      confidence: p.confidence,
      confidenceScore: p.confidenceScore,
    }));

    res.json({
      season,
      round: actualRound,
      totalMatches: predictions.length,
      summary,
      predictions,
    });
  } catch (err) {
    console.error('Prediction error:', err);
    res.status(500).json({ error: 'Failed to generate predictions', message: err instanceof Error ? err.message : String(err) });
  }
});
