#!/bin/bash
# Start x402 Flare Facilitator

cd "$(dirname "$0")"

# Check for facilitator key
if [ -z "$FACILITATOR_PRIVATE_KEY" ] && [ ! -f "facilitator-key.json" ]; then
    echo "❌ No facilitator wallet configured"
    echo ""
    echo "Options:"
    echo "  1. Set FACILITATOR_PRIVATE_KEY environment variable"
    echo "  2. Create facilitator-key.json with { \"privateKey\": \"0x...\" }"
    echo ""
    echo "The facilitator wallet pays gas for settlements."
    echo "Fund it with FLR for gas costs."
    exit 1
fi

echo "🚀 Starting x402 Flare Facilitator..."
exec node server.js
