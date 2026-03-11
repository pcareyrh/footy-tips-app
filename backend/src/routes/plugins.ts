import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const pluginRoutes = Router();

// GET / - List all plugins
pluginRoutes.get('/', async (_req, res) => {
  try {
    const plugins = await prisma.pluginConfig.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(plugins);
  } catch (error) {
    console.error('Error fetching plugins:', error);
    res.status(500).json({ error: 'Failed to fetch plugins' });
  }
});

// POST / - Register a plugin
pluginRoutes.post('/', async (req, res) => {
  try {
    const { id, name, type, enabled, config, schedule } = req.body;

    if (!id || !name || !type) {
      return res.status(400).json({ error: 'id, name, and type are required' });
    }

    if (!['data-source', 'analysis', 'ui'].includes(type)) {
      return res.status(400).json({ error: 'type must be data-source, analysis, or ui' });
    }

    const plugin = await prisma.pluginConfig.create({
      data: {
        id,
        name,
        type,
        enabled: enabled ?? true,
        config,
        schedule,
      },
    });

    res.status(201).json(plugin);
  } catch (error) {
    console.error('Error creating plugin:', error);
    res.status(500).json({ error: 'Failed to create plugin' });
  }
});

// PUT /:id - Update plugin config/enable/disable
pluginRoutes.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.pluginConfig.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Plugin not found' });
    }

    const { name, enabled, config, schedule } = req.body;

    const plugin = await prisma.pluginConfig.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(enabled !== undefined && { enabled }),
        ...(config !== undefined && { config }),
        ...(schedule !== undefined && { schedule }),
      },
    });

    res.json(plugin);
  } catch (error) {
    console.error('Error updating plugin:', error);
    res.status(500).json({ error: 'Failed to update plugin' });
  }
});

// DELETE /:id - Delete a plugin
pluginRoutes.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.pluginConfig.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: 'Plugin not found' });
    }

    await prisma.pluginConfig.delete({ where: { id: req.params.id } });
    res.json({ message: 'Plugin deleted' });
  } catch (error) {
    console.error('Error deleting plugin:', error);
    res.status(500).json({ error: 'Failed to delete plugin' });
  }
});
