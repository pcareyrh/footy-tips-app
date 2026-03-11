import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TeamProfile {
  id: string;
  name: string;
  // 2025 season
  ladderPos2025: number;
  wins2025: number;
  losses2025: number;
  pf2025: number;
  pa2025: number;
  pd2025: number;
  // Historical home/away (2024-2025)
  homeWins: number;
  homeLosses: number;
  awayWins: number;
  awayLosses: number;
  avgPF: number;
  avgPA: number;
  // 2026 current
  titleOdds: number | null;
  streak2026: string | null;
  // Form (last 5 from end of 2025)
  recentForm: string;
}

interface Prediction {
  homeTeam: TeamProfile;
  awayTeam: TeamProfile;
  venue: string;
  predictedWinner: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH';
  confidenceScore: number; // 0-100
  factors: {
    name: string;
    favouring: string;
    weight: number;
    detail: string;
  }[];
  summary: string;
}

function parseTitleOdds(odds: string | null): number | null {
  if (!odds) return null;
  return parseFloat(odds.replace('$', ''));
}

function last5(form: string): string {
  return form.slice(0, 5);
}

function formWinRate(form: string, n: number = 5): number {
  const recent = form.slice(0, n);
  if (recent.length === 0) return 0.5;
  const wins = (recent.match(/W/g) || []).length;
  return wins / recent.length;
}

function homeWinPct(wins: number, losses: number): number {
  const total = wins + losses;
  return total > 0 ? wins / total : 0.5;
}

function impliedProb(odds: number | null): number {
  if (!odds || odds <= 1) return 0.5;
  return 1 / odds;
}

function confidenceLabel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY HIGH' {
  if (score >= 80) return 'VERY HIGH';
  if (score >= 65) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
}

async function buildTeamProfile(teamId: string): Promise<TeamProfile> {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
  
  // 2025 ladder
  const ladder2025 = await prisma.ladderEntry.findFirst({
    where: { teamId, season: '2025' },
    orderBy: { round: 'desc' },
  });

  // 2026 ladder (current)
  const ladder2026 = await prisma.ladderEntry.findFirst({
    where: { teamId, season: '2026' },
    orderBy: { round: 'desc' },
  });

  // Historical home/away from 2024+2025
  const homeGames = await prisma.fixture.findMany({
    where: { homeTeamId: teamId, status: 'completed', roundId: { startsWith: '202' } },
  });
  const awayGames = await prisma.fixture.findMany({
    where: { awayTeamId: teamId, status: 'completed', roundId: { startsWith: '202' } },
  });

  // Filter to 2024+2025 only
  const homeFiltered = homeGames.filter(f => f.roundId.startsWith('2024') || f.roundId.startsWith('2025'));
  const awayFiltered = awayGames.filter(f => f.roundId.startsWith('2024') || f.roundId.startsWith('2025'));

  const homeWins = homeFiltered.filter(f => f.result === 'home').length;
  const homeLosses = homeFiltered.length - homeWins;
  const awayWins = awayFiltered.filter(f => f.result === 'away').length;
  const awayLosses = awayFiltered.length - awayWins;

  const allGames = [...homeFiltered.map(f => ({ pf: f.homeScore ?? 0, pa: f.awayScore ?? 0 })),
                    ...awayFiltered.map(f => ({ pf: f.awayScore ?? 0, pa: f.homeScore ?? 0 }))];
  const avgPF = allGames.length > 0 ? allGames.reduce((s, g) => s + g.pf, 0) / allGames.length : 0;
  const avgPA = allGames.length > 0 ? allGames.reduce((s, g) => s + g.pa, 0) / allGames.length : 0;

  // Recent form from 2025 (get last games in order)
  const recentGames = await prisma.fixture.findMany({
    where: {
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      status: 'completed',
      roundId: { startsWith: '2025' },
    },
    orderBy: { roundId: 'desc' },
    take: 10,
  });

  const formStr = recentGames.map(f => {
    if ((f.homeTeamId === teamId && f.result === 'home') || (f.awayTeamId === teamId && f.result === 'away')) return 'W';
    if (f.result === 'draw') return 'D';
    return 'L';
  }).join('');

  return {
    id: teamId,
    name: team.shortName,
    ladderPos2025: ladder2025?.position ?? 17,
    wins2025: ladder2025?.wins ?? 0,
    losses2025: ladder2025?.losses ?? 0,
    pf2025: ladder2025?.pointsFor ?? 0,
    pa2025: ladder2025?.pointsAgainst ?? 0,
    pd2025: ladder2025?.pointsDiff ?? 0,
    homeWins,
    homeLosses,
    awayWins,
    awayLosses,
    avgPF,
    avgPA,
    titleOdds: parseTitleOdds(ladder2026?.titleOdds ?? null),
    streak2026: ladder2026?.streak ?? null,
    recentForm: formStr,
  };
}

async function predictMatch(
  homeTeamId: string,
  awayTeamId: string,
  venue: string
): Promise<Prediction> {
  const home = await buildTeamProfile(homeTeamId);
  const away = await buildTeamProfile(awayTeamId);

  const factors: Prediction['factors'] = [];
  let homeScore = 0;
  let awayScore = 0;

  // === FACTOR 1: 2025 Ladder Position (weight: 20) ===
  const ladderDiff = away.ladderPos2025 - home.ladderPos2025; // positive = home higher
  const ladderScore = Math.min(Math.abs(ladderDiff) * 1.5, 20);
  const ladderFavour = ladderDiff > 0 ? home.name : ladderDiff < 0 ? away.name : 'Even';
  if (ladderDiff > 0) homeScore += ladderScore; else awayScore += ladderScore;
  factors.push({
    name: '2025 Ladder Position',
    favouring: ladderFavour,
    weight: ladderScore,
    detail: `${home.name} #${home.ladderPos2025} vs ${away.name} #${away.ladderPos2025}`,
  });

  // === FACTOR 2: Title Odds / Market Assessment (weight: 15) ===
  const homeImplied = impliedProb(home.titleOdds);
  const awayImplied = impliedProb(away.titleOdds);
  const oddsTotal = homeImplied + awayImplied;
  if (oddsTotal > 0) {
    const homeOddsAdvantage = (homeImplied / oddsTotal - 0.5) * 30; // -15 to +15
    const oddsFavour = homeOddsAdvantage > 0 ? home.name : homeOddsAdvantage < 0 ? away.name : 'Even';
    const oddsWeight = Math.abs(homeOddsAdvantage);
    if (homeOddsAdvantage > 0) homeScore += oddsWeight; else awayScore += oddsWeight;
    factors.push({
      name: 'Premiership Odds',
      favouring: oddsFavour,
      weight: oddsWeight,
      detail: `${home.name} ${home.titleOdds ? '$' + home.titleOdds.toFixed(2) : 'N/A'} vs ${away.name} ${away.titleOdds ? '$' + away.titleOdds.toFixed(2) : 'N/A'}`,
    });
  }

  // === FACTOR 3: Home Ground Advantage (weight: 15) ===
  const homeWinPctVal = homeWinPct(home.homeWins, home.homeLosses);
  const awayWinPctVal = homeWinPct(away.awayWins, away.awayLosses);
  const homeAdvantage = (homeWinPctVal - awayWinPctVal) * 15;
  const homeGroundFavour = homeAdvantage > 0 ? home.name : homeAdvantage < 0 ? away.name : 'Even';
  if (homeAdvantage > 0) homeScore += homeAdvantage; else awayScore += Math.abs(homeAdvantage);
  factors.push({
    name: 'Home/Away Record',
    favouring: homeGroundFavour,
    weight: Math.abs(homeAdvantage),
    detail: `${home.name} home: ${home.homeWins}-${home.homeLosses} (${(homeWinPctVal * 100).toFixed(0)}%), ${away.name} away: ${away.awayWins}-${away.awayLosses} (${(awayWinPctVal * 100).toFixed(0)}%)`,
  });

  // === FACTOR 4: Points Differential (weight: 15) ===
  const pdDiff = home.pd2025 - away.pd2025;
  const pdWeight = Math.min(Math.abs(pdDiff) / 30, 15);
  const pdFavour = pdDiff > 0 ? home.name : pdDiff < 0 ? away.name : 'Even';
  if (pdDiff > 0) homeScore += pdWeight; else awayScore += pdWeight;
  factors.push({
    name: 'Points Differential (2025)',
    favouring: pdFavour,
    weight: pdWeight,
    detail: `${home.name} ${home.pd2025 > 0 ? '+' : ''}${home.pd2025} vs ${away.name} ${away.pd2025 > 0 ? '+' : ''}${away.pd2025}`,
  });

  // === FACTOR 5: Recent Form (last 5 of 2025) (weight: 15) ===
  const homeFormRate = formWinRate(home.recentForm);
  const awayFormRate = formWinRate(away.recentForm);
  const formDiff = (homeFormRate - awayFormRate) * 15;
  const formFavour = formDiff > 0 ? home.name : formDiff < 0 ? away.name : 'Even';
  if (formDiff > 0) homeScore += formDiff; else awayScore += Math.abs(formDiff);
  factors.push({
    name: 'Recent Form (last 5)',
    favouring: formFavour,
    weight: Math.abs(formDiff),
    detail: `${home.name} ${last5(home.recentForm)} (${(homeFormRate * 100).toFixed(0)}%) vs ${away.name} ${last5(away.recentForm)} (${(awayFormRate * 100).toFixed(0)}%)`,
  });

  // === FACTOR 6: Scoring Power vs Defence (weight: 10) ===
  const homeNetScoring = home.avgPF - away.avgPA; // home attack vs away defence
  const awayNetScoring = away.avgPF - home.avgPA; // away attack vs home defence
  const scoringEdge = (homeNetScoring - awayNetScoring) / 2;
  const scoringWeight = Math.min(Math.abs(scoringEdge) * 1.5, 10);
  const scoringFavour = scoringEdge > 0 ? home.name : scoringEdge < 0 ? away.name : 'Even';
  if (scoringEdge > 0) homeScore += scoringWeight; else awayScore += scoringWeight;
  factors.push({
    name: 'Attack vs Defence Matchup',
    favouring: scoringFavour,
    weight: scoringWeight,
    detail: `${home.name} avg PF ${home.avgPF.toFixed(1)}/PA ${home.avgPA.toFixed(1)} vs ${away.name} avg PF ${away.avgPF.toFixed(1)}/PA ${away.avgPA.toFixed(1)}`,
  });

  // === FACTOR 7: 2026 R1 Momentum (weight: 10) ===
  const homeR1Win = home.streak2026 === '1W' ? 1 : home.streak2026 === '1L' ? -1 : 0;
  const awayR1Win = away.streak2026 === '1W' ? 1 : away.streak2026 === '1L' ? -1 : 0;
  const momentumDiff = (homeR1Win - awayR1Win) * 5;
  if (momentumDiff !== 0) {
    const momentumFavour = momentumDiff > 0 ? home.name : away.name;
    if (momentumDiff > 0) homeScore += momentumDiff; else awayScore += Math.abs(momentumDiff);
    factors.push({
      name: '2026 R1 Result',
      favouring: momentumFavour,
      weight: Math.abs(momentumDiff),
      detail: `${home.name}: ${home.streak2026 ?? 'BYE'}, ${away.name}: ${away.streak2026 ?? 'BYE'}`,
    });
  }

  // === INHERENT HOME ADVANTAGE: +3 baseline ===
  homeScore += 3;
  factors.push({
    name: 'Home Ground Baseline',
    favouring: home.name,
    weight: 3,
    detail: `Standard NRL home advantage (~55% historical win rate)`,
  });

  // Calculate confidence
  const totalWeight = homeScore + awayScore;
  const winnerPct = Math.max(homeScore, awayScore) / totalWeight * 100;
  const confidenceScore = Math.min(Math.round(winnerPct), 95);
  const predictedWinner = homeScore >= awayScore ? home.name : away.name;

  // Sort factors by weight
  factors.sort((a, b) => b.weight - a.weight);

  const summary = `${predictedWinner} predicted to win at ${venue}. Key factors: ${factors.slice(0, 3).map(f => f.name).join(', ')}.`;

  return {
    homeTeam: home,
    awayTeam: away,
    venue,
    predictedWinner,
    confidence: confidenceLabel(confidenceScore),
    confidenceScore,
    factors,
    summary,
  };
}

// === HEAD-TO-HEAD ANALYSIS ===
async function getH2H(homeId: string, awayId: string): Promise<string> {
  const games = await prisma.fixture.findMany({
    where: {
      OR: [
        { homeTeamId: homeId, awayTeamId: awayId },
        { homeTeamId: awayId, awayTeamId: homeId },
      ],
      status: 'completed',
      NOT: { roundId: { startsWith: '2026' } },
    },
    orderBy: { roundId: 'desc' },
  });

  if (games.length === 0) return 'No recent H2H data (2024-2025)';

  let homeWins = 0, awayWins = 0;
  for (const g of games) {
    if ((g.homeTeamId === homeId && g.result === 'home') || (g.awayTeamId === homeId && g.result === 'away')) homeWins++;
    else if (g.result !== 'draw') awayWins++;
  }

  return `H2H (2024-25): ${homeWins}-${awayWins} in ${games.length} games`;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║       NRL 2026 ROUND 1 — MATCH PREDICTIONS & ANALYSIS         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Get upcoming R1 fixtures
  const upcoming = await prisma.fixture.findMany({
    where: { roundId: '2026-R1', status: 'upcoming' },
    include: { homeTeam: true, awayTeam: true },
  });

  if (upcoming.length === 0) {
    console.log('No upcoming fixtures found for Round 1.');
    return;
  }

  console.log(`📋 ${upcoming.length} matches to predict\n`);

  const predictions: Prediction[] = [];

  for (const fixture of upcoming) {
    const prediction = await predictMatch(fixture.homeTeamId, fixture.awayTeamId, fixture.venue ?? 'TBA');
    const h2h = await getH2H(fixture.homeTeamId, fixture.awayTeamId);
    predictions.push(prediction);

    const confEmoji = prediction.confidence === 'VERY HIGH' ? '🔥' :
                      prediction.confidence === 'HIGH' ? '✅' :
                      prediction.confidence === 'MEDIUM' ? '⚡' : '⚠️';

    console.log('━'.repeat(66));
    console.log(`  ${prediction.homeTeam.name} vs ${prediction.awayTeam.name}`);
    console.log(`  📍 ${prediction.venue}`);
    console.log(`  ${h2h}`);
    console.log('');
    console.log(`  ${confEmoji} PREDICTION: ${prediction.predictedWinner.toUpperCase()}`);
    console.log(`     Confidence: ${prediction.confidenceScore}% (${prediction.confidence})`);
    console.log('');
    console.log('  Contributing Factors:');
    for (const factor of prediction.factors) {
      const bar = '█'.repeat(Math.round(factor.weight));
      const arrow = factor.favouring === prediction.predictedWinner ? '→' : '←';
      console.log(`    ${arrow} ${factor.name} [${bar}] ${factor.weight.toFixed(1)}`);
      console.log(`      ${factor.detail}`);
    }
    console.log('');
  }

  // === SUMMARY TABLE ===
  console.log('\n' + '═'.repeat(66));
  console.log('  TIPS SUMMARY — NRL 2026 ROUND 1');
  console.log('═'.repeat(66));
  console.log('  Match'.padEnd(35) + 'Pick'.padEnd(15) + 'Conf'.padEnd(10) + 'Score');
  console.log('  ' + '─'.repeat(62));

  for (const p of predictions) {
    const match = `${p.homeTeam.name} v ${p.awayTeam.name}`;
    const confEmoji = p.confidence === 'VERY HIGH' ? '🔥' :
                      p.confidence === 'HIGH' ? '✅' :
                      p.confidence === 'MEDIUM' ? '⚡' : '⚠️';
    console.log(`  ${match.padEnd(33)} ${p.predictedWinner.padEnd(13)} ${confEmoji} ${p.confidence.padEnd(9)} ${p.confidenceScore}%`);
  }

  console.log('\n  Legend: 🔥 Very High | ✅ High | ⚡ Medium | ⚠️ Low');
  console.log('═'.repeat(66));
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
