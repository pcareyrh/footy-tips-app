import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const analyticsRoutes = Router();

// GET /summary - Overall stats: total picks, accuracy, streak
analyticsRoutes.get('/summary', async (_req, res) => {
  try {
    const totalPicks = await prisma.pick.count();
    const correctPicks = await prisma.pick.count({ where: { result: 'correct' } });
    const incorrectPicks = await prisma.pick.count({ where: { result: 'incorrect' } });
    const pendingPicks = await prisma.pick.count({ where: { result: null } });

    const decided = correctPicks + incorrectPicks;
    const accuracy = decided > 0 ? (correctPicks / decided) * 100 : 0;

    // Calculate current streak
    const recentPicks = await prisma.pick.findMany({
      where: { result: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { result: true },
    });

    let streak = '';
    if (recentPicks.length > 0) {
      const firstResult = recentPicks[0].result;
      let count = 0;
      for (const pick of recentPicks) {
        if (pick.result === firstResult) count++;
        else break;
      }
      streak = firstResult === 'correct' ? `W${count}` : `L${count}`;
    }

    // Best confidence level by accuracy
    const confidenceLevels = ['low', 'medium', 'high', 'very high'];
    let bestFactor = '—';
    let bestAcc = -1;
    for (const level of confidenceLevels) {
      const total = await prisma.pick.count({ where: { confidence: level, result: { not: null } } });
      const correct = await prisma.pick.count({ where: { confidence: level, result: 'correct' } });
      if (total > 0) {
        const acc = correct / total;
        if (acc > bestAcc) { bestAcc = acc; bestFactor = level; }
      }
    }

    res.json({
      totalPicks,
      correctPicks,
      incorrectPicks,
      pendingPicks,
      accuracy: Math.round(accuracy * 100) / 100,
      streak,
      bestFactor,
    });
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    res.status(500).json({ error: 'Failed to fetch analytics summary' });
  }
});

// GET /by-round - Round-by-round tip accuracy
analyticsRoutes.get('/by-round', async (_req, res) => {
  try {
    const picks = await prisma.pick.findMany({
      where: { result: { not: null } },
      include: { fixture: { select: { roundId: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const rounds = new Map<string, { correct: number; total: number }>();
    for (const pick of picks) {
      const roundId = pick.fixture.roundId;
      if (!rounds.has(roundId)) rounds.set(roundId, { correct: 0, total: 0 });
      const entry = rounds.get(roundId)!;
      entry.total++;
      if (pick.result === 'correct') entry.correct++;
    }

    const result = Array.from(rounds.entries())
      .map(([roundId, { correct, total }]) => {
        const parts = roundId.split('-R');
        const roundNum = parseInt(parts[1] ?? '0', 10);
        return {
          roundId,
          round: roundNum,
          correct,
          total,
          incorrect: total - correct,
          accuracy: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => a.round - b.round);

    res.json(result);
  } catch (error) {
    console.error('Error fetching analytics by round:', error);
    res.status(500).json({ error: 'Failed to fetch analytics by round' });
  }
});

// GET /by-factor - Accuracy breakdown by confidence level
analyticsRoutes.get('/by-factor', async (_req, res) => {
  try {
    const confidenceLevels = ['low', 'medium', 'high', 'very high'];
    const results = [];

    for (const level of confidenceLevels) {
      const total = await prisma.pick.count({
        where: { confidence: level, result: { not: null } },
      });
      const correct = await prisma.pick.count({
        where: { confidence: level, result: 'correct' },
      });
      if (total === 0) continue;
      const accuracy = (correct / total) * 100;
      results.push({
        name: level.charAt(0).toUpperCase() + level.slice(1),
        confidence: level,
        total,
        correct,
        incorrect: total - correct,
        accuracy: Math.round(accuracy * 10) / 10,
      });
    }

    res.json(results);
  } catch (error) {
    console.error('Error fetching analytics by factor:', error);
    res.status(500).json({ error: 'Failed to fetch analytics by factor' });
  }
});

// GET /by-team - Accuracy per team picked
analyticsRoutes.get('/by-team', async (_req, res) => {
  try {
    const teams = await prisma.team.findMany({ orderBy: { name: 'asc' } });
    const results = [];

    for (const team of teams) {
      const total = await prisma.pick.count({
        where: { pickedTeamId: team.id, result: { not: null } },
      });
      const correct = await prisma.pick.count({
        where: { pickedTeamId: team.id, result: 'correct' },
      });

      if (total > 0) {
        const accuracy = (correct / total) * 100;
        results.push({
          teamId: team.id,
          name: team.shortName,
          teamName: team.name,
          total,
          correct,
          incorrect: total - correct,
          accuracy: Math.round(accuracy * 10) / 10,
        });
      }
    }

    results.sort((a, b) => b.accuracy - a.accuracy);
    res.json(results);
  } catch (error) {
    console.error('Error fetching analytics by team:', error);
    res.status(500).json({ error: 'Failed to fetch analytics by team' });
  }
});
