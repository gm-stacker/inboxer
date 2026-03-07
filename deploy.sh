#!/bin/bash
set -e

echo "🛑 Stopping existing containers..."
docker compose down

echo "🔨 Rebuilding images..."
docker compose build --no-cache

echo "🚀 Starting stack..."
docker compose up -d

echo ""
echo "✅ KAE is running:"
echo "   Frontend: http://localhost:6120"
echo "   Backend:  http://localhost:6130"
echo "   Logs:     docker compose logs -f"
