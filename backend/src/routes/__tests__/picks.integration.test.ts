import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb, destroyTestDb, seedMinimal } from '../../test/helpers/db.js';

let testPrisma: PrismaClient;

vi.mock('../../lib/prisma.js', () => ({
  get prisma() { return testPrisma; },
}));

// Import after mock is set up
const { app } = await import('../../app.js');

beforeAll(async () => {
  testPrisma = createTestDb();
  await seedMinimal(testPrisma);
});

afterAll(async () => {
  await destroyTestDb();
});

describe('GET /api/picks', () => {
  it('returns 200 with empty array when no picks exist', async () => {
    const res = await request(app).get('/api/picks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns created pick after POST', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const fixture = fixtures[0];

    await testPrisma.pick.create({
      data: {
        fixtureId: fixture.id,
        pickedTeamId: 'MEL',
        confidence: 'high',
      },
    });

    const res = await request(app).get('/api/picks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      pickedTeamId: 'MEL',
      confidence: 'high',
    });
  });

  it('filters by fixtureId', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const fixtureId = fixtures[0].id;

    const res = await request(app).get(`/api/picks?fixtureId=${fixtureId}`);
    expect(res.status).toBe(200);
    expect(res.body.every((p: { fixtureId: string }) => p.fixtureId === fixtureId)).toBe(true);
  });
});

describe('POST /api/picks', () => {
  it('returns 400 when fixtureId is missing', async () => {
    const res = await request(app)
      .post('/api/picks')
      .send({ pickedTeamId: 'MEL' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when pickedTeamId is missing', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const res = await request(app)
      .post('/api/picks')
      .send({ fixtureId: fixtures[0].id });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid confidence value', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const res = await request(app)
      .post('/api/picks')
      .send({ fixtureId: fixtures[0].id, pickedTeamId: 'MEL', confidence: 'ultra' });
    expect(res.status).toBe(400);
  });

  it('returns 201 with the created pick on valid input', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const res = await request(app)
      .post('/api/picks')
      .send({ fixtureId: fixtures[0].id, pickedTeamId: 'PEN', confidence: 'medium' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      pickedTeamId: 'PEN',
      confidence: 'medium',
    });
  });

  it('defaults confidence to medium when not provided', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const res = await request(app)
      .post('/api/picks')
      .send({ fixtureId: fixtures[0].id, pickedTeamId: 'MEL' });
    expect(res.status).toBe(201);
    expect(res.body.confidence).toBe('medium');
  });
});

describe('PUT /api/picks/:id', () => {
  it('returns 404 for non-existent pick', async () => {
    const res = await request(app).put('/api/picks/nonexistent-id').send({ confidence: 'high' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid confidence', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const pick = await testPrisma.pick.create({
      data: { fixtureId: fixtures[0].id, pickedTeamId: 'MEL' },
    });
    const res = await request(app).put(`/api/picks/${pick.id}`).send({ confidence: 'mega' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid result', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const pick = await testPrisma.pick.create({
      data: { fixtureId: fixtures[0].id, pickedTeamId: 'MEL' },
    });
    const res = await request(app).put(`/api/picks/${pick.id}`).send({ result: 'maybe' });
    expect(res.status).toBe(400);
  });

  it('updates pick fields and returns updated object', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const pick = await testPrisma.pick.create({
      data: { fixtureId: fixtures[0].id, pickedTeamId: 'MEL', confidence: 'low' },
    });
    const res = await request(app)
      .put(`/api/picks/${pick.id}`)
      .send({ confidence: 'high', result: 'correct' });
    expect(res.status).toBe(200);
    expect(res.body.confidence).toBe('high');
    expect(res.body.result).toBe('correct');
  });
});

describe('DELETE /api/picks/:id', () => {
  it('returns 404 for non-existent pick', async () => {
    const res = await request(app).delete('/api/picks/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('returns 200 and removes the pick', async () => {
    const fixtures = await testPrisma.fixture.findMany();
    const pick = await testPrisma.pick.create({
      data: { fixtureId: fixtures[0].id, pickedTeamId: 'MEL' },
    });

    const res = await request(app).delete(`/api/picks/${pick.id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('deleted');

    const gone = await testPrisma.pick.findUnique({ where: { id: pick.id } });
    expect(gone).toBeNull();
  });
});
