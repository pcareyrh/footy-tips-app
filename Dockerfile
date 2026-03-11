FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm install

# Copy source
COPY . .

# Build frontend
RUN npm run build -w frontend

# Build backend
RUN npm run build -w backend

# Generate prisma client
RUN cd backend && npx prisma generate

# Production stage
FROM node:20-alpine
WORKDIR /app

COPY --from=base /app/backend/dist ./backend/dist
COPY --from=base /app/backend/package.json ./backend/
COPY --from=base /app/backend/prisma ./backend/prisma
COPY --from=base /app/backend/node_modules ./backend/node_modules
COPY --from=base /app/frontend/dist ./frontend/dist
COPY --from=base /app/package.json ./

# Run migrations and start
EXPOSE 3001
ENV NODE_ENV=production
CMD cd backend && npx prisma migrate deploy && node dist/server.js
