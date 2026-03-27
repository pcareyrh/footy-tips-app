# ── Stage 1: install all dependencies ─────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci

# ── Stage 2: build ─────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
# Generate Prisma client before compiling TypeScript
RUN cd backend && npx prisma generate
RUN npm run build -w frontend
RUN npm run build -w backend

# ── Stage 3: production image ──────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Package manifests needed by Prisma CLI at runtime
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# node_modules from builder — includes tsx (for seed script) and prisma CLI
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# Compiled backend
COPY --from=builder /app/backend/dist ./backend/dist

# Frontend static files (served via express.static in backend/src/app.ts)
COPY --from=builder /app/frontend/dist ./frontend/dist

# Prisma schema + seed for runtime db push and first-boot seeding
COPY --from=builder /app/backend/prisma ./backend/prisma

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Mount a volume here to persist the SQLite database across restarts
VOLUME /data

ENV DATABASE_URL=file:/data/footy.db
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001
ENTRYPOINT ["/docker-entrypoint.sh"]
