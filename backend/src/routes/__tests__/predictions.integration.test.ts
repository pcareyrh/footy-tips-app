import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb, destroyTestDb, seedForPredictions } from '../../test/helpers/db.js';

let testPrisma: PrismaClient;

vi.mock('../../lib/prisma.js', () => ({
  get prisma() { return testPrisma; },
}));

const { app } = await import('../../app.js');

beforeAll(async () => {
  testPrisma = createTestDb();
  await seedForPredictions(testPrisma);
});

afterAll(async () => {
  await destroyTestDb();
});

describe('GET /api/predictions', () => {
  it('returns 200 with predictions for upcoming fixtures', async () => {
    const res = await request(app).get('/api/predictions?season=2026&round=1');
    expect(res.status).toBe(200);
    expect(res.body.predictions).toHaveLength(1);
  });

  it('response has required top-level shape', async () => {
    const res = await request(app).get('/api/predictions?season=2026&round=1');
    expect(res.body).toMatchObject({
      season: expect.any(String),
      round: expect.any(Number),
      totalMatches: expect.any(Number),
      summary: expect.any(Array),
      predictions: expect.any(Array),
    });
  });

  it('each prediction has required fields', async () => {
    const res = await request(app).get('/api/predictions?season=2026&round=1');
    const pred = res.body.predictions[0];
    expect(pred).toMatchObject({
      fixtureId: expect.any(String),
      predictedWinner: expect.any(String),
      predictedWinnerId: expect.any(String),
      confidence: expect.stringMatching(/^(LOW|MEDIUM|HIGH|VERY HIGH)$/),
      confidenceScore: expect.any(Number),
      factors: expect.any(Array),
      summary: expect.any(String),
    });
  });

  it('each factor has name, favouring, weight, detail', async () => {
    const res = await request(app).get('/api/predictions?season=2026&round=1');
    const factors = res.body.predictions[0].factors;
    expect(factors.length).toBeGreaterThan(0);
    for (const factor of factors) {
      expect(factor).toMatchObject({
        name: expect.any(String),
        favouring: expect.any(String),
        weight: expect.any(Number),
        detail: expect.any(String),
      });
    }
  });

  it('returns empty predictions array for non-existent round', async () => {
    const res = await request(app).get('/api/predictions?season=2026&round=99');
    expect(res.status).toBe(200);
    expect(res.body.predictions).toHaveLength(0);
  });

  it('respects the ?round= query parameter', async () => {
    const res1 = await request(app).get('/api/predictions?season=2026&round=1');
    const res99 = await request(app).get('/api/predictions?season=2026&round=99');
    expect(res1.body.round).toBe(1);
    expect(res99.body.round).toBe(99);
  });
});
