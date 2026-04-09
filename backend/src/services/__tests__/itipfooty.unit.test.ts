import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// Mock predictRound before importing itipfooty (which imports analysis)
vi.mock('../analysis.js', () => ({
  predictRound: vi.fn(),
}));

import { login, fetchTippingPage, submitTipsToSite, submitTips, isConfigured, parseTeamStatsPage } from '../itipfooty.js';
import { predictRound } from '../analysis.js';

const MOCK_SESSION = 'PHPSESSID=abc123xyz';

// Minimal HTML that satisfies the itipfooty parser.
// Note: tipref was removed from iTipFooty's form in 2026 — it is no longer required.
const MOCK_TIPPING_HTML = `
  <input name="postmemberid" type="hidden" value="99999">
  <input name="JOKERCOUNT" type="hidden" value="1">
  <input name="CURRENTJOKERCOUNT" type="hidden" value="0">
  <input name="todo" type="hidden" value="add">
  var marginincluded = "NO"
  <input id="1" value="H" type="radio" name="1" class="form-check-input">
  <span id="longteamname"><strong>Storm</strong></span>
  <span id="longteamname"><strong>Panthers</strong></span>
  <input id="2" value="H" type="radio" name="2" class="form-check-input">
  <span id="longteamname"><strong>Broncos</strong></span>
  <span id="longteamname"><strong>Roosters</strong></span>
`;

const MOCK_TIPPING_HTML_WITH_LOCKED = `
  <input name="postmemberid" type="hidden" value="99999">
  <input name="JOKERCOUNT" type="hidden" value="1">
  <input name="CURRENTJOKERCOUNT" type="hidden" value="0">
  <input name="todo" type="hidden" value="add">
  var marginincluded = "YES"
  <input name="3" type="hidden" id="3" value="H">
  <span id="longteamname"><strong>Storm</strong></span>
  <span id="longteamname"><strong>Panthers</strong></span>
`;

// Round with one locked game (prior pick = A) and one unlocked game.
// The locked game uses a hidden input; the unlocked game has a radio button
// where 'disabled' appears *before* class= to exercise the fixed detection.
const MOCK_TIPPING_HTML_MIXED = `
  <input name="postmemberid" type="hidden" value="99999">
  <input name="JOKERCOUNT" type="hidden" value="1">
  <input name="CURRENTJOKERCOUNT" type="hidden" value="0">
  <input name="todo" type="hidden" value="add">
  var marginincluded = "NO"
  <input name="1" type="hidden" id="1" value="A">
  <span id="longteamname"><strong>Broncos</strong></span>
  <span id="longteamname"><strong>Roosters</strong></span>
  <input id="2" value="H" type="radio" name="2" class="form-check-input">
  <span id="longteamname"><strong>Storm</strong></span>
  <span id="longteamname"><strong>Panthers</strong></span>
`;

// Locked game where 'disabled' appears before class= (tests the fixed gamePattern)
const MOCK_TIPPING_HTML_DISABLED_BEFORE_CLASS = `
  <input name="postmemberid" type="hidden" value="99999">
  <input name="JOKERCOUNT" type="hidden" value="1">
  <input name="CURRENTJOKERCOUNT" type="hidden" value="0">
  <input name="todo" type="hidden" value="add">
  var marginincluded = "NO"
  <input id="1" value="H" type="radio" name="1" disabled class="form-check-input">
  <span id="longteamname"><strong>Storm</strong></span>
  <span id="longteamname"><strong>Panthers</strong></span>
`;

// ---------------------------------------------------------------------------
// isConfigured
// ---------------------------------------------------------------------------
describe('isConfigured', () => {
  it('returns true when all env vars are set', () => {
    expect(isConfigured()).toBe(true); // set in vitest.config.ts env
  });

  it('returns false when any env var is missing', () => {
    const orig = process.env.ITIPFOOTY_USERNAME;
    delete process.env.ITIPFOOTY_USERNAME;
    expect(isConfigured()).toBe(false);
    process.env.ITIPFOOTY_USERNAME = orig;
  });
});

// ---------------------------------------------------------------------------
// login()
// ---------------------------------------------------------------------------
describe('login()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when ITIPFOOTY_USERNAME is missing', async () => {
    const orig = process.env.ITIPFOOTY_USERNAME;
    delete process.env.ITIPFOOTY_USERNAME;
    await expect(login()).rejects.toThrow('Missing iTipFooty credentials');
    process.env.ITIPFOOTY_USERNAME = orig;
  });

  it('throws when response status is not 302', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      headers: { getSetCookie: () => [] },
    });
    await expect(login()).rejects.toThrow('Login failed with status 200');
  });

  it('throws when no PHPSESSID cookie returned', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 302,
      headers: { getSetCookie: () => ['someOtherCookie=abc'] },
    });
    await expect(login()).rejects.toThrow('no PHPSESSID cookie');
  });

  it('returns the PHPSESSID= cookie string on success', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 302,
      headers: { getSetCookie: () => ['PHPSESSID=abc123; Path=/; HttpOnly'] },
    });
    const result = await login();
    expect(result).toBe('PHPSESSID=abc123');
  });

  it('POSTs to /services/login.php', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 302,
      headers: { getSetCookie: () => ['PHPSESSID=sess1; Path=/'] },
    });
    await login();
    const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/services/login.php');
    expect(opts.method).toBe('POST');
  });

  it('sends correct Content-Type header', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 302,
      headers: { getSetCookie: () => ['PHPSESSID=sess1; Path=/'] },
    });
    await login();
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });
});

// ---------------------------------------------------------------------------
// fetchTippingPage()
// ---------------------------------------------------------------------------
describe('fetchTippingPage()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when response is not ok', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(fetchTippingPage(MOCK_SESSION, 1)).rejects.toThrow('Failed to fetch tipping page: 403');
  });

  it('throws when postMemberId cannot be parsed', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => '<html>no form fields here</html>',
    });
    await expect(fetchTippingPage(MOCK_SESSION, 1)).rejects.toThrow('Could not parse tipping form fields');
  });

  it('parses postMemberId correctly (tipRef is optional)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => MOCK_TIPPING_HTML,
    });
    const result = await fetchTippingPage(MOCK_SESSION, 1);
    expect(result.postMemberId).toBe('99999');
    expect(result.tipRef).toBe('');
    expect(result.todoAction).toBe('add');
    expect(result.jokerCount).toBe('1');
    expect(result.currentJokerCount).toBe('0');
  });

  it('parses marginIncluded=NO', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => MOCK_TIPPING_HTML,
    });
    const result = await fetchTippingPage(MOCK_SESSION, 1);
    expect(result.marginIncluded).toBe(false);
  });

  it('parses marginIncluded=YES', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => MOCK_TIPPING_HTML_WITH_LOCKED,
    });
    const result = await fetchTippingPage(MOCK_SESSION, 1);
    expect(result.marginIncluded).toBe(true);
  });

  it('extracts unlocked games', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => MOCK_TIPPING_HTML,
    });
    const result = await fetchTippingPage(MOCK_SESSION, 1);
    const unlocked = result.games.filter(g => !g.locked);
    expect(unlocked).toHaveLength(2);
  });

  it('extracts locked games from hidden inputs', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => MOCK_TIPPING_HTML_WITH_LOCKED,
    });
    const result = await fetchTippingPage(MOCK_SESSION, 1);
    const locked = result.games.filter(g => g.locked);
    expect(locked).toHaveLength(1);
    expect(locked[0].locked).toBe(true);
  });

  it('stores existingPick from hidden input on locked games', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => MOCK_TIPPING_HTML_WITH_LOCKED,
    });
    const result = await fetchTippingPage(MOCK_SESSION, 1);
    const locked = result.games.find(g => g.locked)!;
    expect(locked.existingPick).toBe('H');
  });

  it('detects locked=true when disabled appears before class', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => MOCK_TIPPING_HTML_DISABLED_BEFORE_CLASS,
    });
    const result = await fetchTippingPage(MOCK_SESSION, 1);
    expect(result.games).toHaveLength(1);
    expect(result.games[0].locked).toBe(true);
  });

  it('parses mixed round with one locked (hidden) and one unlocked game', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => MOCK_TIPPING_HTML_MIXED,
    });
    const result = await fetchTippingPage(MOCK_SESSION, 1);
    expect(result.games).toHaveLength(2);
    const locked = result.games.find(g => g.gameNumber === 1)!;
    const unlocked = result.games.find(g => g.gameNumber === 2)!;
    expect(locked.locked).toBe(true);
    expect(locked.existingPick).toBe('A');
    expect(locked.homeTeamId).toBe('BRI');
    expect(locked.awayTeamId).toBe('SYD');
    expect(unlocked.locked).toBe(false);
    expect(unlocked.homeTeamId).toBe('MEL');
    expect(unlocked.awayTeamId).toBe('PEN');
  });

  it('maps "Storm" to MEL and "Panthers" to PEN', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => MOCK_TIPPING_HTML,
    });
    const result = await fetchTippingPage(MOCK_SESSION, 1);
    const game1 = result.games.find(g => g.gameNumber === 1)!;
    expect(game1.homeTeamId).toBe('MEL');
    expect(game1.awayTeamId).toBe('PEN');
  });

  it('maps "Broncos" to BRI and "Roosters" to SYD', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => MOCK_TIPPING_HTML,
    });
    const result = await fetchTippingPage(MOCK_SESSION, 1);
    const game2 = result.games.find(g => g.gameNumber === 2)!;
    expect(game2.homeTeamId).toBe('BRI');
    expect(game2.awayTeamId).toBe('SYD');
  });

  it('sets empty string for unknown team name', async () => {
    const html = MOCK_TIPPING_HTML.replace('Broncos', 'UnknownTeam99');
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    });
    const result = await fetchTippingPage(MOCK_SESSION, 1);
    const game2 = result.games.find(g => g.gameNumber === 2)!;
    expect(game2.homeTeamId).toBe('');
  });

  it('sorts games in ascending game number order', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => MOCK_TIPPING_HTML,
    });
    const result = await fetchTippingPage(MOCK_SESSION, 1);
    for (let i = 1; i < result.games.length; i++) {
      expect(result.games[i].gameNumber).toBeGreaterThan(result.games[i - 1].gameNumber);
    }
  });
});

// ---------------------------------------------------------------------------
// submitTipsToSite()
// ---------------------------------------------------------------------------
describe('submitTipsToSite()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mockFormData = {
    postMemberId: '99999',
    tipRef: '',
    todoAction: 'add',
    jokerCount: '1',
    currentJokerCount: '0',
    games: [],
    marginIncluded: false,
    round: 1,
  };

  it('throws when response is neither 200 nor 302', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 500,
      text: async () => 'Internal Server Error',
    });
    const tips = new Map<number, 'H' | 'A'>([[1, 'H']]);
    await expect(submitTipsToSite(MOCK_SESSION, mockFormData, tips)).rejects.toThrow('status 500');
  });

  it('succeeds on 302 response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: 302 });
    const tips = new Map<number, 'H' | 'A'>([[1, 'H']]);
    await expect(submitTipsToSite(MOCK_SESSION, mockFormData, tips)).resolves.not.toThrow();
  });

  it('succeeds on 200 response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: 200 });
    const tips = new Map<number, 'H' | 'A'>([[1, 'H']]);
    await expect(submitTipsToSite(MOCK_SESSION, mockFormData, tips)).resolves.not.toThrow();
  });

  it('POSTs to /services/SubmitTips.php', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: 302 });
    const tips = new Map<number, 'H' | 'A'>([[1, 'H']]);
    await submitTipsToSite(MOCK_SESSION, mockFormData, tips);
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/services/SubmitTips.php');
  });

  it('encodes tip as gameNumber=H or gameNumber=A in body', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: 302 });
    const tips = new Map<number, 'H' | 'A'>([[1, 'H'], [2, 'A']]);
    await submitTipsToSite(MOCK_SESSION, mockFormData, tips);
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = opts.body as string;
    expect(body).toContain('1=H');
    expect(body).toContain('2=A');
  });

  it('includes session cookie in Cookie header', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: 302 });
    const tips = new Map<number, 'H' | 'A'>([[1, 'H']]);
    await submitTipsToSite(MOCK_SESSION, mockFormData, tips);
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Cookie']).toBe(MOCK_SESSION);
  });

  it('includes existingPick for locked games in POST body to preserve them on iTipFooty', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: 302 });
    const formDataWithLocked = {
      ...mockFormData,
      games: [
        { gameNumber: 1, homeTeam: 'Broncos', awayTeam: 'Roosters', homeTeamId: 'BRI', awayTeamId: 'SYD', locked: true, existingPick: 'A' as const },
        { gameNumber: 2, homeTeam: 'Storm', awayTeam: 'Panthers', homeTeamId: 'MEL', awayTeamId: 'PEN', locked: false },
      ],
    };
    const tips = new Map<number, 'H' | 'A'>([[2, 'H']]);
    await submitTipsToSite(MOCK_SESSION, formDataWithLocked, tips);
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = opts.body as string;
    // Locked game 1's existing pick must be preserved
    expect(body).toContain('1=A');
    // Unlocked game 2's new pick must be included
    expect(body).toContain('2=H');
  });

  it('does not include locked games without an existingPick in POST body', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: 302 });
    const formDataNoExisting = {
      ...mockFormData,
      games: [
        { gameNumber: 1, homeTeam: 'Broncos', awayTeam: 'Roosters', homeTeamId: 'BRI', awayTeamId: 'SYD', locked: true },
      ],
    };
    const tips = new Map<number, 'H' | 'A'>();
    await submitTipsToSite(MOCK_SESSION, formDataNoExisting, tips);
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = opts.body as string;
    expect(body).not.toContain('1=H');
    expect(body).not.toContain('1=A');
  });
});

// ---------------------------------------------------------------------------
// submitTips() — orchestrator
// ---------------------------------------------------------------------------
describe('submitTips()', () => {
  const mockPrisma = {
    fixture: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    pick: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
    dataSourceLog: { create: vi.fn().mockResolvedValue({}) },
    round: { findFirst: vi.fn() },
  } as unknown as PrismaClient;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns success:false when predictRound returns empty array', async () => {
    vi.mocked(predictRound).mockResolvedValueOnce([]);

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        status: 302,
        headers: { getSetCookie: () => ['PHPSESSID=sess1; Path=/'] },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_TIPPING_HTML,
      });

    const result = await submitTips(mockPrisma, 1);
    expect(result.success).toBe(false);
    // With no predictions and no overrides, all games are unmatched
    expect(result.message).toContain('No tips to submit');
  });

  it('picks H when predictedWinnerId matches homeTeamId', async () => {
    vi.mocked(predictRound).mockResolvedValueOnce([
      {
        fixtureId: 'fix-1',
        homeTeam: { id: 'MEL' } as never,
        awayTeam: { id: 'PEN' } as never,
        predictedWinnerId: 'MEL',
        predictedWinner: 'Storm',
        confidence: 'HIGH',
        confidenceScore: 70,
        factors: [],
        summary: '',
        venue: 'AAMI Park',
        h2h: '',
      },
    ]);

    // fixture.findUnique returns round data
    (mockPrisma.fixture.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      round: { number: 1 },
    });

    // login → 302 + PHPSESSID
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        status: 302,
        headers: { getSetCookie: () => ['PHPSESSID=sess1; Path=/'] },
      })
      // fetchTippingPage → 200 + HTML
      .mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_TIPPING_HTML,
      })
      // submitTipsToSite → 302
      .mockResolvedValueOnce({ status: 302 });

    const result = await submitTips(mockPrisma, 1);
    expect(result.success).toBe(true);
    const melTip = result.tips.find(t => t.homeTeam === 'Storm');
    expect(melTip?.pick).toBe('H');
  });

  it('picks A when predictedWinnerId matches awayTeamId', async () => {
    vi.mocked(predictRound).mockResolvedValueOnce([
      {
        fixtureId: 'fix-1',
        homeTeam: { id: 'MEL' } as never,
        awayTeam: { id: 'PEN' } as never,
        predictedWinnerId: 'PEN',
        predictedWinner: 'Panthers',
        confidence: 'MEDIUM',
        confidenceScore: 55,
        factors: [],
        summary: '',
        venue: 'AAMI Park',
        h2h: '',
      },
    ]);

    (mockPrisma.fixture.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      round: { number: 1 },
    });

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        status: 302,
        headers: { getSetCookie: () => ['PHPSESSID=sess1; Path=/'] },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_TIPPING_HTML,
      })
      .mockResolvedValueOnce({ status: 302 });

    const result = await submitTips(mockPrisma, 1);
    expect(result.success).toBe(true);
    const penTip = result.tips.find(t => t.homeTeam === 'Storm');
    expect(penTip?.pick).toBe('A');
  });

  it('returns success:false with error message on fetch exception', async () => {
    vi.mocked(predictRound).mockResolvedValueOnce([
      {
        fixtureId: 'fix-1',
        homeTeam: { id: 'MEL' } as never,
        awayTeam: { id: 'PEN' } as never,
        predictedWinnerId: 'MEL',
        predictedWinner: 'Storm',
        confidence: 'HIGH',
        confidenceScore: 70,
        factors: [],
        summary: '',
        venue: 'AAMI Park',
        h2h: '',
      },
    ]);

    (mockPrisma.fixture.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      round: { number: 1 },
    });

    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network timeout'));

    const result = await submitTips(mockPrisma, 1);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Network timeout');
  });

  it('persists picks to Pick table after successful submission', async () => {
    vi.mocked(predictRound).mockResolvedValueOnce([
      {
        fixtureId: 'fix-1',
        homeTeam: { id: 'MEL' } as never,
        awayTeam: { id: 'PEN' } as never,
        predictedWinnerId: 'MEL',
        predictedWinner: 'Storm',
        confidence: 'HIGH',
        confidenceScore: 70,
        factors: [],
        summary: '',
        venue: 'AAMI Park',
        h2h: '',
      },
    ]);

    (mockPrisma.fixture.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      round: { number: 1 },
    });

    // fixture.findFirst returns a real fixture for pick persistence
    (mockPrisma.fixture.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'fix-1',
      homeTeamId: 'MEL',
      awayTeamId: 'PEN',
    });

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        status: 302,
        headers: { getSetCookie: () => ['PHPSESSID=sess1; Path=/'] },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_TIPPING_HTML,
      })
      .mockResolvedValueOnce({ status: 302 });

    await submitTips(mockPrisma, 1);

    // pick.findFirst is called to check for existing pick — it returns null (default)
    // so pick.create should be called
    expect(mockPrisma.pick.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fixtureId: 'fix-1',
          pickedTeamId: 'MEL',
        }),
      })
    );
  });

  it('does not persist picks when submission fails', async () => {
    vi.mocked(predictRound).mockResolvedValueOnce([
      {
        fixtureId: 'fix-1',
        homeTeam: { id: 'MEL' } as never,
        awayTeam: { id: 'PEN' } as never,
        predictedWinnerId: 'MEL',
        predictedWinner: 'Storm',
        confidence: 'HIGH',
        confidenceScore: 70,
        factors: [],
        summary: '',
        venue: 'AAMI Park',
        h2h: '',
      },
    ]);

    (mockPrisma.fixture.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      round: { number: 1 },
    });

    // Login succeeds, tipping page fetch succeeds, but submission fails
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        status: 302,
        headers: { getSetCookie: () => ['PHPSESSID=sess1; Path=/'] },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_TIPPING_HTML,
      })
      .mockResolvedValueOnce({
        status: 500,
        text: async () => 'Internal Server Error',
      });

    const result = await submitTips(mockPrisma, 1);
    expect(result.success).toBe(false);

    // pick.create should NOT have been called since submission failed
    expect(mockPrisma.pick.create).not.toHaveBeenCalled();
  });

  it('logs to DataSourceLog on success', async () => {
    vi.mocked(predictRound).mockResolvedValueOnce([
      {
        fixtureId: 'fix-1',
        homeTeam: { id: 'MEL' } as never,
        awayTeam: { id: 'PEN' } as never,
        predictedWinnerId: 'MEL',
        predictedWinner: 'Storm',
        confidence: 'HIGH',
        confidenceScore: 70,
        factors: [],
        summary: '',
        venue: 'AAMI Park',
        h2h: '',
      },
    ]);

    (mockPrisma.fixture.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      round: { number: 1 },
    });

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        status: 302,
        headers: { getSetCookie: () => ['PHPSESSID=sess1; Path=/'] },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_TIPPING_HTML,
      })
      .mockResolvedValueOnce({ status: 302 });

    await submitTips(mockPrisma, 1);

    expect(mockPrisma.dataSourceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'itipfooty',
          // 'success' when all games matched; 'partial' when some had errors
          status: expect.stringMatching(/^(success|partial)$/),
        }),
      })
    );
  });

  it('includes "run the scraper" hint in errors when no prediction found for a game', async () => {
    vi.mocked(predictRound).mockResolvedValueOnce([]);

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        status: 302,
        headers: { getSetCookie: () => ['PHPSESSID=sess1; Path=/'] },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_TIPPING_HTML,
      });

    const result = await submitTips(mockPrisma, 1);
    expect(result.success).toBe(false);
    // Each unmatched game should have an actionable error with scraper hint
    const scraperErrors = result.errors.filter(e => e.includes('run the scraper'));
    expect(scraperErrors.length).toBeGreaterThanOrEqual(1);
    // One error per unlocked game (MOCK_TIPPING_HTML has 2 unlocked games)
    expect(scraperErrors.length).toBe(2);
  });

  it('returns errors listing each unmatched game when predictions are empty', async () => {
    vi.mocked(predictRound).mockResolvedValueOnce([]);

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        status: 302,
        headers: { getSetCookie: () => ['PHPSESSID=sess1; Path=/'] },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_TIPPING_HTML,
      });

    const result = await submitTips(mockPrisma, 6);
    expect(result.success).toBe(false);
    expect(result.round).toBe(6);
    // Each game should appear in errors by name
    const stormError = result.errors.find(e => e.includes('Storm') || e.includes('Panthers'));
    expect(stormError).toBeTruthy();
  });

  it('returns success:false when predictRound throws (DB unavailable)', async () => {
    vi.mocked(predictRound).mockRejectedValueOnce(new Error('DB connection failed'));

    (mockPrisma.fixture.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      round: { number: 6 },
    });

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        status: 302,
        headers: { getSetCookie: () => ['PHPSESSID=sess1; Path=/'] },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_TIPPING_HTML,
      });

    const result = await submitTips(mockPrisma, 6);
    expect(result.success).toBe(false);
    expect(result.message).toContain('DB connection failed');
  });

  it('logs to DataSourceLog on failure', async () => {
    // Login fails (non-302 response)
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        status: 401,
        headers: { getSetCookie: () => [] },
      });

    const result = await submitTips(mockPrisma, 1);
    expect(result.success).toBe(false);

    expect(mockPrisma.dataSourceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'itipfooty',
          status: 'error',
          recordsAffected: 0,
        }),
      })
    );
  });

  it('logs to DataSourceLog when no tips to submit', async () => {
    vi.mocked(predictRound).mockResolvedValueOnce([]);

    // Use locked-only HTML so all games are locked and no tips can be submitted
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        status: 302,
        headers: { getSetCookie: () => ['PHPSESSID=sess1; Path=/'] },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_TIPPING_HTML_WITH_LOCKED,
      });

    const result = await submitTips(mockPrisma, 1);
    expect(result.success).toBe(false);

    expect(mockPrisma.dataSourceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'itipfooty',
          status: 'error',
          message: expect.stringContaining('No tips to submit'),
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// parseTeamStatsPage
// ---------------------------------------------------------------------------

const MOCK_TEAMSTATS_HTML = `
  <table class="table">
    <tr><td><div align="center"><font size="2">Dragons</font></div></td>
        <td><div align="center"><font size="2">Stats</font></div></td>
        <td><div align="center"><font size="2">Cowboys</font></div></td></tr>
    <tr class="bg-light">
      <td><div align="center">28%</div></td>
      <td><div align="center"><span>iTipFooty Tipping Ratio</span></div></td>
      <td><div align="center">72%</div></td>
    </tr>
  </table>
  <select name="roundgames" id="roundgames">
    <option value="teamstats.php?compid=1&round=5&code=NRL&game=1" >Dolphins vs Sea Eagles</option>
    <option value="teamstats.php?compid=1&round=5&code=NRL&game=2" >Rabbitohs vs Bulldogs</option>
    <option value="teamstats.php?compid=1&round=5&code=NRL&game=3" >Panthers vs Storm</option>
    <option value="teamstats.php?compid=1&round=5&code=NRL&game=4" SELECTED>Dragons vs Cowboys</option>
  </select>
`;

describe('parseTeamStatsPage', () => {
  it('extracts tipping ratio percentages', () => {
    const result = parseTeamStatsPage(MOCK_TEAMSTATS_HTML);
    expect(result).not.toBeNull();
    expect(result!.homeTipPct).toBe(28);
    expect(result!.awayTipPct).toBe(72);
  });

  it('extracts game listings from dropdown', () => {
    const result = parseTeamStatsPage(MOCK_TEAMSTATS_HTML);
    expect(result!.games).toHaveLength(4);
    expect(result!.games[0]).toEqual({ gameNumber: 1, homeTeam: 'Dolphins', awayTeam: 'Sea Eagles' });
    expect(result!.games[3]).toEqual({ gameNumber: 4, homeTeam: 'Dragons', awayTeam: 'Cowboys' });
  });

  it('returns null when tipping ratio is not found', () => {
    const result = parseTeamStatsPage('<html><body>No stats here</body></html>');
    expect(result).toBeNull();
  });
});
