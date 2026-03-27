import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { SCRAPE_SCHEDULE_KEY, SCRAPE_SCHEDULE_OPTIONS, updateScrapeSchedule } from '../services/scheduler.js';

export const settingsRoutes = Router();

// GET / — return all app settings as a key-value object
settingsRoutes.get('/', async (_req, res) => {
  try {
    const rows = await prisma.appSetting.findMany();
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    // Include schedule options so the UI knows what's available
    res.json({
      settings,
      scrapeScheduleOptions: Object.entries(SCRAPE_SCHEDULE_OPTIONS).map(([value, opt]) => ({
        value,
        label: opt.label,
      })),
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /:key — upsert a single setting
settingsRoutes.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'value is required' });
    }

    const setting = await prisma.appSetting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });

    // Apply side-effects for known settings
    if (key === SCRAPE_SCHEDULE_KEY) {
      if (!(value in SCRAPE_SCHEDULE_OPTIONS)) {
        return res.status(400).json({
          error: `Invalid schedule. Valid options: ${Object.keys(SCRAPE_SCHEDULE_OPTIONS).join(', ')}`,
        });
      }
      updateScrapeSchedule(value);
    }

    res.json(setting);
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});
