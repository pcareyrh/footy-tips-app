const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'API request failed');
  }
  return res.json();
}

export const api = {
  // Teams
  getTeams: () => fetchJson<any[]>('/teams'),
  getTeam: (id: string) => fetchJson<any>(`/teams/${id}`),

  // Fixtures
  getFixtures: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson<any[]>(`/fixtures${query}`);
  },
  getFixture: (id: string) => fetchJson<any>(`/fixtures/${id}`),
  updateFixture: (id: string, data: any) =>
    fetchJson<any>(`/fixtures/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Picks
  getPicks: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson<any[]>(`/picks${query}`);
  },
  createPick: (data: any) =>
    fetchJson<any>('/picks', { method: 'POST', body: JSON.stringify(data) }),
  updatePick: (id: string, data: any) =>
    fetchJson<any>(`/picks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePick: (id: string) =>
    fetchJson<void>(`/picks/${id}`, { method: 'DELETE' }),

  // Ladder
  getLadder: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson<any[]>(`/ladder${query}`);
  },

  // Analytics
  getAnalyticsSummary: () => fetchJson<any>('/analytics/summary'),
  getAnalyticsByFactor: () => fetchJson<any[]>('/analytics/by-factor'),
  getAnalyticsByTeam: () => fetchJson<any[]>('/analytics/by-team'),
  getAnalyticsByRound: () => fetchJson<any[]>('/analytics/by-round'),

  // Injuries
  getInjuries: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJson<any[]>(`/injuries${query}`);
  },
  createInjury: (data: any) =>
    fetchJson<any>('/injuries', { method: 'POST', body: JSON.stringify(data) }),
  updateInjury: (id: string, data: any) =>
    fetchJson<any>(`/injuries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInjury: (id: string) =>
    fetchJson<void>(`/injuries/${id}`, { method: 'DELETE' }),

  // Plugins
  getPlugins: () => fetchJson<any[]>('/plugins'),
  updatePlugin: (id: string, data: any) =>
    fetchJson<any>(`/plugins/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Scraping
  triggerScrape: (data?: { targets?: string[]; season?: string; round?: number }) =>
    fetchJson<any>('/scrape', { method: 'POST', body: JSON.stringify(data ?? { targets: ['all'] }) }),
  getScrapeLogs: (limit = 20) => fetchJson<any[]>(`/scrape/logs?limit=${limit}`),
  getScrapeStatus: () => fetchJson<any>('/scrape/status'),

  // Predictions
  getPredictions: (params?: { season?: string; round?: number }) => {
    const query = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
    ).toString() : '';
    return fetchJson<any>(`/predictions${query}`);
  },

  // Health
  getHealth: () => fetchJson<any>('/health'),

  // iTipFooty
  getITipFootyStatus: () => fetchJson<any>('/itipfooty/status'),
  submitITipFootyTips: (data?: { round?: number; picks?: Array<{ homeTeamId: string; awayTeamId: string; winnerId: string }> }) =>
    fetchJson<any>('/itipfooty/submit', {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }),

  // Tips page
  getTipsCurrentRound: () => fetchJson<any>('/tips/current-round'),
  setTipOverride: (fixtureId: string, winnerId: string) =>
    fetchJson<any>(`/tips/overrides/${fixtureId}`, {
      method: 'PUT',
      body: JSON.stringify({ winnerId }),
    }),
  deleteTipOverride: (fixtureId: string) =>
    fetchJson<void>(`/tips/overrides/${fixtureId}`, { method: 'DELETE' }),
  getTipsSchedule: () => fetchJson<any[]>('/tips/schedule'),
  getTipsHistory: (limit = 20) => fetchJson<any[]>(`/tips/history?limit=${limit}`),
  submitTipsNow: (round?: number) =>
    fetchJson<any>('/tips/submit', {
      method: 'POST',
      body: JSON.stringify(round !== undefined ? { round } : {}),
    }),

  // App settings
  getSettings: () => fetchJson<{ settings: Record<string, string>; scrapeScheduleOptions: Array<{ value: string; label: string }> }>('/settings'),
  updateSetting: (key: string, value: string) =>
    fetchJson<any>(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
};
