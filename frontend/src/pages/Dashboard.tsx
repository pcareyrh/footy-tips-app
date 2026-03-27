import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, MapPin, TrendingUp, Target, Flame } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '../services/api';
import Card from '../components/Card';
import TeamLogo from '../components/TeamLogo';

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: fixtures = [] } = useQuery({
    queryKey: ['fixtures', 'current-round'],
    queryFn: () => api.getFixtures({ current: 'true' }),
  });

  const { data: summary } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => api.getAnalyticsSummary(),
  });

  const { data: ladder = [] } = useQuery({
    queryKey: ['ladder'],
    queryFn: () => api.getLadder(),
  });

  const currentRound = fixtures.length > 0 ? fixtures[0].round?.number : '—';
  const upcoming = fixtures.filter((f: any) => f.status !== 'completed');
  const completed = fixtures.filter((f: any) => f.status === 'completed');

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-xl bg-gradient-to-br from-emerald-600/20 via-zinc-900 to-zinc-900 border border-emerald-500/20 p-6 lg:p-8">
        <h1 className="text-2xl font-bold lg:text-3xl">Round {currentRound}</h1>
        <p className="mt-1 text-zinc-400">
          {fixtures.length === 0
            ? 'No data — run the scraper'
            : upcoming.length > 0
            ? `${completed.length} result${completed.length !== 1 ? 's' : ''} · ${upcoming.length} to play`
            : `All ${completed.length} matches complete`}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Match cards */}
        <div className="space-y-4 lg:col-span-2">
          {fixtures.length === 0 && (
            <Card>
              <p className="text-center text-zinc-500 py-8">No fixtures found. Run the scraper to populate data.</p>
            </Card>
          )}

          {upcoming.length > 0 && (
            <>
              <h2 className="text-lg font-semibold">Upcoming</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {upcoming.map((fixture: any) => (
                  <button
                    key={fixture.id}
                    onClick={() => navigate(`/matches/${fixture.id}`)}
                    className="text-left rounded-xl border border-zinc-800 bg-zinc-800/50 p-4 transition-all hover:border-emerald-500/40 hover:bg-zinc-800 hover:shadow-lg hover:shadow-emerald-500/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <TeamLogo shortName={fixture.homeTeam?.shortName || 'HOM'} size="sm" />
                        <span className="truncate font-medium text-sm">
                          {fixture.homeTeam?.name || 'Home'}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-zinc-500">VS</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate font-medium text-sm text-right">
                          {fixture.awayTeam?.name || 'Away'}
                        </span>
                        <TeamLogo shortName={fixture.awayTeam?.shortName || 'AWY'} size="sm" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <MapPin size={12} />
                        {fixture.venue || 'TBA'}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays size={12} />
                        {fixture.kickoff
                          ? format(new Date(fixture.kickoff), 'EEE d MMM, h:mm a')
                          : 'TBA'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {completed.length > 0 && (
            <>
              <h2 className="text-lg font-semibold">Results</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {completed.map((fixture: any) => {
                  const homeWon = fixture.result === 'home';
                  const awayWon = fixture.result === 'away';
                  return (
                    <button
                      key={fixture.id}
                      onClick={() => navigate(`/matches/${fixture.id}`)}
                      className="text-left rounded-xl border border-zinc-700 bg-zinc-800/30 p-4 transition-all hover:border-zinc-600 hover:bg-zinc-800"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <TeamLogo shortName={fixture.homeTeam?.shortName || 'HOM'} size="sm" />
                          <span className={`truncate text-sm font-medium ${homeWon ? 'text-white' : 'text-zinc-400'}`}>
                            {fixture.homeTeam?.name || 'Home'}
                          </span>
                        </div>
                        <div className="shrink-0 text-center">
                          <span className="text-base font-bold tabular-nums">
                            {fixture.homeScore ?? '—'} – {fixture.awayScore ?? '—'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 min-w-0 justify-end">
                          <span className={`truncate text-sm font-medium text-right ${awayWon ? 'text-white' : 'text-zinc-400'}`}>
                            {fixture.awayTeam?.name || 'Away'}
                          </span>
                          <TeamLogo shortName={fixture.awayTeam?.shortName || 'AWY'} size="sm" />
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">
                        {fixture.venue || 'TBA'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quick stats */}
          <Card title="Quick Stats">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-zinc-400">
                  <Target size={16} className="text-emerald-500" /> Accuracy
                </span>
                <span className="font-semibold">
                  {summary?.accuracy != null
                    ? `${summary.accuracy.toFixed(1)}%`
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-zinc-400">
                  <TrendingUp size={16} className="text-emerald-500" /> Total Picks
                </span>
                <span className="font-semibold">{summary?.totalPicks ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-zinc-400">
                  <Flame size={16} className="text-emerald-500" /> Streak
                </span>
                <span className="font-semibold">{summary?.streak ?? '—'}</span>
              </div>
            </div>
          </Card>

          {/* Mini Ladder */}
          <Card title="Latest Ladder" subtitle="Top 8">
            {ladder.length === 0 ? (
              <p className="text-sm text-zinc-500">No ladder data yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500 text-xs">
                    <th className="pb-2 text-left">#</th>
                    <th className="pb-2 text-left">Team</th>
                    <th className="pb-2 text-right">W</th>
                    <th className="pb-2 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {ladder.slice(0, 8).map((row: any, i: number) => (
                    <tr key={row.id || i} className="border-t border-zinc-700/50">
                      <td className="py-1.5 text-zinc-400">{i + 1}</td>
                      <td className="py-1.5 font-medium">{row.team?.shortName || row.teamName || '—'}</td>
                      <td className="py-1.5 text-right text-zinc-400">{row.wins ?? '—'}</td>
                      <td className="py-1.5 text-right font-medium text-emerald-400">
                        {row.competitionPoints ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
