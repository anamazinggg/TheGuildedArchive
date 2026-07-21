#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "=== The Guilded Archive — Build & Publish ==="
echo "→ Installing dependencies..."
npm install

echo "→ Generating the Prisma client and updating the prototype database..."
npm run prisma:generate
npm run prisma:push

echo "→ Building backend and frontend..."
npm run build

echo "→ Starting the production server on port ${PORT:-3000}..."
mkdir -p .run
NODE_ENV=production PORT="${PORT:-3000}" nohup npm run start > .run/server.log 2>&1 &
SERVER_PID=$!

sleep 2
if curl -fsS "http://localhost:${PORT:-3000}/api/health" >/dev/null; then
  echo "✓ Server is running (PID: $SERVER_PID)"
else
  echo "Server did not pass its health check. Review .run/server.log."
  exit 1
fi
