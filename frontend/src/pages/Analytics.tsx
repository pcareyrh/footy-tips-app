import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Target, TrendingUp, Flame, Award, CheckCircle, XCircle, Clock } from 'lucide-react';
import { api } from '../services/api';
import Card from '../components/Card';

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<any>;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
          <Icon size={20} className="text-emerald-500" />
        </div>
        <div>
          <p className="text-sm text-zinc-400">{label}</p>
          <p className="text-xl font-bold">{value}</p>
          {sub && <p className="text-xs text-zinc-500">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

const tooltipStyle = {
  contentStyle: {
    backgroundColor: '#18181b',
    border: '1px solid #3f3f46',
    borderRadius: '8px',
  },
  labelStyle: { color: '#fff' },
};

export default function Analytics() {
  const { data: summary } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => api.getAnalyticsSummary(),
  });

  const { data: byFactor = [] } = useQuery({
    queryKey: ['analytics', 'byFactor'],
    queryFn: () => api.getAnalyticsByFactor(),
  });

  const { data: byTeam = [] } = useQuery({
    queryKey: ['analytics', 'byTeam'],
    queryFn: () => api.getAnalyticsByTeam(),
  });

  const { data: byRound = [] } = useQuery({
    queryKey: ['analytics', 'byRound'],
    queryFn: () => api.getAnalyticsByRound(),
  });

  const hasAnyData = summary?.totalPicks > 0;
  const accuracy = summary?.accuracy != null ? `${summary.accuracy.toFixed(1)}%` : '—';
  const totalPicks = summary?.totalPicks ?? 0;
  const streak = summary?.streak ?? '—';
  const bestFactor = summary?.bestFactor ?? '—';

  if (!hasAnyData) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <Card>
          <div className="py-16 text-center">
            <p className="text-zinc-400">No tip data yet.</p>
            <p className="mt-1 text-sm text-zinc-500">
              Submit tips via the Tips page and analytics will appear here once games complete.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Target}
          label="Accuracy"
          value={accuracy}
          sub={`${summary?.correctPicks ?? 0}W / ${summary?.incorrectPicks ?? 0}L`}
        />
        <StatCard
          icon={TrendingUp}
          label="Total Picks"
          value={totalPicks}
          sub={summary?.pendingPicks ? `${summary.pendingPicks} pending` : undefined}
        />
        <StatCard icon={Flame} label="Current Streak" value={streak} />
        <StatCard icon={Award} label="Best Confidence" value={bestFactor} />
      </div>

      {/* Round-by-round performance */}
      {byRound.length > 0 && (
        <Card title="Round-by-Round Performance" subtitle="Correct picks per round">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byRound} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                <XAxis
                  dataKey="round"
                  tickFormatter={(v) => `R${v}`}
                  tick={{ fill: '#a1a1aa', fontSize: 12 }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#a1a1aa', fontSize: 12 }}
                  domain={[0, (dataMax: number) => Math.max(dataMax, 4)]}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value, name) =>
                    name === 'correct'
                      ? [`${value}`, 'Correct']
                      : [`${value}`, 'Incorrect']
                  }
                  labelFormatter={(label) => `Round ${label}`}
                />
                <Bar dataKey="correct" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} name="correct" />
                <Bar dataKey="incorrect" stackId="a" fill="#3f3f46" radius={[4, 4, 0, 0]} name="incorrect" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Round breakdown table */}
          <div className="mt-4 space-y-1">
            {byRound.map((r: any) => (
              <div key={r.roundId} className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Round {r.round}</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle size={12} /> {r.correct}
                  </span>
                  <span className="flex items-center gap-1 text-zinc-500">
                    <XCircle size={12} /> {r.total - r.correct}
                  </span>
                  <span className="w-14 text-right font-medium">
                    {r.accuracy.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* By confidence */}
        <Card title="Accuracy by Confidence" subtitle="How confidence correlates with results">
          {byFactor.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">No settled picks yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byFactor}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: '#a1a1aa', fontSize: 12 }}
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value: any) => [`${Number(value).toFixed(1)}%`, 'Accuracy']}
                  />
                  <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                    {byFactor.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* By team */}
        <Card title="Accuracy by Team" subtitle="Win rate when picking each team">
          {byTeam.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">No settled picks yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byTeam} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis
                    type="number"
                    tick={{ fill: '#a1a1aa', fontSize: 12 }}
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    domain={[0, 100]}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fill: '#a1a1aa', fontSize: 12 }}
                    width={40}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value: any, _name: any, props: any) =>
                      [`${Number(value).toFixed(1)}% (${props.payload.correct}/${props.payload.total})`, 'Accuracy']
                    }
                  />
                  <Bar dataKey="accuracy" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Pending picks notice */}
      {summary?.pendingPicks > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-400">
          <Clock size={14} className="shrink-0" />
          <span>
            {summary.pendingPicks} pick{summary.pendingPicks !== 1 ? 's' : ''} are pending — results will update after games complete and the scraper runs.
          </span>
        </div>
      )}
    </div>
  );
}
