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

# Prompt for agent name
read -p "🤖 Enter your agent name: " AGENT_NAME

if [ -z "$AGENT_NAME" ]; then
    echo "❌ Agent name required"
    exit 1
fi

# Run bootstrap
node scripts/bootstrap.js new --name "$AGENT_NAME"
