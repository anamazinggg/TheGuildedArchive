#!/bin/bash
set -e

echo "=== The Gilded Archive — Publish ==="

# Step 1: Build the frontend
echo "→ Building frontend..."
cd "$(dirname "$0")/frontend"
bun run build
cd ..

# Step 2: Generate Prisma client
echo "→ Generating Prisma client..."
cd backend
bun run prisma:generate
bun run prisma:push
cd ..

# Step 3: Kill any existing server on port 3000
echo "→ Taking over port 3000..."
sudo sh -c 'lsof -t -iTCP:3000 -sTCP:LISTEN 2>/dev/null | xargs -r kill -9 2>/dev/null' || true
sleep 1

# Step 4: Start the production server on port 3000
echo "→ Starting server on port 3000..."
NODE_ENV=production PORT=3000 nohup bun run --cwd backend start > /home/team/shared/site/.run/server.log 2>&1 &
SERVER_PID=$!

# Wait for the server to start
sleep 2
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "✓ Server is running on port 3000 (PID: $SERVER_PID)"
  echo "  API: http://localhost:3000/api/health"
  echo "  App: http://localhost:3000"
else
  echo "⚠ Server may not have started. Check .run/server.log"
fi

echo "=== Done ==="