#!/bin/bash

# Local development server script for AIRT
# This script handles dependency installation and starts the server

set -e

echo "🎨 AIRT Local Development Server"
echo "================================"

# Check if node_modules exists in server directory
if [ ! -d "server/node_modules" ]; then
  echo "📦 Installing server dependencies..."
  cd server
  npm install
  cd ..
  echo "✓ Dependencies installed"
else
  echo "✓ Dependencies already installed"
fi

echo ""
echo "🚀 Starting server on http://localhost:3000"
echo "   Press Ctrl+C to stop"
echo ""

# Start the server with hot reload
npm run dev
