/**
 * Scheduler — auto-submits iTipFooty tips once per round.
 *
 * A single trigger per round: 1 hour before the first game kicks off,
 * scrape current data and submit all tips. There is no per-game resubmission —
 * resubmits after the first kickoff risk clearing already-locked picks on the
 * iTipFooty side, so we make a single pass and leave the round alone.
 *
 * Rules:
 *  - DB-stored TipOverrides are always respected; overridden games are never
 *    recalculated.
 *  - If a round has already been submitted in the last 30 minutes, the trigger
 *    is skipped silently (de-dupes catch-up runs after a restart).
 */

import * as cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { submitTips, isConfigured, PickOverride, scrapeITipMatchStats } from './itipfooty.js';
import { scrapeCurrentRound, scrapeAll } from './scraper.js';

let task: cron.ScheduledTask | null = null;
let scrapeTask: cron.ScheduledTask | null = null;
let _prisma: PrismaClient | null = null;
let tickRunning = false;

export const SCRAPE_SCHEDULE_KEY = 'scrape_schedule';

export const SCRAPE_SCHEDULE_OPTIONS: Record<string, { label: string; cron: string | null }> = {
  off:      { label: 'Off (manual only)',  cron: null },
  '1h':     { label: 'Every hour',         cron: '0 * * * *' },
  '6h':     { label: 'Every 6 hours',      cron: '0 */6 * * *' },
  '12h':    { label: 'Every 12 hours',     cron: '0 */12 * * *' },
  daily:    { label: 'Daily at midnight',  cron: '0 0 * * *' },
};

export function startScheduler(prisma: PrismaClient): void {
  _prisma = prisma;
  if (task) return;

  task = cron.schedule('* * * * *', () => {
    if (tickRunning) {
      console.warn('[scheduler] Previous tick still running — skipping this minute');
      return;
    }
    tickRunning = true;
    tick(prisma)
      .catch((err) =>
        console.error('[scheduler] Unhandled error:', err instanceof Error ? err.message : err)
      )
      .finally(() => { tickRunning = false; });
  });

  const status = isConfigured() ? 'active — will auto-submit tips' : 'iTipFooty not configured, submissions disabled';
  console.log(`[scheduler] Started (${status})`);

  // Load persisted scrape schedule from DB
  prisma.appSetting.findUnique({ where: { key: SCRAPE_SCHEDULE_KEY } }).then((row) => {
    if (row?.value && row.value !== 'off') {
      updateScrapeSchedule(row.value);
    }
  }).catch(() => {});
}

export function stopScheduler(): void {
  task?.stop();
  task = null;
  scrapeTask?.stop();
  scrapeTask = null;
}

export function updateScrapeSchedule(scheduleKey: string): void {
  scrapeTask?.stop();
  scrapeTask = null;

  const option = SCRAPE_SCHEDULE_OPTIONS[scheduleKey];
  if (!option?.cron || !_prisma) {
    console.log('[scheduler] Scrape schedule: off');
    return;
  }

  const prisma = _prisma;
  scrapeTask = cron.schedule(option.cron, () => {
    console.log(`[scheduler] Scheduled scrape (${scheduleKey}) triggered`);
    scrapeAll(prisma).catch((err) =>
      console.error('[scheduler] Scheduled scrape error:', err instanceof Error ? err.message : err)
    );
  });
  console.log(`[scheduler] Scrape schedule set: ${option.label} (${option.cron})`);
}

// ---------------------------------------------------------------------------
// Core polling tick — runs every minute
// ---------------------------------------------------------------------------

// Exported for testing
export async function tick(prisma: PrismaClient): Promise<void> {
  if (!isConfigured()) return;

  const now = new Date();
  const windowStart = new Date(now.getTime() + 55 * 60_000); // 55 min from now
  const windowEnd   = new Date(now.getTime() + 65 * 60_000); // 65 min from now

  // Find upcoming fixtures whose kickoff falls inside the ±5-min window around T-60min
  const inWindow = await prisma.fixture.findMany({
    where: {
      kickoff: { gte: windowStart, lte: windowEnd },
      status: 'upcoming',
    },
    include: { round: true },
    orderBy: { kickoff: 'asc' },
  });

  if (inWindow.length === 0) return;

  // Only fire for fixtures that are the first kickoff in their round. Subsequent
  // games in the same round are intentionally ignored — handleRoundSubmit's own
  // 30-min de-dupe also makes accidental double-fires harmless.
  const handledRounds = new Set<number>();
  for (const fixture of inWindow) {
    if (handledRounds.has(fixture.round.number)) continue;

    const firstInRound = await prisma.fixture.findFirst({
      where: {
        roundId: fixture.roundId,
        kickoff: { not: null },
        status: { not: 'completed' },
      },
      orderBy: { kickoff: 'asc' },
    });

    if (firstInRound?.id !== fixture.id) continue;

    handledRounds.add(fixture.round.number);
    await handleRoundSubmit(prisma, fixture.round.number);
  }
}

// ---------------------------------------------------------------------------
// Round-level submit — fires 1 hour before first game
// ---------------------------------------------------------------------------

// Exported for testing
export async function handleRoundSubmit(prisma: PrismaClient, roundNum: number): Promise<void> {
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

  console.log(`[scheduler] Auto-submitting Round ${roundNum} tips (T-60min before first game)…`);

  try {
    await scrapeCurrentRound(prisma);
  } catch (err) {
    console.error('[scheduler] Pre-submit scrape failed:', err instanceof Error ? err.message : err);
    // Continue — use stale data rather than skip submission entirely
  }

  try {
    await scrapeITipMatchStats(prisma, roundNum);
  } catch (err) {
    console.error('[scheduler] Pre-submit iTipFooty match stats scrape failed:', err instanceof Error ? err.message : err);
  }

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
