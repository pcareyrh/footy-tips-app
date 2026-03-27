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

describe('GET /api/analytics/summary', () => {
  it('returns zero counts and empty streak when no picks exist', async () => {
    const res = await request(app).get('/api/analytics/summary');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalPicks: 0,
      correctPicks: 0,
      incorrectPicks: 0,
      pendingPicks: 0,
      accuracy: 0,
      streak: '',
    });
  });

  it('calculates accuracy after seeding picks', async () => {
    const fixture = await testPrisma.fixture.findFirstOrThrow();
    // 3 correct, 1 incorrect
    await testPrisma.pick.createMany({
      data: [
        { fixtureId: fixture.id, pickedTeamId: 'MEL', confidence: 'high', result: 'correct' },
        { fixtureId: fixture.id, pickedTeamId: 'MEL', confidence: 'high', result: 'correct' },
        { fixtureId: fixture.id, pickedTeamId: 'MEL', confidence: 'high', result: 'correct' },
        { fixtureId: fixture.id, pickedTeamId: 'MEL', confidence: 'low', result: 'incorrect' },
      ],
    });

    const res = await request(app).get('/api/analytics/summary');
    expect(res.status).toBe(200);
    expect(res.body.totalPicks).toBe(4);
    expect(res.body.correctPicks).toBe(3);
    expect(res.body.incorrectPicks).toBe(1);
    expect(res.body.accuracy).toBeCloseTo(75);
  });

  it('returns W streak when last picks are correct', async () => {
    const res = await request(app).get('/api/analytics/summary');
    expect(res.status).toBe(200);
    expect(res.body.streak).toMatch(/^W\d+$/);
  });
});

describe('GET /api/analytics/by-factor', () => {
  it('returns array of 3 confidence levels', async () => {
    const res = await request(app).get('/api/analytics/by-factor');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    const levels = res.body.map((r: { confidence: string }) => r.confidence);
    expect(levels).toContain('low');
    expect(levels).toContain('medium');
    expect(levels).toContain('high');
  });

  it('100% accuracy for confidence level with all correct picks', async () => {
    const res = await request(app).get('/api/analytics/by-factor');
    const highEntry = res.body.find((r: { confidence: string }) => r.confidence === 'high');
    expect(highEntry.accuracy).toBeCloseTo(100);
  });
});

describe('GET /api/analytics/by-team', () => {
  it('excludes teams with no decided picks', async () => {
    const res = await request(app).get('/api/analytics/by-team');
    expect(res.status).toBe(200);
    // Only MEL has picks (PEN has none)
    const teamIds = res.body.map((r: { teamId: string }) => r.teamId);
    expect(teamIds).toContain('MEL');
    expect(teamIds).not.toContain('PEN');
  });

  it('sorts by accuracy descending', async () => {
    const res = await request(app).get('/api/analytics/by-team');
    for (let i = 1; i < res.body.length; i++) {
      expect(res.body[i].accuracy).toBeLessThanOrEqual(res.body[i - 1].accuracy);
    }
  });
});
