import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plug, RefreshCw, Info } from 'lucide-react';
import { api } from '../services/api';
import Card from '../components/Card';
import Badge from '../components/Badge';
import { cn } from '../lib/utils';

export default function Settings() {
  const queryClient = useQueryClient();

  const { data: plugins = [], isLoading } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => api.getPlugins(),
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
  });

  const togglePlugin = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.updatePlugin(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plugins'] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Plugins */}
      <Card title="Plugins" subtitle="Manage data source plugins">
        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
          </div>
        )}
        {!isLoading && plugins.length === 0 && (
          <p className="py-8 text-center text-sm text-zinc-500">No plugins configured.</p>
        )}
        <div className="space-y-3">
          {plugins.map((plugin: any) => (
            <div
              key={plugin.id}
              className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-700">
                  <Plug size={16} className="text-zinc-400" />
                </div>
                <div>
                  <p className="font-medium">{plugin.name}</p>
                  <p className="text-xs text-zinc-500">{plugin.description || plugin.type}</p>
                </div>
              </div>
              <button
                onClick={() =>
                  togglePlugin.mutate({ id: plugin.id, enabled: !plugin.enabled })
                }
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                  plugin.enabled ? 'bg-emerald-500' : 'bg-zinc-600'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform',
                    plugin.enabled ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* Data source status */}
      <Card title="Data Sources" subtitle="Connection status and last sync times">
        {health ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 p-4">
              <div className="flex items-center gap-3">
                <RefreshCw size={16} className="text-emerald-500" />
                <div>
                  <p className="text-sm font-medium">API Server</p>
                  <p className="text-xs text-zinc-500">
                    {health.uptime ? `Uptime: ${Math.round(health.uptime / 60)}m` : 'Connected'}
                  </p>
                </div>
              </div>
              <Badge variant="success">Online</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 p-4">
              <div className="flex items-center gap-3">
                <RefreshCw size={16} className="text-emerald-500" />
                <div>
                  <p className="text-sm font-medium">Database</p>
                  <p className="text-xs text-zinc-500">
                    {health.database || 'SQLite'}
                  </p>
                </div>
              </div>
              <Badge variant={health.status === 'ok' ? 'success' : 'danger'}>
                {health.status === 'ok' ? 'Connected' : 'Error'}
              </Badge>
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-zinc-500">
            Unable to fetch health status.
          </p>
        )}
      </Card>

      {/* About */}
      <Card title="About">
        <div className="flex items-start gap-3">
          <Info size={18} className="mt-0.5 text-zinc-400" />
          <div className="text-sm text-zinc-400">
            <p className="font-medium text-white">Footy Tips App</p>
            <p className="mt-1">
              A personal AFL/NRL tipping assistant that helps you track fixtures, make
              data-driven picks, and analyze your tipping performance.
            </p>
            <p className="mt-2 text-xs text-zinc-500">Version 0.1.0</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
