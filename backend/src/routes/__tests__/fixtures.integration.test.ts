import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb, destroyTestDb, seedMinimal } from '../../test/helpers/db.js';

let testPrisma: PrismaClient;

vi.mock('../../lib/prisma.js', () => ({
  get prisma() { return testPrisma; },
}));

const { app } = await import('../../app.js');

beforeAll(async () => {
  testPrisma = createTestDb();
  await seedMinimal(testPrisma);
});

afterAll(async () => {
  await destroyTestDb();
});

describe('GET /api/fixtures', () => {
  it('returns 200 with all fixtures', async () => {
    const res = await request(app).get('/api/fixtures');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('filters by roundId', async () => {
    const res = await request(app).get('/api/fixtures?roundId=2026-R1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    const resEmpty = await request(app).get('/api/fixtures?roundId=9999-R99');
    expect(resEmpty.body).toHaveLength(0);
  });

  it('filters by status=upcoming', async () => {
    const res = await request(app).get('/api/fixtures?status=upcoming');
    expect(res.status).toBe(200);
    expect(res.body.every((f: { status: string }) => f.status === 'upcoming')).toBe(true);
  });
});

describe('GET /api/fixtures/:id', () => {
  it('returns 404 for unknown fixture', async () => {
    const res = await request(app).get('/api/fixtures/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns 200 with fixture including homeTeam, awayTeam, round, picks', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const res = await request(app).get(`/api/fixtures/${fixtures[0].id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: fixtures[0].id,
      homeTeam: expect.objectContaining({ id: 'MEL' }),
      awayTeam: expect.objectContaining({ id: 'PEN' }),
      round: expect.objectContaining({ id: '2026-R1' }),
      picks: expect.any(Array),
    });
  });
});

describe('POST /api/fixtures', () => {
  it('returns 400 when roundId is missing', async () => {
    const res = await request(app)
      .post('/api/fixtures')
      .send({ homeTeamId: 'MEL', awayTeamId: 'PEN' });
    expect(res.status).toBe(400);
  });

  it('returns 201 with created fixture', async () => {
    const res = await request(app)
      .post('/api/fixtures')
      .send({ roundId: '2026-R1', homeTeamId: 'PEN', awayTeamId: 'MEL', venue: 'BlueBet Stadium' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      homeTeamId: 'PEN',
      awayTeamId: 'MEL',
      status: 'upcoming',
    });
  });
});

describe('PUT /api/fixtures/:id', () => {
  it('returns 404 for unknown fixture', async () => {
    const res = await request(app).put('/api/fixtures/nonexistent').send({ status: 'completed' });
    expect(res.status).toBe(404);
  });

  it('updates score, result and status', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const res = await request(app)
      .put(`/api/fixtures/${fixtures[0].id}`)
      .send({ homeScore: 24, awayScore: 18, result: 'home', status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      homeScore: 24,
      awayScore: 18,
      result: 'home',
      status: 'completed',
    });
  });
});
