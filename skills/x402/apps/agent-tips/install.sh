#!/bin/bash
# Agent Tips - One-line installer
# Deploy your own x402 tipping facilitator

set -e

REPO="https://github.com/canddao1-dotcom/x402-flare-facilitator"
DIR="x402-facilitator"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          💸 Agent Tips Facilitator Installer                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install Node.js 18+: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required. Found: $(node -v)"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# Check git
if ! command -v git &> /dev/null; then
    echo "❌ Git not found"
    exit 1
fi

# Clone or update
if [ -d "$DIR" ]; then
    echo "📦 Updating existing installation..."
    cd "$DIR"
    git pull --quiet
else
    echo "📦 Cloning repository..."
    git clone --quiet --depth 1 "$REPO" "$DIR"
    cd "$DIR"
fi

cd apps/agent-tips

echo "📦 Installing dependencies..."
npm install --quiet --no-audit 2>/dev/null

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    ⚙️  Configuration                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check for existing .env
if [ -f ".env.local" ]; then
    echo "Found existing .env.local"
    read -p "Use existing config? [Y/n]: " USE_EXISTING < /dev/tty
    if [[ "$USE_EXISTING" =~ ^[Nn] ]]; then
        rm .env.local
    fi
fi

if [ ! -f ".env.local" ]; then
    echo ""
    echo "Let's configure your facilitator:"
    echo ""
    
    # Facilitator wallet
    read -p "🔑 Facilitator wallet private key (0x...) [Enter to skip]: " PRIV_KEY < /dev/tty
    
    if [ -z "$PRIV_KEY" ]; then
        echo "   ⚠️  No key provided. Add FACILITATOR_PRIVATE_KEY to .env.local before deploying."
    fi
    
    # RPC (optional)
    read -p "🌐 Flare RPC URL [https://flare-api.flare.network/ext/C/rpc]: " RPC_URL < /dev/tty
    RPC_URL=${RPC_URL:-"https://flare-api.flare.network/ext/C/rpc"}
    
    # GitHub token for leaderboard (optional)
    read -p "📊 GitHub token for leaderboard (optional, press Enter to skip): " GH_TOKEN < /dev/tty
    
    # Create .env.local
    cat > .env.local << EOF
# Agent Tips Facilitator Config
FACILITATOR_PRIVATE_KEY=$PRIV_KEY
FLARE_RPC_URL=$RPC_URL
EOF

    if [ -n "$GH_TOKEN" ]; then
        echo "GITHUB_TOKEN=$GH_TOKEN" >> .env.local
    fi
    
    echo ""
    echo "✅ Config saved to .env.local"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    🚀 Ready to Launch                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Start locally:"
echo "  cd $DIR/apps/agent-tips && npm run dev"
echo ""
echo "Deploy to Vercel:"
echo "  cd $DIR/apps/agent-tips && npx vercel"
echo ""
echo "Or deploy to any Node.js host:"
echo "  npm run build && npm start"
echo ""
echo "📚 Docs: https://github.com/canddao1-dotcom/x402-flare-facilitator"
echo ""

# Offer to start
read -p "Start dev server now? [y/N]: " START_NOW < /dev/tty
if [[ "$START_NOW" =~ ^[Yy] ]]; then
    echo ""
    echo "Starting on http://localhost:3000 ..."
    echo "(Press Ctrl+C to stop)"
    echo ""
    npm run dev
fi
