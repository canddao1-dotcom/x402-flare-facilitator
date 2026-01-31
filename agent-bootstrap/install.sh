#!/bin/bash
# Agent Bootstrap - One-line installer
# Works on Mac, Linux (Ubuntu), and Windows (Git Bash/WSL)

set -e

REPO="https://github.com/canddao1-dotcom/x402-flare-facilitator"
DIR="agent-bootstrap"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          🤖 OpenClaw Agent Bootstrap Installer               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first:"
    echo "   https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required. Found: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check for git
if ! command -v git &> /dev/null; then
    echo "❌ Git not found. Please install git first."
    exit 1
fi

# Clone or update
if [ -d "$DIR" ]; then
    echo "📦 Updating existing installation..."
    cd "$DIR"
    git pull --quiet
else
    echo "📦 Downloading agent-bootstrap..."
    git clone --quiet --depth 1 "$REPO" "$DIR"
    cd "$DIR"
fi

# Navigate to agent-bootstrap subfolder
cd agent-bootstrap

# Install dependencies
echo "📦 Installing dependencies..."
npm install --quiet 2>/dev/null

echo ""
echo "✅ Installation complete!"
echo ""

# Get agent name - support both argument and interactive
AGENT_NAME="$1"

if [ -z "$AGENT_NAME" ]; then
    # Try interactive (won't work in pipe, so use /dev/tty)
    if [ -t 0 ]; then
        read -p "🤖 Enter your agent name: " AGENT_NAME
    else
        read -p "🤖 Enter your agent name: " AGENT_NAME < /dev/tty
    fi
fi

if [ -z "$AGENT_NAME" ]; then
    echo ""
    echo "✅ Bootstrap installed! Now run:"
    echo ""
    echo "  cd agent-bootstrap/agent-bootstrap"
    echo "  node scripts/wizard.js     # Full setup wizard"
    echo "  # or"
    echo "  node scripts/bootstrap.js new --name MyAgent"
    echo ""
    exit 0
fi

# Check for --wizard flag
if [ "$2" = "--wizard" ] || [ "$1" = "--wizard" ]; then
    # Wizard needs interactive input - can't run in pipe
    if [ ! -t 0 ]; then
        echo ""
        echo "⚠️  Wizard requires interactive terminal."
        echo ""
        echo "Copy and paste:"
        echo ""
        echo "  cd agent-bootstrap/agent-bootstrap && node scripts/wizard.js"
        echo ""
        exit 0
    fi
    echo ""
    echo "🧙 Starting Setup Wizard..."
    echo ""
    node scripts/wizard.js
else
    # Run basic bootstrap
    node scripts/bootstrap.js new --name "$AGENT_NAME"
    
    echo ""
    echo "💡 Want full setup with API keys & tipping?"
    echo "   Run: node scripts/wizard.js"
fi
