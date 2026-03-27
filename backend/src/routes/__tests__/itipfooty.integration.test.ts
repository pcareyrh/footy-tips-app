import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb, destroyTestDb, seedMinimal } from '../../test/helpers/db.js';

let testPrisma: PrismaClient;

vi.mock('../../lib/prisma.js', () => ({
  get prisma() { return testPrisma; },
}));

// Mock the heavy itipfooty service for the POST /submit integration test
vi.mock('../../services/itipfooty.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/itipfooty.js')>();
  return {
    ...actual,
    submitTips: vi.fn().mockResolvedValue({
      success: true,
      round: 1,
      tips: [],
      message: 'Mocked submission',
      errors: [],
    }),
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

describe('GET /api/itipfooty/status', () => {
  it('returns configured:true when env vars are set (vitest.config.ts injects them)', async () => {
    const res = await request(app).get('/api/itipfooty/status');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
  });

  it('returns masked username (***)', async () => {
    const res = await request(app).get('/api/itipfooty/status');
    expect(res.body.username).toBe('***');
  });

  it('returns compId from env', async () => {
    const res = await request(app).get('/api/itipfooty/status');
    expect(res.body.compId).toBe('12345');
  });

  it('returns configured:false when ITIPFOOTY_USERNAME is missing', async () => {
    const orig = process.env.ITIPFOOTY_USERNAME;
    delete process.env.ITIPFOOTY_USERNAME;

    const res = await request(app).get('/api/itipfooty/status');
    expect(res.body.configured).toBe(false);
    expect(res.body.username).toBeNull();

    process.env.ITIPFOOTY_USERNAME = orig;
  });
});

describe('POST /api/itipfooty/submit', () => {
  it('returns 400 when not configured', async () => {
    const orig = process.env.ITIPFOOTY_USERNAME;
    delete process.env.ITIPFOOTY_USERNAME;

    const res = await request(app).post('/api/itipfooty/submit').send({});
    expect(res.status).toBe(400);

    process.env.ITIPFOOTY_USERNAME = orig;
  });

  it('calls submitTips and returns the result when configured', async () => {
    const res = await request(app).post('/api/itipfooty/submit').send({ round: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Mocked submission',
    });
  });
});
