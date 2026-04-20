import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const injuryRoutes = Router();

// GET / - List injuries, filter by teamId
injuryRoutes.get('/', async (req, res) => {
  try {
    const { teamId } = req.query;
    const where: Record<string, unknown> = {};
    if (teamId) where.teamId = teamId as string;

    const injuries = await prisma.injury.findMany({
      where,
      include: { team: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(injuries);
  } catch (error) {
    console.error('Error fetching injuries:', error);
    res.status(500).json({ error: 'Failed to fetch injuries' });
  }
});

// POST / - Create injury
injuryRoutes.post('/', async (req, res) => {
  try {
    const { teamId, playerName, position, injuryType, severity, returnDate, status, notes } = req.body;

    if (!teamId || !playerName) {
      return res.status(400).json({ error: 'teamId and playerName are required' });
    }

    if (severity && !['minor', 'moderate', 'major', 'season-ending'].includes(severity)) {
      return res.status(400).json({ error: 'severity must be minor, moderate, major, or season-ending' });
    }

    if (status && !['out', 'suspended', 'doubtful', 'probable'].includes(status)) {
      return res.status(400).json({ error: 'status must be out, suspended, doubtful, or probable' });
    }

    const injury = await prisma.injury.create({
      data: { teamId, playerName, position, injuryType, severity, returnDate, status, notes },
      include: { team: true },
    });

    res.status(201).json(injury);
  } catch (error) {
    console.error('Error creating injury:', error);
    res.status(500).json({ error: 'Failed to create injury' });
  }
});

// PUT /:id - Update injury
injuryRoutes.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.injury.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Injury not found' });
    }

    const { playerName, position, injuryType, severity, returnDate, status, notes } = req.body;

    if (severity && !['minor', 'moderate', 'major', 'season-ending'].includes(severity)) {
      return res.status(400).json({ error: 'severity must be minor, moderate, major, or season-ending' });
    }

    if (status && !['out', 'suspended', 'doubtful', 'probable'].includes(status)) {
      return res.status(400).json({ error: 'status must be out, suspended, doubtful, or probable' });
    }

    const injury = await prisma.injury.update({
      where: { id: req.params.id },
      data: {
        ...(playerName !== undefined && { playerName }),
        ...(position !== undefined && { position }),
        ...(injuryType !== undefined && { injuryType }),
        ...(severity !== undefined && { severity }),
        ...(returnDate !== undefined && { returnDate }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
      },
      include: { team: true },
    });

    res.json(injury);
  } catch (error) {
    console.error('Error updating injury:', error);
    res.status(500).json({ error: 'Failed to update injury' });
  }
});

// DELETE /:id - Delete injury
injuryRoutes.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.injury.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Injury not found' });
    }

    await prisma.injury.delete({ where: { id: req.params.id } });
    res.json({ message: 'Injury deleted' });
  } catch (error) {
    console.error('Error deleting injury:', error);
    res.status(500).json({ error: 'Failed to delete injury' });
  }
});
