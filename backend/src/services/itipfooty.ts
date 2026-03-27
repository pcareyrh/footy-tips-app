/**
 * iTipFooty.com.au integration — automates tip submission.
 *
 * Credentials are loaded from environment variables:
 *   ITIPFOOTY_USERNAME, ITIPFOOTY_PASSWORD, ITIPFOOTY_COMP_ID
 */

import { PrismaClient } from '@prisma/client';
import { predictRound } from './analysis.js';

const BASE_URL = 'https://www.itipfooty.com.au';
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Map our DB team IDs → iTipFooty nicknames (used to match games)
const TEAM_ID_TO_ITIP: Record<string, string> = {
  BRI: 'Broncos',
  PAR: 'Eels',
  NZW: 'Warriors',
  CAN: 'Raiders',
  SYD: 'Roosters',
  SOU: 'Rabbitohs',
  WST: 'Tigers',
  NQL: 'Cowboys',
  SGI: 'Dragons',
  MEL: 'Storm',
  PEN: 'Panthers',
  CRO: 'Sharks',
  MAN: 'Sea Eagles',
  NEW: 'Knights',
  DOL: 'Dolphins',
  GLD: 'Titans',
  CBY: 'Bulldogs',
};

// Reverse lookup: iTipFooty nickname → our team ID
const ITIP_TO_TEAM_ID: Record<string, string> = {};
for (const [id, name] of Object.entries(TEAM_ID_TO_ITIP)) {
  ITIP_TO_TEAM_ID[name.toLowerCase()] = id;
}

interface ITipGame {
  gameNumber: number;
  homeTeam: string; // iTipFooty nickname
  awayTeam: string;
  homeTeamId: string; // our DB team ID
  awayTeamId: string;
  locked: boolean;
}

interface ITipFormData {
  postMemberId: string;
  tipRef: string;
  jokerCount: string;
  currentJokerCount: string;
  games: ITipGame[];
  marginIncluded: boolean;
  round: number;
}

interface TipSubmission {
  gameNumber: number;
  homeTeam: string;
  awayTeam: string;
  pick: 'H' | 'A';
  pickedTeam: string;
  confidence: string;
}

export interface PickOverride {
  homeTeamId: string;
  awayTeamId: string;
  winnerId: string; // DB team ID of the team to pick
}

export interface SubmitResult {
  success: boolean;
  round: number;
  tips: TipSubmission[];
  message: string;
  errors: string[];
}

function getCredentials() {
  const username = process.env.ITIPFOOTY_USERNAME;
  const password = process.env.ITIPFOOTY_PASSWORD;
  const compId = process.env.ITIPFOOTY_COMP_ID;

  if (!username || !password || !compId) {
    throw new Error(
      'Missing iTipFooty credentials. Set ITIPFOOTY_USERNAME, ITIPFOOTY_PASSWORD, and ITIPFOOTY_COMP_ID in backend/.env'
    );
  }

  return { username, password, compId };
}

/**
 * Login to iTipFooty and return the session cookie string.
 */
export async function login(): Promise<string> {
  const { username, password } = getCredentials();

  const body = new URLSearchParams({
    todo: 'weblogmemin',
    tippingname: username,
    password: password,
  });

  const res = await fetch(`${BASE_URL}/services/login.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      Referer: `${BASE_URL}/`,
      Origin: BASE_URL,
    },
    body: body.toString(),
    redirect: 'manual',
  });

  if (res.status !== 302) {
    throw new Error(`Login failed with status ${res.status}`);
  }

  const setCookie = res.headers.getSetCookie?.() ?? [];
  const phpSession = setCookie
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith('PHPSESSID='));

  if (!phpSession) {
    throw new Error('Login succeeded but no PHPSESSID cookie returned');
  }

  return phpSession;
}

/**
 * Fetch the tipping page and parse the form structure.
 * If round is omitted, iTipFooty serves the current round and the actual
 * round number is detected from the final URL after redirect.
 */
export async function fetchTippingPage(
  sessionCookie: string,
  round?: number
): Promise<ITipFormData> {
  const { compId } = getCredentials();

  const url = round != null
    ? `${BASE_URL}/tipping.php?compid=${compId}&round=${round}`
    : `${BASE_URL}/tipping.php?compid=${compId}`;

  const res = await fetch(url, {
    headers: {
      Cookie: sessionCookie,
      'User-Agent': USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch tipping page: ${res.status}`);
  }

  const html = await res.text();

  // Detect the actual round being shown when none was specified.
  // iTipFooty redirects to ?round=N for the current round.
  let detectedRound = round;
  if (detectedRound == null) {
    try {
      detectedRound = parseInt(new URL(res.url).searchParams.get('round') ?? '', 10) || undefined;
    } catch { /* ignore */ }
    // Fallback: scan the HTML for a round=N occurrence
    if (!detectedRound) {
      const m = html.match(/[?&]round=(\d+)/);
      if (m) detectedRound = parseInt(m[1], 10);
    }
  }

  // Extract hidden form fields
  const postMemberId =
    html.match(/name="postmemberid"[^>]*value="(\d+)"/)?.[1] ?? '';
  const tipRef =
    html.match(/name="tipref"[^>]*value="(\d+)"/)?.[1] ?? '';
  const jokerCount =
    html.match(/name="JOKERCOUNT"[^>]*value="(\d+)"/)?.[1] ?? '0';
  const currentJokerCount =
    html.match(/name="CURRENTJOKERCOUNT"[^>]*value="(\d+)"/)?.[1] ?? '0';
  const marginIncluded =
    (html.match(/var marginincluded\s*=\s*"(\w+)"/)?.[1] ?? 'NO') === 'YES';

  if (!postMemberId || !tipRef) {
    throw new Error('Could not parse tipping form fields from page');
  }

  // Parse games: find radio buttons with name="N" value="H"
  // Each game has: <input ... name="N" ... value="H"> and <input ... name="N" ... value="A">
  // Team names are in <span id="longteamname"> elements adjacent to radio buttons
  const games: ITipGame[] = [];

  // Match game patterns: radio button with H value, then find surrounding team names
  const gamePattern =
    /id="(\d+)"\s+value="H"\s+type="radio"\s+name="\1"[^>]*class="form-check-input[^"]*"[^>]*(disabled)?/g;
  // Also match hidden inputs for locked games: <input name="N" type="hidden" id="N" value="H">
  const hiddenGamePattern =
    /input\s+name="(\d+)"\s+type="hidden"\s+id="\1"\s+value="(H|A)"/g;

  const gameNumbers = new Set<number>();

  let match;
  while ((match = gamePattern.exec(html)) !== null) {
    const gameNum = parseInt(match[1], 10);
    const locked = !!match[2];
    gameNumbers.add(gameNum);
    games.push({
      gameNumber: gameNum,
      homeTeam: '',
      awayTeam: '',
      homeTeamId: '',
      awayTeamId: '',
      locked,
    });
  }

  // Also find locked (hidden input) games
  while ((match = hiddenGamePattern.exec(html)) !== null) {
    const gameNum = parseInt(match[1], 10);
    if (!gameNumbers.has(gameNum)) {
      gameNumbers.add(gameNum);
      games.push({
        gameNumber: gameNum,
        homeTeam: '',
        awayTeam: '',
        homeTeamId: '',
        awayTeamId: '',
        locked: true,
      });
    }
  }

  games.sort((a, b) => a.gameNumber - b.gameNumber);

  // Extract team names per game from longteamname spans
  // Pattern: within each game section, home team longteamname appears first (left side),
  // away team longteamname appears second (right side)
  // We'll find all longteamname occurrences and pair them
  // Use [\s\S]*? (non-greedy) so any HTML content or whitespace between
  // the opening element and <strong> is accepted, regardless of nesting.
  const teamNamePattern =
    /id="longteamname"[^>]*>[\s\S]*?<strong[^>]*>([^<]+)<\/strong>/g;
  const teamNames: string[] = [];
  while ((match = teamNamePattern.exec(html)) !== null) {
    teamNames.push(match[1].trim());
  }

  // Team names come in pairs: [home1, away1, home2, away2, ...]
  for (let i = 0; i < games.length && i * 2 + 1 < teamNames.length; i++) {
    games[i].homeTeam = teamNames[i * 2];
    games[i].awayTeam = teamNames[i * 2 + 1];
    games[i].homeTeamId =
      ITIP_TO_TEAM_ID[games[i].homeTeam.toLowerCase()] ?? '';
    games[i].awayTeamId =
      ITIP_TO_TEAM_ID[games[i].awayTeam.toLowerCase()] ?? '';
  }

  return {
    postMemberId,
    tipRef,
    jokerCount,
    currentJokerCount,
    games,
    marginIncluded,
    round: detectedRound ?? round ?? 0,
  };
}

/**
 * Submit tips to iTipFooty.
 */
export async function submitTipsToSite(
  sessionCookie: string,
  formData: ITipFormData,
  tips: Map<number, 'H' | 'A'>
): Promise<void> {
  const { compId } = getCredentials();

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

  for (const [gameNum, pick] of tips) {
    body.set(String(gameNum), pick);
  }

  const res = await fetch(`${BASE_URL}/services/SubmitTips.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      Referer: `${BASE_URL}/tipping.php?compid=${compId}&round=${formData.round}`,
      Origin: BASE_URL,
      Cookie: sessionCookie,
    },
    body: body.toString(),
    redirect: 'manual',
  });

  // iTipFooty redirects back to tipping page on success (302)
  if (res.status !== 302 && res.status !== 200) {
    const text = await res.text();
    throw new Error(
      `Tip submission failed with status ${res.status}: ${text.slice(0, 200)}`
    );
  }
}

/**
 * Main function: generate predictions and submit as tips to iTipFooty.
 * If pickOverrides is provided, those selections are used instead of the prediction engine.
 */
export async function submitTips(
  prisma: PrismaClient,
  roundNum?: number,
  pickOverrides?: PickOverride[]
): Promise<SubmitResult> {
  const errors: string[] = [];
  const tipSubmissions: TipSubmission[] = [];

  try {
    const season = String(new Date().getFullYear());

    // 1. Login to iTipFooty
    console.log('[iTipFooty] Logging in...');
    const sessionCookie = await login();
    console.log('[iTipFooty] Login successful');

    // 2. Fetch and parse the tipping page — let iTipFooty auto-select the current round
    //    (passing roundNum only if explicitly provided by the caller)
    console.log('[iTipFooty] Fetching tipping page...');
    const formData = await fetchTippingPage(sessionCookie, roundNum);
    const actualRound = formData.round || roundNum || 0;
    console.log(`[iTipFooty] iTipFooty is showing Round ${actualRound} (${formData.games.length} games, ${formData.games.filter((g) => !g.locked).length} unlocked)`);

    // 3. Get predictions for the round iTipFooty is showing
    const predictions = await predictRound(prisma, season, actualRound || undefined);
    console.log(`[iTipFooty] Got ${predictions.length} predictions for Round ${actualRound}`);

    // 4. Map predictions to iTipFooty game selections
    const tips = new Map<number, 'H' | 'A'>();

    for (const game of formData.games) {
      if (game.locked) {
        errors.push(
          `Game ${game.gameNumber} (${game.homeTeam} vs ${game.awayTeam}) is locked — skipping`
        );
        continue;
      }

      if (!game.homeTeamId || !game.awayTeamId) {
        errors.push(
          `Game ${game.gameNumber}: could not map team names "${game.homeTeam}" / "${game.awayTeam}" to DB IDs`
        );
        continue;
      }

      // Check for an explicit user override first
      const override = pickOverrides?.find(
        (o) =>
          (o.homeTeamId === game.homeTeamId && o.awayTeamId === game.awayTeamId) ||
          (o.homeTeamId === game.awayTeamId && o.awayTeamId === game.homeTeamId)
      );

      // Find matching prediction (used as fallback when no override)
      const prediction = predictions.find(
        (p) =>
          (p.homeTeam.id === game.homeTeamId &&
            p.awayTeam.id === game.awayTeamId) ||
          (p.homeTeam.id === game.awayTeamId &&
            p.awayTeam.id === game.homeTeamId)
      );

      if (!override && !prediction) {
        errors.push(
          `No prediction found for ${game.homeTeam} vs ${game.awayTeam} — run the scraper to populate this fixture`
        );
        continue;
      }

      const winnerId = override?.winnerId ?? prediction!.predictedWinnerId;
      const pick: 'H' | 'A' = winnerId === game.homeTeamId ? 'H' : 'A';
      tips.set(game.gameNumber, pick);

      tipSubmissions.push({
        gameNumber: game.gameNumber,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        pick,
        pickedTeam:
          pick === 'H' ? game.homeTeam : game.awayTeam,
        confidence: prediction?.confidence ?? 'MANUAL',
      });
    }

    if (tips.size === 0) {
      return {
        success: false,
        round: actualRound,
        tips: tipSubmissions,
        message: 'No tips to submit — all games locked or unmatched',
        errors,
      };
    }

    // 5. Submit tips
    console.log(`[iTipFooty] Submitting ${tips.size} tips...`);
    await submitTipsToSite(sessionCookie, formData, tips);
    console.log('[iTipFooty] Tips submitted successfully!');

    // 6. Log the submission
    await prisma.dataSourceLog.create({
      data: {
        source: 'itipfooty',
        status: errors.length > 0 ? 'partial' : 'success',
        message: `Submitted ${tips.size} tips for Round ${actualRound}: ${tipSubmissions.map((t) => `${t.pickedTeam} (${t.confidence})`).join(', ')}`,
        recordsAffected: tips.size,
      },
    });

    // 7. Persist picks to the Pick table for analytics tracking
    try {
      const roundId = `${season}-R${actualRound}`;
      for (const game of formData.games) {
        if (game.locked || !game.homeTeamId || !game.awayTeamId) continue;
        const submission = tipSubmissions.find((t) => t.gameNumber === game.gameNumber);
        if (!submission) continue;
        const fixture = await prisma.fixture.findFirst({
          where: { homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, roundId },
        });
        if (!fixture) continue;
        const pickedTeamId = tips.get(game.gameNumber) === 'H' ? game.homeTeamId! : game.awayTeamId!;
        const confidence = (submission.confidence ?? 'MEDIUM').toLowerCase();
        const existing = await prisma.pick.findFirst({ where: { fixtureId: fixture.id } });
        if (existing) {
          await prisma.pick.update({ where: { id: existing.id }, data: { pickedTeamId, confidence } });
        } else {
          await prisma.pick.create({ data: { fixtureId: fixture.id, pickedTeamId, confidence } });
        }
      }
    } catch (pickErr) {
      console.error('[iTipFooty] Failed to persist picks:', pickErr instanceof Error ? pickErr.message : pickErr);
    }

    return {
      success: true,
      round: actualRound,
      tips: tipSubmissions,
      message: `Successfully submitted ${tips.size} tips for Round ${actualRound}`,
      errors,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    console.error('[iTipFooty] Error:', msg);

    return {
      success: false,
      round: roundNum ?? 0,
      tips: tipSubmissions,
      message: `Failed to submit tips: ${msg}`,
      errors,
    };
  }
}

/**
 * Check if iTipFooty credentials are configured.
 */
export function isConfigured(): boolean {
  return !!(
    process.env.ITIPFOOTY_USERNAME &&
    process.env.ITIPFOOTY_PASSWORD &&
    process.env.ITIPFOOTY_COMP_ID
  );
}
