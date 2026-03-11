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
import { Target, TrendingUp, Flame, Award } from 'lucide-react';
import { api } from '../services/api';
import Card from '../components/Card';

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<any>;
  label: string;
  value: string | number;
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
        </div>
      </div>
    </Card>
  );
}

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

  const accuracy = summary?.accuracy != null ? `${(summary.accuracy * 100).toFixed(1)}%` : '—';
  const totalPicks = summary?.totalPicks ?? '—';
  const streak = summary?.currentStreak ?? '—';
  const bestFactor = summary?.bestFactor ?? '—';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Target} label="Accuracy" value={accuracy} />
        <StatCard icon={TrendingUp} label="Total Picks" value={totalPicks} />
        <StatCard icon={Flame} label="Current Streak" value={streak} />
        <StatCard icon={Award} label="Best Factor" value={bestFactor} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* By confidence */}
        <Card title="Accuracy by Confidence" subtitle="How confidence correlates with results">
          {byFactor.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">No data yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byFactor}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: '#a1a1aa', fontSize: 12 }}
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#fff' }}
                    formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`}
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
            <p className="py-12 text-center text-sm text-zinc-500">No data yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byTeam} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis
                    type="number"
                    tick={{ fill: '#a1a1aa', fontSize: 12 }}
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fill: '#a1a1aa', fontSize: 12 }}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#fff' }}
                    formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`}
                  />
                  <Bar dataKey="accuracy" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
