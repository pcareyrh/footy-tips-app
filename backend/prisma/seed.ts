import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const teams = [
  { id: 'BRI', name: 'Brisbane Broncos', shortName: 'Broncos', homeGround: 'Suncorp Stadium' },
  { id: 'CAN', name: 'Canberra Raiders', shortName: 'Raiders', homeGround: 'GIO Stadium' },
  { id: 'CBY', name: 'Canterbury-Bankstown Bulldogs', shortName: 'Bulldogs', homeGround: 'Belmore Sports Ground' },
  { id: 'CRO', name: 'Cronulla-Sutherland Sharks', shortName: 'Sharks', homeGround: 'PointsBet Stadium' },
  { id: 'DOL', name: 'Dolphins', shortName: 'Dolphins', homeGround: 'Suncorp Stadium' },
  { id: 'GLD', name: 'Gold Coast Titans', shortName: 'Titans', homeGround: 'Cbus Super Stadium' },
  { id: 'MAN', name: 'Manly Warringah Sea Eagles', shortName: 'Sea Eagles', homeGround: '4 Pines Park' },
  { id: 'MEL', name: 'Melbourne Storm', shortName: 'Storm', homeGround: 'AAMI Park' },
  { id: 'NEW', name: 'Newcastle Knights', shortName: 'Knights', homeGround: 'McDonald Jones Stadium' },
  { id: 'NZW', name: 'New Zealand Warriors', shortName: 'Warriors', homeGround: 'Go Media Stadium' },
  { id: 'NQL', name: 'North Queensland Cowboys', shortName: 'Cowboys', homeGround: 'Qld Country Bank Stadium' },
  { id: 'PAR', name: 'Parramatta Eels', shortName: 'Eels', homeGround: 'CommBank Stadium' },
  { id: 'PEN', name: 'Penrith Panthers', shortName: 'Panthers', homeGround: 'BlueBet Stadium' },
  { id: 'SOU', name: 'South Sydney Rabbitohs', shortName: 'Rabbitohs', homeGround: 'Accor Stadium' },
  { id: 'SGI', name: 'St George Illawarra Dragons', shortName: 'Dragons', homeGround: 'WIN Stadium' },
  { id: 'SYD', name: 'Sydney Roosters', shortName: 'Roosters', homeGround: 'Sydney Football Stadium' },
  { id: 'WST', name: 'Wests Tigers', shortName: 'Tigers', homeGround: 'Campbelltown Stadium' },
];

const round1Fixtures = [
  { home: 'BRI', away: 'MEL', venue: 'Suncorp Stadium' },
  { home: 'PEN', away: 'CRO', venue: 'BlueBet Stadium' },
  { home: 'SYD', away: 'CBY', venue: 'Sydney Football Stadium' },
  { home: 'MAN', away: 'CAN', venue: '4 Pines Park' },
  { home: 'PAR', away: 'NQL', venue: 'CommBank Stadium' },
  { home: 'NEW', away: 'DOL', venue: 'McDonald Jones Stadium' },
  { home: 'GLD', away: 'SGI', venue: 'Cbus Super Stadium' },
  { home: 'NZW', away: 'WST', venue: 'Go Media Stadium' },
];

async function main() {
  console.log('Seeding database...');

  // Create season
  const season = await prisma.season.upsert({
    where: { id: '2026' },
    update: {},
    create: {
      id: '2026',
      year: 2026,
      current: true,
    },
  });
  console.log(`Created season: ${season.year}`);

  // Create rounds 1-27
  for (let i = 1; i <= 27; i++) {
    await prisma.round.upsert({
      where: { id: `2026-R${i}` },
      update: {},
      create: {
        id: `2026-R${i}`,
        seasonId: '2026',
        number: i,
        name: `Round ${i}`,
        isCurrent: i === 1,
      },
    });
  }
  console.log('Created 27 rounds');

  // Create teams
  for (const team of teams) {
    await prisma.team.upsert({
      where: { id: team.id },
      update: {},
      create: team,
    });
  }
  console.log(`Created ${teams.length} teams`);

  // Create Round 1 fixtures
  for (const fixture of round1Fixtures) {
    const existing = await prisma.fixture.findFirst({
      where: {
        roundId: '2026-R1',
        homeTeamId: fixture.home,
        awayTeamId: fixture.away,
      },
    });

    if (!existing) {
      await prisma.fixture.create({
        data: {
          roundId: '2026-R1',
          homeTeamId: fixture.home,
          awayTeamId: fixture.away,
          venue: fixture.venue,
          status: 'upcoming',
        },
      });
    }
  }
  console.log(`Created ${round1Fixtures.length} Round 1 fixtures`);

  // Create pre-season ladder entries (all zeros)
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    await prisma.ladderEntry.upsert({
      where: {
        teamId_season_round: {
          teamId: team.id,
          season: '2026',
          round: 0,
        },
      },
      update: {},
      create: {
        teamId: team.id,
        season: '2026',
        round: 0,
        position: i + 1,
      },
    });
  }
  console.log('Created pre-season ladder entries');

  // Register NRL scraper plugin (disabled by default)
  await prisma.pluginConfig.upsert({
    where: { id: 'nrl-scraper' },
    update: {},
    create: {
      id: 'nrl-scraper',
      name: 'NRL Data Scraper',
      type: 'data-source',
      enabled: false,
      config: JSON.stringify({
        baseUrl: 'https://www.nrl.com',
        endpoints: {
          fixtures: '/draw',
          ladder: '/ladder',
          stats: '/stats',
        },
      }),
      schedule: '0 */6 * * *', // Every 6 hours
    },
  });
  console.log('Registered NRL scraper plugin');

  console.log('Seeding complete!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
