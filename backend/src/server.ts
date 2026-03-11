import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { teamRoutes } from './routes/teams.js';
import { fixtureRoutes } from './routes/fixtures.js';
import { pickRoutes } from './routes/picks.js';
import { ladderRoutes } from './routes/ladder.js';
import { analyticsRoutes } from './routes/analytics.js';
import { pluginRoutes } from './routes/plugins.js';
import { injuryRoutes } from './routes/injuries.js';

export const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static files in production
// Works from both src/ (dev) and dist/ (production)
const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Footy Tips API running on http://localhost:${PORT}`);
});
