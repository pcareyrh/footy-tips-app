import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { teamRoutes } from './routes/teams.js';
import { fixtureRoutes } from './routes/fixtures.js';
import { pickRoutes } from './routes/picks.js';
import { ladderRoutes } from './routes/ladder.js';
import { analyticsRoutes } from './routes/analytics.js';
import { pluginRoutes } from './routes/plugins.js';
import { injuryRoutes } from './routes/injuries.js';
import { scrapeRoutes } from './routes/scrape.js';
import { predictionsRoutes } from './routes/predictions.js';
import { itipfootyRoutes } from './routes/itipfooty.js';
import { tipsRoutes } from './routes/tips.js';
import { settingsRoutes } from './routes/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/teams', teamRoutes);
app.use('/api/fixtures', fixtureRoutes);
app.use('/api/picks', pickRoutes);
app.use('/api/ladder', ladderRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/plugins', pluginRoutes);
app.use('/api/injuries', injuryRoutes);
app.use('/api/scrape', scrapeRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/itipfooty', itipfootyRoutes);
app.use('/api/tips', tipsRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static files in production
const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) next();
  });
});
