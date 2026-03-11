# Footy Tips App

NRL tipping competition assistant — helps you analyze matchups and make informed picks each week.

## Features

- **Dashboard**: Weekly round summary, upcoming matches, quick stats
- **Match Decision View**: Side-by-side team comparison with checklist scoring
- **AI Recommendations**: Confidence-scored predictions based on multiple factors
- **Performance Analytics**: Track which factors predict best, detect biases
- **Plugin System**: Extensible data sources and analysis methods

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Tailwind CSS + Shadcn/ui |
| Backend | Node.js + Express + TypeScript |
| Database | SQLite via Prisma ORM |
| Charts | Recharts |
| Deployment | Docker (local/NAS) |

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Development

```bash
# Install all dependencies
npm install

# Set up database
cd backend && npx prisma migrate dev && npx prisma db seed && cd ..

# Start both frontend and backend in dev mode
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Docker

```bash
docker compose up --build
```

Access at http://localhost:3001

## Project Structure

```
footy-tips-app/
├── frontend/          # React SPA
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       └── services/
├── backend/           # Express API
│   └── src/
│       ├── routes/
│       ├── services/
│       ├── plugins/
│       └── server.ts
├── plugins/           # Plugin directory
├── spec.md            # Decision factors specification
├── design.md          # Data retrieval plan
└── docker-compose.yml
```

## Documentation

- [spec.md](./spec.md) — Decision factors to consider when picking teams
- [design.md](./design.md) — Data sources and retrieval architecture

## License

MIT
