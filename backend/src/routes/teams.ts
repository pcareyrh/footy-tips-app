import { Router } from 'express';
import { prisma } from '../server.js';

export const teamRoutes = Router();

// GET / - List all teams
teamRoutes.get('/', async (_req, res) => {
  try {
    const teams = await prisma.team.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// GET /:id - Single team with stats
teamRoutes.get('/:id', async (req, res) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: {
        stats: { orderBy: { createdAt: 'desc' }, take: 1 },
        injuries: { where: { status: { not: 'recovered' } } },
        ladderEntries: { orderBy: { round: 'desc' }, take: 1 },
      },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json(team);
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});
