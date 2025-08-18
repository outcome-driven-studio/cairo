#!/bin/bash

# Cairo Environment Setup Script
# This script helps you configure your .env file interactively

echo "🚀 Cairo Environment Setup"
echo "=========================="
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    echo "Please install Node.js (>= 18.0.0) and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if ! node -e "process.exit(process.version.slice(1).split('.').map(Number).reduce((r,v,i)=>(r<<8)+v)>=([18,0,0].reduce((r,v)=>(r<<8)+v)))" 2>/dev/null; then
    echo "❌ Node.js version $NODE_VERSION is not supported."
    echo "Please upgrade to Node.js >= $REQUIRED_VERSION"
    exit 1
fi

# Run the setup script
node setup-env.js

echo ""
echo "✨ Environment setup complete!"
echo ""
echo "📝 Quick Commands:"
echo "  npm run setup-env  # Run this setup script"
echo "  npm run setup      # Initialize database"
echo "  npm start          # Start Cairo server"
echo ""