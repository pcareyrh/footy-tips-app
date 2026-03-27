import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb, destroyTestDb, seedMinimal } from '../../test/helpers/db.js';

let testPrisma: PrismaClient;

vi.mock('../../lib/prisma.js', () => ({
  get prisma() { return testPrisma; },
}));

// Mock scheduler to avoid starting real cron jobs
vi.mock('../../services/scheduler.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/scheduler.js')>();
  return {
    ...actual,
    updateScrapeSchedule: vi.fn(),
  };
});

const { app } = await import('../../app.js');

beforeAll(async () => {
  testPrisma = createTestDb();
  await seedMinimal(testPrisma);
});

afterAll(async () => {
  await destroyTestDb();
});

// ---------------------------------------------------------------------------
// GET /api/settings
// ---------------------------------------------------------------------------
describe('GET /api/settings', () => {
  it('returns { settings, scrapeScheduleOptions }', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('settings');
    expect(res.body).toHaveProperty('scrapeScheduleOptions');
    expect(typeof res.body.settings).toBe('object');
    expect(Array.isArray(res.body.scrapeScheduleOptions)).toBe(true);
  });

  it('scrapeScheduleOptions contains expected values: off, 1h, 6h, 12h, daily', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    const values = res.body.scrapeScheduleOptions.map((o: { value: string }) => o.value);
    expect(values).toContain('off');
    expect(values).toContain('1h');
    expect(values).toContain('6h');
    expect(values).toContain('12h');
    expect(values).toContain('daily');
  });

  it('each scrapeScheduleOption has value and label', async () => {
    const res = await request(app).get('/api/settings');
    for (const opt of res.body.scrapeScheduleOptions) {
      expect(opt).toHaveProperty('value');
      expect(opt).toHaveProperty('label');
      expect(typeof opt.value).toBe('string');
      expect(typeof opt.label).toBe('string');
    }
  });

  it('settings is empty object initially', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// PUT /api/settings/:key
// ---------------------------------------------------------------------------
describe('PUT /api/settings/scrape_schedule', () => {
  it('returns 400 when value is missing', async () => {
    const res = await request(app)
      .put('/api/settings/scrape_schedule')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when value is invalid', async () => {
    const res = await request(app)
      .put('/api/settings/scrape_schedule')
      .send({ value: 'invalid_option' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('Invalid schedule');
  });

  it('returns 200 with setting when value is "off"', async () => {
    const res = await request(app)
      .put('/api/settings/scrape_schedule')
      .send({ value: 'off' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      key: 'scrape_schedule',
      value: 'off',
    });
  });

  it('returns 200 with setting when value is "6h"', async () => {
    const res = await request(app)
      .put('/api/settings/scrape_schedule')
      .send({ value: '6h' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      key: 'scrape_schedule',
      value: '6h',
    });
  });

  it('persists — GET /api/settings returns the updated value', async () => {
    await request(app)
      .put('/api/settings/scrape_schedule')
      .send({ value: '12h' });

    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings.scrape_schedule).toBe('12h');
  });
});

describe('PUT /api/settings/:key with arbitrary key', () => {
  it('returns 400 when value is missing', async () => {
    const res = await request(app)
      .put('/api/settings/some_key')
      .send({});
    expect(res.status).toBe(400);
  });

  it('stores arbitrary key-value pairs', async () => {
    const res = await request(app)
      .put('/api/settings/some_key')
      .send({ value: 'some_value' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ key: 'some_key', value: 'some_value' });
  });
});
