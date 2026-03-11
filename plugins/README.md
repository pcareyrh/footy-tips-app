# Plugin Development Guide

## Overview

The Footy Tips App supports three types of plugins:

1. **Data Source Plugins** — Fetch data from external sources (scrapers, APIs)
2. **Analysis Plugins** — Process data and generate predictions
3. **UI Plugins** — Add custom dashboard widgets (future)

## Creating a Data Source Plugin

Create a directory under `plugins/` with an `index.ts` file:

```
plugins/
  my-scraper/
    index.ts
    package.json
```

### Plugin Interface

```typescript
export interface DataSourcePlugin {
  metadata: {
    id: string;
    name: string;
    version: string;
    description: string;
    type: 'data-source';
    schedule?: string; // cron expression, e.g. "0 8 * * 1" (Monday 8am)
  };

  initialize?(): Promise<void>;
  fetch(): Promise<DataSourceResult>;
  cleanup?(): Promise<void>;
}

export interface DataSourceResult {
  source: string;
  recordsAffected: number;
  data: any;
}
```

### Example: NRL.com Fixture Scraper

```typescript
import type { DataSourcePlugin, DataSourceResult } from '../../backend/src/plugins/types';

const plugin: DataSourcePlugin = {
  metadata: {
    id: 'nrl-fixtures-scraper',
    name: 'NRL.com Fixtures',
    version: '1.0.0',
    description: 'Scrapes fixture data from nrl.com.au',
    type: 'data-source',
    schedule: '0 8 * * 1',
  },

  async fetch(): Promise<DataSourceResult> {
    const response = await fetch('https://www.nrl.com/draw/');
    // Parse and return structured data
    return {
      source: 'nrl.com.au',
      recordsAffected: 8,
      data: { fixtures: [] },
    };
  },
};

export default plugin;
```

## Creating an Analysis Plugin

```typescript
export interface AnalysisPlugin {
  metadata: {
    id: string;
    name: string;
    version: string;
    description: string;
    type: 'analysis';
  };

  predict(matchData: MatchData): Promise<Prediction>;
}
```

## Registering a Plugin

Plugins are registered via the API or the Settings page in the UI.

```bash
curl -X POST http://localhost:3001/api/plugins \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-plugin",
    "name": "My Plugin",
    "type": "data-source",
    "enabled": true,
    "schedule": "0 8 * * 1"
  }'
```
