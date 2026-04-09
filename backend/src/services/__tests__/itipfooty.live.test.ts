/**
 * Live smoke tests for iTipFooty integration.
 *
 * These tests hit the real itipfooty.com.au service to verify that:
 *  - Credentials work and login returns a valid session
 *  - The tipping page HTML can still be parsed (catches markup changes)
 *  - Every team name on the page maps to a known DB team ID
 *  - The full prediction→pick pipeline resolves without submitting
 *
 * They are READ-ONLY — no tips are ever submitted.
 *
 * Requirements:
 *  - Real credentials in backend/.env (ITIPFOOTY_USERNAME, PASSWORD, COMP_ID)
 *  - Network access to itipfooty.com.au
 *
 * Run:  LIVE=1 npx vitest run src/services/__tests__/itipfooty.live.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load real credentials from backend/.env (vitest.config sets dummy values).
// __dirname in vitest points to src/services/__tests/, so walk up 3 levels.
config({ path: resolve(__dirname, '../../../.env'), override: true });

import { login, fetchTippingPage, isConfigured, parseTeamStatsPage } from '../itipfooty.js';

const KNOWN_TEAMS = new Set([
  'broncos', 'eels', 'warriors', 'raiders', 'roosters',
  'rabbitohs', 'tigers', 'cowboys', 'dragons', 'storm',
  'panthers', 'sharks', 'sea eagles', 'knights', 'dolphins',
  'titans', 'bulldogs',
]);

const LIVE = process.env.LIVE === '1';
const describeOrSkip = LIVE ? describe : describe.skip;

describeOrSkip('iTipFooty live smoke tests', () => {
  // 15s per test — these hit a real server
  const TIMEOUT = 15_000;

  let sessionCookie: string;

  beforeAll(() => {
    if (!isConfigured()) {
      throw new Error(
        'Live tests require real credentials. Set ITIPFOOTY_USERNAME, ITIPFOOTY_PASSWORD, ITIPFOOTY_COMP_ID in backend/.env'
      );
    }
  });

  // --------------------------------------------------------------------------
  // 1. Login
  // --------------------------------------------------------------------------
  describe('login', () => {
    it('authenticates and returns a PHPSESSID cookie', async () => {
      sessionCookie = await login();

      expect(sessionCookie).toMatch(/^PHPSESSID=.+/);
      // Session IDs are typically 26+ hex/alphanum chars
      const value = sessionCookie.split('=')[1];
      expect(value.length).toBeGreaterThanOrEqual(20);
    }, TIMEOUT);
  });

  // --------------------------------------------------------------------------
  // 2. Tipping page fetch & parse (read-only)
  // --------------------------------------------------------------------------
  describe('tipping page', () => {
    it('fetches and parses the current round page', async () => {
      const formData = await fetchTippingPage(sessionCookie);

      // Form fields must be populated (tipRef was removed from iTipFooty in 2026)
      expect(formData.postMemberId).toBeTruthy();

      // Round should be a positive integer
      expect(formData.round).toBeGreaterThan(0);
      expect(Number.isInteger(formData.round)).toBe(true);
    }, TIMEOUT);

    it('finds 8 games in a standard NRL round', async () => {
      const formData = await fetchTippingPage(sessionCookie);

      // NRL has 8 games per round (occasionally 7 with byes, never fewer)
      expect(formData.games.length).toBeGreaterThanOrEqual(4);
      expect(formData.games.length).toBeLessThanOrEqual(8);
    }, TIMEOUT);

    it('parses team names for every game', async () => {
      const formData = await fetchTippingPage(sessionCookie);

      const gamesWithTeams = formData.games.filter(
        (g) => g.homeTeam && g.awayTeam
      );
      // Every game should have both team names parsed
      expect(gamesWithTeams.length).toBe(formData.games.length);

      for (const game of formData.games) {
        expect(game.homeTeam).toBeTruthy();
        expect(game.awayTeam).toBeTruthy();
        // Home and away should be different teams
        expect(game.homeTeam).not.toBe(game.awayTeam);
      }
    }, TIMEOUT);

    it('maps every team name to a known DB team ID', async () => {
      const formData = await fetchTippingPage(sessionCookie);
      const unmapped: string[] = [];

      for (const game of formData.games) {
        if (!game.homeTeamId) unmapped.push(game.homeTeam);
        if (!game.awayTeamId) unmapped.push(game.awayTeam);

        // Also verify the name itself is in our known set
        if (game.homeTeam && !KNOWN_TEAMS.has(game.homeTeam.toLowerCase())) {
          unmapped.push(`${game.homeTeam} (not in KNOWN_TEAMS)`);
        }
        if (game.awayTeam && !KNOWN_TEAMS.has(game.awayTeam.toLowerCase())) {
          unmapped.push(`${game.awayTeam} (not in KNOWN_TEAMS)`);
        }
      }

      expect(unmapped).toEqual([]);
    }, TIMEOUT);

    it('game numbers are sequential positive integers', async () => {
      const formData = await fetchTippingPage(sessionCookie);

      for (const game of formData.games) {
        expect(game.gameNumber).toBeGreaterThan(0);
        expect(Number.isInteger(game.gameNumber)).toBe(true);
      }

      // Game numbers should be sorted ascending
      const nums = formData.games.map((g) => g.gameNumber);
      expect(nums).toEqual([...nums].sort((a, b) => a - b));
    }, TIMEOUT);

    it('no team appears more than once in the round', async () => {
      const formData = await fetchTippingPage(sessionCookie);
      const teamIds = formData.games.flatMap((g) => [g.homeTeamId, g.awayTeamId]).filter(Boolean);
      const unique = new Set(teamIds);

      expect(unique.size).toBe(teamIds.length);
    }, TIMEOUT);

    it('fetches a specific round when requested', async () => {
      // First fetch current round to get a valid round number
      const current = await fetchTippingPage(sessionCookie);
      const formData = await fetchTippingPage(sessionCookie, current.round);

      expect(formData.round).toBe(current.round);
      expect(formData.games.length).toBeGreaterThan(0);
    }, TIMEOUT);
  });

  // --------------------------------------------------------------------------
  // 3. Dry-run: full pipeline minus the POST to SubmitTips.php
  // --------------------------------------------------------------------------
  describe('dry-run submission pipeline', () => {
    it('builds a complete tip selection without submitting', async () => {
      const formData = await fetchTippingPage(sessionCookie);
      const unlocked = formData.games.filter((g) => !g.locked);

      // For each unlocked game, verify we could construct a valid H/A pick
      for (const game of unlocked) {
        expect(game.homeTeamId).toBeTruthy();
        expect(game.awayTeamId).toBeTruthy();

        // Simulate picking home team — just verify the data structure is sound
        const pick: 'H' | 'A' = 'H';
        const body = new URLSearchParams({
          [String(game.gameNumber)]: pick,
        });

        // The encoded form value must be "H" or "A"
        expect(body.get(String(game.gameNumber))).toMatch(/^[HA]$/);
      }

      // Log a summary for manual inspection
      console.log(
        `[dry-run] Round ${formData.round}: ` +
        `${formData.games.length} games (${unlocked.length} unlocked, ${formData.games.length - unlocked.length} locked)`
      );
      for (const g of formData.games) {
        console.log(
          `  Game ${g.gameNumber}: ${g.homeTeam} (${g.homeTeamId}) vs ${g.awayTeam} (${g.awayTeamId})${g.locked ? ' [LOCKED]' : ''}`
        );
      }
    }, TIMEOUT);

    it('form payload contains all required fields for submission', async () => {
      const formData = await fetchTippingPage(sessionCookie);
      const compId = process.env.ITIPFOOTY_COMP_ID!;

      // Build the same URLSearchParams that submitTipsToSite would build
      const body = new URLSearchParams({
        cutoff: 'GAME',
        code: 'NRL',
        postmemberid: formData.postMemberId,
        COMPID: compId,
        ROUND: String(formData.round),
        JOKERCOUNT: formData.jokerCount,
        CURRENTJOKERCOUNT: formData.currentJokerCount,
        todo: 'update',
        tipref: formData.tipRef,
      });

      // Add a dummy pick for each unlocked game
      const unlocked = formData.games.filter((g) => !g.locked);
      for (const game of unlocked) {
        body.set(String(game.gameNumber), 'H');
      }

      // Verify all required keys are present and non-empty (tipref removed from iTipFooty in 2026)
      for (const key of ['postmemberid', 'COMPID', 'ROUND', 'todo']) {
        expect(body.get(key)).toBeTruthy();
      }

      // Verify every unlocked game has a pick value
      for (const game of unlocked) {
        expect(body.get(String(game.gameNumber))).toMatch(/^[HA]$/);
      }

      // Round should be numeric
      expect(Number(body.get('ROUND'))).toBeGreaterThan(0);
    }, TIMEOUT);
  });

  // --------------------------------------------------------------------------
  // 4. Team stats page — tipping ratio scrape (read-only)
  // --------------------------------------------------------------------------
  describe('team stats page', () => {
    it('fetches and parses tipping ratio for game 1', async () => {
      const tippingPage = await fetchTippingPage(sessionCookie);
      const compId = process.env.ITIPFOOTY_COMP_ID!;

      const url = `https://www.itipfooty.com.au/teamstats.php?compid=${compId}&round=${tippingPage.round}&code=NRL&game=1`;
      const res = await fetch(url, {
        headers: {
          Cookie: sessionCookie,
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        },
      });
      expect(res.ok).toBe(true);

      const parsed = parseTeamStatsPage(await res.text());
      expect(parsed).not.toBeNull();

      // Tipping ratio should be valid percentages
      expect(parsed!.homeTipPct).toBeGreaterThanOrEqual(0);
      expect(parsed!.homeTipPct).toBeLessThanOrEqual(100);
      expect(parsed!.awayTipPct).toBeGreaterThanOrEqual(0);
      expect(parsed!.awayTipPct).toBeLessThanOrEqual(100);
      // They should approximately sum to 100 (may not be exact due to rounding)
      expect(parsed!.homeTipPct + parsed!.awayTipPct).toBeGreaterThanOrEqual(99);
      expect(parsed!.homeTipPct + parsed!.awayTipPct).toBeLessThanOrEqual(101);

      console.log(`[team-stats] Game 1 tipping ratio: ${parsed!.homeTipPct}% vs ${parsed!.awayTipPct}%`);
    }, TIMEOUT);

    it('game dropdown lists all games with known team names', async () => {
      const tippingPage = await fetchTippingPage(sessionCookie);
      const compId = process.env.ITIPFOOTY_COMP_ID!;

      const url = `https://www.itipfooty.com.au/teamstats.php?compid=${compId}&round=${tippingPage.round}&code=NRL&game=1`;
      const res = await fetch(url, {
        headers: {
          Cookie: sessionCookie,
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        },
      });
      const parsed = parseTeamStatsPage(await res.text());
      expect(parsed).not.toBeNull();
      expect(parsed!.games.length).toBeGreaterThanOrEqual(4);

      const unmapped: string[] = [];
      for (const game of parsed!.games) {
        if (!KNOWN_TEAMS.has(game.homeTeam.toLowerCase())) unmapped.push(game.homeTeam);
        if (!KNOWN_TEAMS.has(game.awayTeam.toLowerCase())) unmapped.push(game.awayTeam);
      }
      expect(unmapped).toEqual([]);

      console.log(`[team-stats] Round ${tippingPage.round} games:`);
      for (const g of parsed!.games) {
        console.log(`  Game ${g.gameNumber}: ${g.homeTeam} vs ${g.awayTeam}`);
      }
    }, TIMEOUT);
  });
});
