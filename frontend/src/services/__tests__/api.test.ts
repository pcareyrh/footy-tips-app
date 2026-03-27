import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../api';

describe('api service', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockOkResponse(data: unknown) {
    return Promise.resolve({
      ok: true,
      json: async () => data,
    } as Response);
  }

  function mockErrorResponse(status: number, message: string) {
    return Promise.resolve({
      ok: false,
      status,
      statusText: `Error ${status}`,
      json: async () => ({ message }),
    } as Response);
  }

  it('getTeams calls GET /api/teams', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse([]));
    await api.getTeams();
    expect(fetch).toHaveBeenCalledWith('/api/teams', expect.objectContaining({ headers: expect.any(Object) }));
  });

  it('getPredictions calls GET /api/predictions', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse({ predictions: [] }));
    await api.getPredictions();
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/predictions');
  });

  it('getPredictions appends season and round query params', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse({ predictions: [] }));
    await api.getPredictions({ season: '2026', round: 3 });
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('season=2026');
    expect(url).toContain('round=3');
  });

  it('submitITipFootyTips sends POST /api/itipfooty/submit with round in body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse({ success: true }));
    await api.submitITipFootyTips({ round: 5 });
    const [url, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/itipfooty/submit');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ round: 5 });
  });

  it('submitITipFootyTips sends empty body when round is undefined', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse({ success: true }));
    await api.submitITipFootyTips();
    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(opts.body as string)).toEqual({});
  });

  it('createPick sends POST /api/picks with JSON body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockOkResponse({ id: 'p1' }));
    await api.createPick({ fixtureId: 'f1', pickedTeamId: 'MEL' });
    const [url, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/picks');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ fixtureId: 'f1', pickedTeamId: 'MEL' });
  });

  it('throws error with message from response JSON on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockErrorResponse(400, 'Bad Request message'));
    await expect(api.getTeams()).rejects.toThrow('Bad Request message');
  });

  it('throws error with statusText when response JSON parse fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => { throw new Error('not json'); },
    } as unknown as Response);
    await expect(api.getTeams()).rejects.toThrow('Internal Server Error');
  });
});
