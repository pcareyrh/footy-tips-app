import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const fixtureRoutes = Router();

// GET / - List fixtures with optional filters
fixtureRoutes.get('/', async (req, res) => {
  try {
    const { roundId, season, status, current } = req.query;

    const where: Record<string, unknown> = {};
    if (roundId) where.roundId = roundId as string;
    if (status) where.status = status as string;
    if (current === 'true') {
      where.round = { isCurrent: true };
    } else if (season) {
      where.round = { season: { year: parseInt(season as string, 10) } };
    }

    const fixtures = await prisma.fixture.findMany({
      where,
      include: {
        homeTeam: true,
        awayTeam: true,
        round: true,
      },
      orderBy: { kickoff: 'asc' },
    });

    res.json(fixtures);
  } catch (error) {
    console.error('Error fetching fixtures:', error);
    res.status(500).json({ error: 'Failed to fetch fixtures' });
  }
});

// GET /:id - Single fixture with teams and picks
fixtureRoutes.get('/:id', async (req, res) => {
  try {
    const fixture = await prisma.fixture.findUnique({
      where: { id: req.params.id },
      include: {
        homeTeam: true,
        awayTeam: true,
        round: true,
        picks: { include: { pickedTeam: true } },
      },
    });

    if (!fixture) {
      return res.status(404).json({ error: 'Fixture not found' });
    }

    res.json(fixture);
  } catch (error) {
    console.error('Error fetching fixture:', error);
    res.status(500).json({ error: 'Failed to fetch fixture' });
  }
});

// POST / - Create fixture
fixtureRoutes.post('/', async (req, res) => {
  try {
    const { roundId, homeTeamId, awayTeamId, venue, kickoff, referee } = req.body;

    if (!roundId || !homeTeamId || !awayTeamId) {
      return res.status(400).json({ error: 'roundId, homeTeamId, and awayTeamId are required' });
    }

    const fixture = await prisma.fixture.create({
      data: {
        roundId,
        homeTeamId,
        awayTeamId,
        venue,
        kickoff: kickoff ? new Date(kickoff) : undefined,
        referee,
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        round: true,
      },
    });

    res.status(201).json(fixture);
  } catch (error) {
    console.error('Error creating fixture:', error);
    res.status(500).json({ error: 'Failed to create fixture' });
  }
});

// PUT /:id - Update fixture result
fixtureRoutes.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.fixture.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Fixture not found' });
    }

    const { homeScore, awayScore, result, status, venue, kickoff, referee } = req.body;

    const fixture = await prisma.fixture.update({
      where: { id: req.params.id },
      data: {
        ...(homeScore !== undefined && { homeScore }),
        ...(awayScore !== undefined && { awayScore }),
        ...(result !== undefined && { result }),
        ...(status !== undefined && { status }),
        ...(venue !== undefined && { venue }),
        ...(kickoff !== undefined && { kickoff: new Date(kickoff) }),
        ...(referee !== undefined && { referee }),
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        round: true,
      },
    });

    res.json(fixture);
  } catch (error) {
    console.error('Error updating fixture:', error);
    res.status(500).json({ error: 'Failed to update fixture' });
  }
});
