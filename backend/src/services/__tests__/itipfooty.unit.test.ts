import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// Mock predictRound before importing itipfooty (which imports analysis)
vi.mock('../analysis.js', () => ({
  predictRound: vi.fn(),
}));

import { login, fetchTippingPage, submitTipsToSite, submitTips, isConfigured } from '../itipfooty.js';
import { predictRound } from '../analysis.js';

const MOCK_SESSION = 'PHPSESSID=abc123xyz';

// Minimal HTML that satisfies the itipfooty parser
const MOCK_TIPPING_HTML = `
  <input name="postmemberid" value="99999">
  <input name="tipref" value="88888">
  <input name="JOKERCOUNT" value="1">
  <input name="CURRENTJOKERCOUNT" value="0">
  var marginincluded = "NO"
  <input id="1" value="H" type="radio" name="1" class="form-check-input">
  <span id="longteamname"><strong>Storm</strong></span>
  <span id="longteamname"><strong>Panthers</strong></span>
  <input id="2" value="H" type="radio" name="2" class="form-check-input">
  <span id="longteamname"><strong>Broncos</strong></span>
  <span id="longteamname"><strong>Roosters</strong></span>
`;

const MOCK_TIPPING_HTML_WITH_LOCKED = `
  <input name="postmemberid" value="99999">
  <input name="tipref" value="88888">
  <input name="JOKERCOUNT" value="1">
  <input name="CURRENTJOKERCOUNT" value="0">
  var marginincluded = "YES"
  <input name="3" type="hidden" id="3" value="H">
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

  it('throws when postMemberId or tipRef cannot be parsed', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => '<html>no form fields here</html>',
    });
    await expect(fetchTippingPage(MOCK_SESSION, 1)).rejects.toThrow('Could not parse tipping form fields');
  });

  it('parses postMemberId and tipRef correctly', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => MOCK_TIPPING_HTML,
    });
    const result = await fetchTippingPage(MOCK_SESSION, 1);
    expect(result.postMemberId).toBe('99999');
    expect(result.tipRef).toBe('88888');
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
    tipRef: '88888',
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
    vi.stubGlobal('fetch', vi.fn());
    vi.clearAllMocks();
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
});
