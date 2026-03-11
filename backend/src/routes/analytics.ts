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
        if (pick.result === firstResult) {
          count++;
        } else {
          break;
        }
      }
      streak = firstResult === 'correct' ? `W${count}` : `L${count}`;
    }

    res.json({
      totalPicks,
      correctPicks,
      incorrectPicks,
      pendingPicks,
      accuracy: Math.round(accuracy * 100) / 100,
      streak,
    });
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    res.status(500).json({ error: 'Failed to fetch analytics summary' });
  }
});

// GET /by-factor - Accuracy breakdown by confidence level
analyticsRoutes.get('/by-factor', async (_req, res) => {
  try {
    const confidenceLevels = ['low', 'medium', 'high'];
    const results = [];

    for (const level of confidenceLevels) {
      const total = await prisma.pick.count({
        where: { confidence: level, result: { not: null } },
      });
      const correct = await prisma.pick.count({
        where: { confidence: level, result: 'correct' },
      });
      const accuracy = total > 0 ? (correct / total) * 100 : 0;

      results.push({
        confidence: level,
        total,
        correct,
        incorrect: total - correct,
        accuracy: Math.round(accuracy * 100) / 100,
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
          teamName: team.name,
          shortName: team.shortName,
          total,
          correct,
          incorrect: total - correct,
          accuracy: Math.round(accuracy * 100) / 100,
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
