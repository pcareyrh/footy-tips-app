import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const pickRoutes = Router();

// GET / - List picks with optional filter by fixtureId
pickRoutes.get('/', async (req, res) => {
  try {
    const { fixtureId } = req.query;
    const where: Record<string, unknown> = {};
    if (fixtureId) where.fixtureId = fixtureId as string;

    const picks = await prisma.pick.findMany({
      where,
      include: {
        fixture: { include: { homeTeam: true, awayTeam: true } },
        pickedTeam: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(picks);
  } catch (error) {
    console.error('Error fetching picks:', error);
    res.status(500).json({ error: 'Failed to fetch picks' });
  }
});

// POST / - Create a pick
pickRoutes.post('/', async (req, res) => {
  try {
    const { fixtureId, pickedTeamId, confidence, reasoning, factors } = req.body;

    if (!fixtureId || !pickedTeamId) {
      return res.status(400).json({ error: 'fixtureId and pickedTeamId are required' });
    }

    if (confidence && !['low', 'medium', 'high'].includes(confidence)) {
      return res.status(400).json({ error: 'confidence must be low, medium, or high' });
    }

    const pick = await prisma.pick.create({
      data: {
        fixtureId,
        pickedTeamId,
        confidence: confidence || 'medium',
        reasoning,
        factors,
      },
      include: {
        fixture: { include: { homeTeam: true, awayTeam: true } },
        pickedTeam: true,
      },
    });

    res.status(201).json(pick);
  } catch (error) {
    console.error('Error creating pick:', error);
    res.status(500).json({ error: 'Failed to create pick' });
  }
});

// PUT /:id - Update a pick
pickRoutes.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.pick.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Pick not found' });
    }

    const { pickedTeamId, confidence, reasoning, factors, result } = req.body;

    if (confidence && !['low', 'medium', 'high'].includes(confidence)) {
      return res.status(400).json({ error: 'confidence must be low, medium, or high' });
    }

    if (result && !['correct', 'incorrect'].includes(result)) {
      return res.status(400).json({ error: 'result must be correct or incorrect' });
    }

    const pick = await prisma.pick.update({
      where: { id: req.params.id },
      data: {
        ...(pickedTeamId !== undefined && { pickedTeamId }),
        ...(confidence !== undefined && { confidence }),
        ...(reasoning !== undefined && { reasoning }),
        ...(factors !== undefined && { factors }),
        ...(result !== undefined && { result }),
      },
      include: {
        fixture: { include: { homeTeam: true, awayTeam: true } },
        pickedTeam: true,
      },
    });

    res.json(pick);
  } catch (error) {
    console.error('Error updating pick:', error);
    res.status(500).json({ error: 'Failed to update pick' });
  }
});

// DELETE /:id - Delete a pick
pickRoutes.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.pick.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Pick not found' });
    }

    await prisma.pick.delete({ where: { id: req.params.id } });
    res.json({ message: 'Pick deleted' });
  } catch (error) {
    console.error('Error deleting pick:', error);
    res.status(500).json({ error: 'Failed to delete pick' });
  }
});
