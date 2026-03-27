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

describe('GET /api/teams', () => {
  it('returns 200 with all seeded teams', async () => {
    const res = await request(app).get('/api/teams');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const names = res.body.map((t: { name: string }) => t.name);
    expect(names).toContain('Melbourne Storm');
    expect(names).toContain('Penrith Panthers');
  });
});

describe('GET /api/teams/:id', () => {
  it('returns 404 for unknown team ID', async () => {
    const res = await request(app).get('/api/teams/UNKNOWN');
    expect(res.status).toBe(404);
  });

  it('returns 200 with team including stats and injuries arrays', async () => {
    const res = await request(app).get('/api/teams/MEL');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'MEL',
      name: 'Melbourne Storm',
    });
    expect(Array.isArray(res.body.stats)).toBe(true);
    expect(Array.isArray(res.body.injuries)).toBe(true);
  });
});
