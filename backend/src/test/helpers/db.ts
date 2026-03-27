import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { unlinkSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Root of the backend workspace
const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..');

let testClient: PrismaClient;
let dbPath: string;

export function createTestDb(): PrismaClient {
  dbPath = `/tmp/footy-test-${randomBytes(4).toString('hex')}.db`;
  const dbUrl = `file:${dbPath}`;

  execSync('npx prisma db push --skip-generate', {
    cwd: BACKEND_ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'ignore',
  });

  testClient = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  return testClient;
}

export async function destroyTestDb(): Promise<void> {
  await testClient?.$disconnect();
  if (dbPath && existsSync(dbPath)) unlinkSync(dbPath);
}

/**
 * Minimal seed: 2 teams, 1 season, 1 round, 1 upcoming fixture.
 * Returns the fixture id for use in tests.
 */
export async function seedMinimal(prisma: PrismaClient) {
  await prisma.team.createMany({
    data: [
      { id: 'MEL', name: 'Melbourne Storm', shortName: 'Storm' },
      { id: 'PEN', name: 'Penrith Panthers', shortName: 'Panthers' },
    ],
  });

  await prisma.season.create({
    data: { id: '2026', year: 2026, current: true },
  });

  await prisma.round.create({
    data: {
      id: '2026-R1',
      seasonId: '2026',
      number: 1,
      name: 'Round 1',
      isCurrent: true,
    },
  });

  const fixture = await prisma.fixture.create({
    data: {
      roundId: '2026-R1',
      homeTeamId: 'MEL',
      awayTeamId: 'PEN',
      venue: 'AAMI Park',
      status: 'upcoming',
      homeOdds: 1.75,
      awayOdds: 2.1,
    },
  });

  return { fixture };
}

/**
 * Full seed for prediction tests: adds 2025 ladder entries, historical
 * fixtures for form calculation, and 2026 Round 1 upcoming fixture.
 */
export async function seedForPredictions(prisma: PrismaClient) {
  const { fixture } = await seedMinimal(prisma);

  // 2025 season + rounds for historical form data
  await prisma.season.create({
    data: { id: '2025', year: 2025, current: false },
  });
  for (let i = 1; i <= 5; i++) {
    await prisma.round.create({
      data: { id: `2025-R${i}`, seasonId: '2025', number: i, name: `Round ${i}` },
    });
  }

  // MEL wins 4 of last 5 (strong form)
  const formData = [
    { round: 1, home: 'MEL', away: 'PEN', result: 'home' },
    { round: 2, home: 'PEN', away: 'MEL', result: 'away' },
    { round: 3, home: 'MEL', away: 'PEN', result: 'home' },
    { round: 4, home: 'MEL', away: 'PEN', result: 'home' },
    { round: 5, home: 'PEN', away: 'MEL', result: 'home' },
  ];
  for (const f of formData) {
    await prisma.fixture.create({
      data: {
        roundId: `2025-R${f.round}`,
        homeTeamId: f.home,
        awayTeamId: f.away,
        venue: 'Test Stadium',
        status: 'completed',
        result: f.result,
        homeScore: 20,
        awayScore: 14,
      },
    });
  }

  // 2025 ladder entries
  await prisma.ladderEntry.createMany({
    data: [
      {
        teamId: 'MEL',
        season: '2025',
        round: 27,
        position: 1,
        wins: 20,
        losses: 7,
        pointsDiff: 200,
        titleOdds: '$4.00',
      },
      {
        teamId: 'PEN',
        season: '2025',
        round: 27,
        position: 3,
        wins: 17,
        losses: 10,
        pointsDiff: 120,
        titleOdds: '$6.00',
      },
    ],
  });

  return { fixture };
}
