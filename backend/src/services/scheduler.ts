/**
 * Scheduler — auto-submits iTipFooty tips before each round.
 *
 * Two trigger types per round:
 *  1. ROUND SUBMIT   — 1 hour before the first game kicks off: submit all tips.
 *  2. PRE-GAME SCRAPE — 1 hour before each subsequent game: rescrape + resubmit
 *     so any last-minute prediction changes (injuries, odds shift) are captured.
 *
 * Rules:
 *  - DB-stored TipOverrides are always respected; overridden games are never
 *    recalculated.
 *  - If a round has already been submitted in the last 30 minutes, the round-
 *    level trigger is skipped silently.
 *  - Per-game triggers always fire (iTipFooty ignores picks for locked games).
 */

import * as cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { submitTips, isConfigured, PickOverride } from './itipfooty.js';
import { scrapeCurrentRound } from './scraper.js';

let task: cron.ScheduledTask | null = null;

export function startScheduler(prisma: PrismaClient): void {
  if (task) return;

  task = cron.schedule('* * * * *', () => {
    tick(prisma).catch((err) =>
      console.error('[scheduler] Unhandled error:', err instanceof Error ? err.message : err)
    );
  });

  const status = isConfigured() ? 'active — will auto-submit tips' : 'iTipFooty not configured, submissions disabled';
  console.log(`[scheduler] Started (${status})`);
}

export function stopScheduler(): void {
  task?.stop();
  task = null;
}

// ---------------------------------------------------------------------------
// Core polling tick — runs every minute
// ---------------------------------------------------------------------------

async function tick(prisma: PrismaClient): Promise<void> {
  if (!isConfigured()) return;

  const now = new Date();
  const windowStart = new Date(now.getTime() + 55 * 60_000); // 55 min from now
  const windowEnd   = new Date(now.getTime() + 65 * 60_000); // 65 min from now

  // Find upcoming fixtures whose kickoff falls inside the ±5-min window around T-1h
  const inWindow = await prisma.fixture.findMany({
    where: {
      kickoff: { gte: windowStart, lte: windowEnd },
      status: 'upcoming',
    },
    include: { round: true },
    orderBy: { kickoff: 'asc' },
  });

  if (inWindow.length === 0) return;

  for (const fixture of inWindow) {
    // Is this the first (earliest) kickoff in the round?
    const firstInRound = await prisma.fixture.findFirst({
      where: {
        roundId: fixture.roundId,
        kickoff: { not: null },
        status: { not: 'completed' },
      },
      orderBy: { kickoff: 'asc' },
    });

    if (firstInRound?.id === fixture.id) {
      await handleRoundSubmit(prisma, fixture.round.number);
    } else {
      await handlePreGameRescrape(prisma, fixture.round.number);
    }
  }
}

// ---------------------------------------------------------------------------
// Round-level submit — fires 1h before first game
// ---------------------------------------------------------------------------

async function handleRoundSubmit(prisma: PrismaClient, roundNum: number): Promise<void> {
  // Skip if a successful submission for this round already happened in the last 30 min
  // (covers both manual UI submissions and previous auto runs)
  const recent = await prisma.dataSourceLog.findFirst({
    where: {
      source: { in: ['itipfooty', 'itipfooty-auto'] },
      message: { contains: `Round ${roundNum}` },
      status: { in: ['success', 'partial'] },
      createdAt: { gte: new Date(Date.now() - 30 * 60_000) },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (recent) {
    console.log(
      `[scheduler] Round ${roundNum} already submitted at ${recent.createdAt.toISOString()} — skipping`
    );
    return;
  }

  console.log(`[scheduler] Auto-submitting Round ${roundNum} tips (T-1h before first game)…`);
  const overrides = await loadOverrides(prisma);
  const result = await submitTips(prisma, roundNum, overrides);

  await prisma.dataSourceLog.create({
    data: {
      source: 'itipfooty-auto',
      status: result.success ? (result.errors.length > 0 ? 'partial' : 'success') : 'error',
      message: `[Auto] ${result.message}`,
      recordsAffected: result.tips.length,
    },
  });

  console.log(`[scheduler] Round ${roundNum} auto-submit: ${result.message}`);
}

// ---------------------------------------------------------------------------
// Pre-game rescrape — fires 1h before each subsequent game
// ---------------------------------------------------------------------------

async function handlePreGameRescrape(prisma: PrismaClient, roundNum: number): Promise<void> {
  console.log(`[scheduler] Pre-game scrape + resubmit for Round ${roundNum}…`);

  try {
    await scrapeCurrentRound(prisma);
  } catch (err) {
    console.error('[scheduler] Scrape failed:', err instanceof Error ? err.message : err);
    // Continue — use stale data rather than skip submission entirely
  }

  const overrides = await loadOverrides(prisma);
  const result = await submitTips(prisma, roundNum, overrides);

  await prisma.dataSourceLog.create({
    data: {
      source: 'itipfooty-auto',
      status: result.success ? (result.errors.length > 0 ? 'partial' : 'success') : 'error',
      message: `[Auto pre-game] ${result.message}`,
      recordsAffected: result.tips.length,
    },
  });

  console.log(`[scheduler] Pre-game resubmit: ${result.message}`);
}

// ---------------------------------------------------------------------------
// Helper — read all stored overrides from DB
// ---------------------------------------------------------------------------

async function loadOverrides(prisma: PrismaClient): Promise<PickOverride[]> {
  const rows = await prisma.tipOverride.findMany({
    include: { fixture: true },
  });
  return rows.map((o) => ({
    homeTeamId: o.fixture.homeTeamId,
    awayTeamId: o.fixture.awayTeamId,
    winnerId: o.winnerId,
  }));
}
