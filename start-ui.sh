#!/bin/bash

echo "🚀 Starting Cairo CDP UI..."
echo ""

# Navigate to UI directory
cd "$(dirname "$0")/ui" || exit

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check if port 5173 is already in use
if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 5173 is already in use!"
    echo "   Another instance might be running or use a different port."
    echo ""
    read -p "Do you want to kill the existing process? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kill -9 $(lsof -t -i:5173)
        echo "✅ Killed existing process on port 5173"
    else
        echo "❌ Exiting. Please stop the existing process first."
        exit 1
    fi
fi

echo "🌐 Starting UI development server..."
echo "   Access the UI at: http://localhost:5173"
echo ""
echo "📋 Available Pages:"
echo "   • Dashboard:     http://localhost:5173/"
echo "   • Live Events:   http://localhost:5173/events"
echo "   • Sources:       http://localhost:5173/sources"
echo "   • Destinations:  http://localhost:5173/destinations"
echo ""
echo "Press Ctrl+C to stop the server"
echo "========================================="
echo ""

# Start the development server
npm run dev