export interface DataSourcePlugin {
  metadata: PluginMetadata & { type: 'data-source'; schedule?: string };
  initialize?(): Promise<void>;
  fetch(): Promise<DataSourceResult>;
  cleanup?(): Promise<void>;
}

export interface AnalysisPlugin {
  metadata: PluginMetadata & { type: 'analysis' };
  predict(matchData: MatchData): Promise<Prediction>;
}

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  type: 'data-source' | 'analysis' | 'ui';
}

export interface DataSourceResult {
  source: string;
  recordsAffected: number;
  data: unknown;
}

export interface MatchData {
  fixture: {
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    venue?: string;
    kickoff?: string;
  };
  homeTeam: { stats: unknown; injuries: unknown; ladder: unknown };
  awayTeam: { stats: unknown; injuries: unknown; ladder: unknown };
  h2h?: unknown;
}

export interface Prediction {
  predictedWinner: string;
  confidence: number;
  factors: Record<string, {
    weight: number;
    favoredTeam: string;
    reasoning: string;
  }>;
}

export type Plugin = DataSourcePlugin | AnalysisPlugin;
