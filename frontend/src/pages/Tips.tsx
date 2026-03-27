import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  Send,
  Clock,
  Calendar,
  RotateCcw,
} from 'lucide-react';
import { api } from '../services/api';
import Card from '../components/Card';
import { cn } from '../lib/utils';

const confidenceColors: Record<string, string> = {
  'VERY HIGH': 'text-emerald-400',
  HIGH: 'text-blue-400',
  MEDIUM: 'text-yellow-400',
  LOW: 'text-red-400',
};

function formatDatetime(dt: string | null): string {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function timeFromNow(dt: string | null): string {
  if (!dt) return '';
  const diff = new Date(dt).getTime() - Date.now();
  if (diff < 0) return 'passed';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

export default function Tips() {
  const queryClient = useQueryClient();

  const { data: itipStatus } = useQuery({
    queryKey: ['itipfootyStatus'],
    queryFn: () => api.getITipFootyStatus(),
  });

  const { data: roundData, isLoading: roundLoading } = useQuery({
    queryKey: ['tipsCurrentRound'],
    queryFn: () => api.getTipsCurrentRound(),
    staleTime: 60_000,
  });

  const { data: schedule = [] } = useQuery({
    queryKey: ['tipsSchedule'],
    queryFn: () => api.getTipsSchedule(),
    staleTime: 60_000,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['tipsHistory'],
    queryFn: () => api.getTipsHistory(15),
    staleTime: 30_000,
  });

  const setOverride = useMutation({
    mutationFn: ({ fixtureId, winnerId }: { fixtureId: string; winnerId: string }) =>
      api.setTipOverride(fixtureId, winnerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tipsCurrentRound'] }),
  });

  const clearOverride = useMutation({
    mutationFn: (fixtureId: string) => api.deleteTipOverride(fixtureId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tipsCurrentRound'] }),
  });

  const submitNow = useMutation({
    mutationFn: () => api.submitTipsNow(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tipsHistory'] });
    },
  });

  const predictions: any[] = roundData?.predictions ?? [];
  const nextRound = schedule[0] ?? null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tips</h1>

      {/* Connection status */}
      <Card title="iTipFooty" subtitle="Automated tip submission">
        {itipStatus?.configured ? (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle size={14} className="text-emerald-500" />
            <span className="text-zinc-300">
              Connected as{' '}
              <span className="font-medium text-white">{itipStatus.username}</span>
              {' · '}Comp #{itipStatus.compId}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <AlertCircle size={14} className="text-red-400" />
              Not configured
            </div>
            <p className="text-xs text-zinc-500">
              Set{' '}
              <code className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-300">ITIPFOOTY_USERNAME</code>
              ,{' '}
              <code className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-300">ITIPFOOTY_PASSWORD</code>{' '}
              and{' '}
              <code className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-300">ITIPFOOTY_COMP_ID</code>{' '}
              in <code className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-300">backend/.env</code>
            </p>
          </div>
        )}
      </Card>

      {/* Auto-submit schedule */}
      {nextRound && (
        <Card title="Auto-Submit Schedule" subtitle="Scheduler runs every minute checking for upcoming games">
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <Calendar size={16} className="mt-0.5 text-emerald-400 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-white">
                  Round {nextRound.roundNumber} — all tips submit{' '}
                  <span className="text-emerald-400">{timeFromNow(nextRound.roundSubmitAt)}</span>
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {formatDatetime(nextRound.roundSubmitAt)} · 1 hour before first game (
                  {formatDatetime(nextRound.firstGameKickoff)})
                </p>
              </div>
            </div>

            {nextRound.games.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  Pre-game rescrapes
                </p>
                {nextRound.games.slice(1).map((g: any) => (
                  <div key={g.fixtureId} className="flex items-center gap-2 text-xs text-zinc-400">
                    <RotateCcw size={11} className="shrink-0 text-zinc-600" />
                    <span>
                      {formatDatetime(g.preGameScrapeAt)}
                      <span className="ml-2 text-zinc-600">
                        ({timeFromNow(g.preGameScrapeAt)})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Current round picks */}
      <Card
        title={roundData ? `Round ${roundData.round} Picks` : 'Current Round Picks'}
        subtitle="Click a team to override the AI prediction. Overrides are saved automatically."
      >
        {roundLoading && (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        )}

        {!roundLoading && predictions.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-500">
            No upcoming fixtures. Run the scraper to populate this round.
          </p>
        )}

        {predictions.length > 0 && (
          <div className="space-y-3">
            {predictions.map((p: any) => {
              const hasOverride = p.override !== null;
              const effectiveId = p.effectivePickId;

              return (
                <div
                  key={p.fixtureId}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 p-3 space-y-2"
                >
                  {/* Kickoff + override indicator */}
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatDatetime(p.kickoff)}
                    </span>
                    {hasOverride && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                        Override set
                      </span>
                    )}
                  </div>

                  {/* Pick toggles */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (effectiveId === p.homeTeam.id && hasOverride) {
                          clearOverride.mutate(p.fixtureId);
                        } else {
                          setOverride.mutate({ fixtureId: p.fixtureId, winnerId: p.homeTeam.id });
                        }
                      }}
                      className={cn(
                        'flex-1 rounded-md px-3 py-2 text-sm font-medium text-left transition-colors',
                        effectiveId === p.homeTeam.id
                          ? 'bg-emerald-600/30 text-emerald-300 ring-1 ring-emerald-500/50'
                          : 'text-zinc-400 hover:bg-zinc-700'
                      )}
                    >
                      {p.homeTeam.name}
                      {p.predictedWinnerId === p.homeTeam.id && (
                        <span className="ml-1.5 text-[10px] text-zinc-500">AI pick</span>
                      )}
                    </button>

                    <div className="shrink-0 text-center">
                      <span className="text-[10px] text-zinc-600">vs</span>
                      <p className={cn('text-xs font-medium', confidenceColors[p.confidence] ?? 'text-zinc-500')}>
                        {p.confidenceScore}%
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        if (effectiveId === p.awayTeam.id && hasOverride) {
                          clearOverride.mutate(p.fixtureId);
                        } else {
                          setOverride.mutate({ fixtureId: p.fixtureId, winnerId: p.awayTeam.id });
                        }
                      }}
                      className={cn(
                        'flex-1 rounded-md px-3 py-2 text-sm font-medium text-right transition-colors',
                        effectiveId === p.awayTeam.id
                          ? 'bg-emerald-600/30 text-emerald-300 ring-1 ring-emerald-500/50'
                          : 'text-zinc-400 hover:bg-zinc-700'
                      )}
                    >
                      {p.awayTeam.name}
                      {p.predictedWinnerId === p.awayTeam.id && (
                        <span className="mr-1.5 text-[10px] text-zinc-500">AI pick</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Manual submit */}
            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={() => submitNow.mutate()}
                disabled={submitNow.isPending || !itipStatus?.configured}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all',
                  submitNow.isPending || !itipStatus?.configured
                    ? 'cursor-not-allowed bg-zinc-700'
                    : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700'
                )}
              >
                {submitNow.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
                {submitNow.isPending ? 'Submitting…' : 'Submit Now'}
              </button>
              <p className="text-xs text-zinc-500">
                Submits picks above to iTipFooty immediately
              </p>
            </div>

            {/* Submit result */}
            {submitNow.isSuccess && (
              <div
                className={cn(
                  'rounded-lg border p-3 text-sm',
                  submitNow.data?.success
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/30 bg-red-500/10 text-red-300'
                )}
              >
                <p className="font-medium">
                  {submitNow.data?.success ? '✓' : '✗'} {submitNow.data?.message}
                </p>
                {submitNow.data?.tips?.length > 0 && (
                  <div className="mt-2 space-y-0.5 text-xs opacity-80">
                    {submitNow.data.tips.map((tip: any, i: number) => (
                      <p key={i}>
                        {tip.homeTeam} vs {tip.awayTeam} →{' '}
                        <span className="font-bold text-white">{tip.pickedTeam}</span>{' '}
                        ({tip.confidence})
                      </p>
                    ))}
                  </div>
                )}
                {submitNow.data?.errors?.length > 0 && (
                  <div className="mt-2 text-xs opacity-70">
                    {submitNow.data.errors.map((err: string, i: number) => (
                      <p key={i} className="text-yellow-300">⚠ {err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {submitNow.isError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                <p className="font-medium">✗ Submission failed</p>
                <p className="mt-1 text-xs opacity-80">
                  {(submitNow.error as Error).message}
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Submission history */}
      {history.length > 0 && (
        <Card title="Submission History" subtitle="Recent manual and auto-submissions">
          <div className="space-y-2">
            {history.map((log: any) => {
              const isAuto = log.source === 'itipfooty-auto';
              return (
                <div
                  key={log.id}
                  className="flex items-start justify-between rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 gap-3"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {log.status === 'success' ? (
                      <CheckCircle size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                    ) : log.status === 'partial' ? (
                      <AlertCircle size={13} className="mt-0.5 shrink-0 text-yellow-400" />
                    ) : (
                      <AlertCircle size={13} className="mt-0.5 shrink-0 text-red-400" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-zinc-200 truncate">
                          {log.message}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'text-[10px] rounded-full px-1.5 py-0.5',
                          isAuto
                            ? 'bg-blue-500/15 text-blue-400'
                            : 'bg-zinc-700 text-zinc-400'
                        )}
                      >
                        {isAuto ? 'auto' : 'manual'}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {new Date(log.createdAt).toLocaleString('en-AU', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
