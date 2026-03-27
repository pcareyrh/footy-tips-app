import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb, destroyTestDb, seedMinimal } from '../../test/helpers/db.js';

let testPrisma: PrismaClient;

vi.mock('../../lib/prisma.js', () => ({
  get prisma() { return testPrisma; },
}));

// Mock analysis to avoid needing full prediction data in test db
vi.mock('../../services/analysis.js', () => ({
  predictRound: vi.fn().mockResolvedValue([]),
}));

const { app } = await import('../../app.js');

beforeAll(async () => {
  testPrisma = createTestDb();
  await seedMinimal(testPrisma);
});

afterAll(async () => {
  await destroyTestDb();
});

// ---------------------------------------------------------------------------
// GET /api/tips/current-round
// ---------------------------------------------------------------------------
describe('GET /api/tips/current-round', () => {
  it('returns { round, season, predictions } shape', async () => {
    const res = await request(app).get('/api/tips/current-round');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      round: null,
      season: expect.any(String),
      predictions: expect.any(Array),
    });
  });

  it('returns empty predictions when predictRound returns empty array', async () => {
    const res = await request(app).get('/api/tips/current-round');
    expect(res.status).toBe(200);
    expect(res.body.predictions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/tips/overrides/:fixtureId
// ---------------------------------------------------------------------------
describe('PUT /api/tips/overrides/:fixtureId', () => {
  it('returns 400 when winnerId is missing', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const res = await request(app)
      .put(`/api/tips/overrides/${fixtures[0].id}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('creates an override and returns it', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const fixture = fixtures[0];
    const res = await request(app)
      .put(`/api/tips/overrides/${fixture.id}`)
      .send({ winnerId: 'MEL' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fixtureId: fixture.id,
      winnerId: 'MEL',
    });
  });

  it('upserts — updates existing override', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const fixture = fixtures[0];
    // First create
    await request(app)
      .put(`/api/tips/overrides/${fixture.id}`)
      .send({ winnerId: 'MEL' });
    // Then update
    const res = await request(app)
      .put(`/api/tips/overrides/${fixture.id}`)
      .send({ winnerId: 'PEN' });
    expect(res.status).toBe(200);
    expect(res.body.winnerId).toBe('PEN');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/tips/overrides/:fixtureId
// ---------------------------------------------------------------------------
describe('DELETE /api/tips/overrides/:fixtureId', () => {
  it('removes override and returns 204', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const fixture = fixtures[0];
    // Ensure it exists first
    await request(app)
      .put(`/api/tips/overrides/${fixture.id}`)
      .send({ winnerId: 'MEL' });

    const res = await request(app).delete(`/api/tips/overrides/${fixture.id}`);
    expect(res.status).toBe(204);
  });

  it('is idempotent — still returns 204 when override does not exist', async () => {
    // Delete again (already deleted above)
    const fixtures = await testPrisma.fixture.findMany();
    const res = await request(app).delete(`/api/tips/overrides/${fixtures[0].id}`);
    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// GET /api/tips/schedule
// ---------------------------------------------------------------------------
describe('GET /api/tips/schedule', () => {
  it('returns an array', async () => {
    const res = await request(app).get('/api/tips/schedule');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns empty array when no upcoming fixtures with kickoff exist', async () => {
    // seedMinimal creates a fixture with no kickoff date set (null), so it won't appear
    const res = await request(app).get('/api/tips/schedule');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/tips/history
// ---------------------------------------------------------------------------
describe('GET /api/tips/history', () => {
  it('returns empty array when no submission logs exist', async () => {
    const res = await request(app).get('/api/tips/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('respects the limit query param', async () => {
    // Seed some data source logs
    await testPrisma.dataSourceLog.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        source: 'itipfooty',
        status: 'success',
        message: `Submission ${i + 1}`,
        recordsAffected: 1,
      })),
    });

    const res = await request(app).get('/api/tips/history?limit=5');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
  });

  it('defaults to 20 entries when no limit specified', async () => {
    // We already have 10 logs from above; add 15 more (25 total)
    await testPrisma.dataSourceLog.createMany({
      data: Array.from({ length: 15 }, (_, i) => ({
        source: 'itipfooty',
        status: 'success',
        message: `Submission extra ${i + 1}`,
        recordsAffected: 1,
      })),
    });

    const res = await request(app).get('/api/tips/history');
    expect(res.status).toBe(200);
    // Default limit is 20
    expect(res.body.length).toBeLessThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tips/submit
// ---------------------------------------------------------------------------
describe('POST /api/tips/submit', () => {
  it('returns 400 when iTipFooty is not configured', async () => {
    // In test env, ITIPFOOTY_USERNAME etc. are set in vitest.config.ts
    // but we need to verify the route checks isConfigured()
    // Since the test environment may have them set, we temporarily unset
    const origUser = process.env.ITIPFOOTY_USERNAME;
    const origPass = process.env.ITIPFOOTY_PASSWORD;
    const origComp = process.env.ITIPFOOTY_COMP_ID;
    delete process.env.ITIPFOOTY_USERNAME;
    delete process.env.ITIPFOOTY_PASSWORD;
    delete process.env.ITIPFOOTY_COMP_ID;

    const res = await request(app).post('/api/tips/submit').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('iTipFooty not configured');

    // Restore
    if (origUser) process.env.ITIPFOOTY_USERNAME = origUser;
    if (origPass) process.env.ITIPFOOTY_PASSWORD = origPass;
    if (origComp) process.env.ITIPFOOTY_COMP_ID = origComp;
  });
});
