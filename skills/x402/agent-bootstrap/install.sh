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

# Always run the wizard (it handles everything)
# Check if we have interactive terminal
if [ -t 0 ]; then
    echo ""
    echo "🧙 Starting Setup Wizard..."
    echo ""
    node scripts/wizard.js
else
    # Piped input - can't run interactive wizard
    echo ""
    echo "✅ Bootstrap installed!"
    echo ""
    echo "Copy and paste to start the wizard:"
    echo ""
    echo "  cd agent-bootstrap/agent-bootstrap && node scripts/wizard.js"
    echo ""
fi
