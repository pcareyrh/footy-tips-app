#!/bin/sh
set -e

# Resolve the SQLite file path from DATABASE_URL (strip the file: prefix)
DB_FILE="${DATABASE_URL#file:}"
# If it's a relative path, resolve it from the backend directory
case "$DB_FILE" in
  /*) ;;
  *)  DB_FILE="/app/backend/$DB_FILE" ;;
esac

# Detect first boot (DB file doesn't exist yet)
FIRST_BOOT=false
if [ ! -f "$DB_FILE" ]; then
  FIRST_BOOT=true
  echo "[entrypoint] Fresh database — will seed after schema push"
fi

# Always apply the schema (idempotent, safe on existing databases)
echo "[entrypoint] Applying database schema..."
cd /app/backend
npx prisma db push --skip-generate

# Seed only on first boot — fixture.create would fail with a unique
# constraint error if seeding is attempted on an existing database
if [ "$FIRST_BOOT" = "true" ]; then
  echo "[entrypoint] Seeding database..."
  npx prisma db seed
fi

echo "[entrypoint] Starting server..."
exec node dist/server.js
