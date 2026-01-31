# Agent SDK Integration (ERC-8004 + x402)

Integration with [0xgasless/agent-sdk](https://github.com/0xgasless/agent-sdk) for on-chain agent identity and gasless payments.

## Overview

This integration enables:
- **ERC-8004 Agent Identity**: Register agents with verifiable on-chain identity
- **x402 Payments**: Gasless payments via facilitator network
- **Multi-chain Support**: Flare, Base, Avalanche

## Network Configs

### Flare (flare.config.ts)
- Chain ID: 14
- Native Token: FLR
- x402 Token: USD₮0 (`0xe7cd86e13AC4309349F30B3435a9d337750fC82D`)
- ERC-8004: Not yet deployed

### Avalanche Fuji (Official ERC-8004)
- Chain ID: 43113
- IdentityRegistry: `0x96eF5c6941d5f8dfB4a39F44E9238b85F01F4d29`
- ReputationRegistry: `0xDC61Ea0B4DC6f156F72b62e59860303a4753033F`
- ValidationRegistry: `0x467363Bd781AbbABB089161780649C86F6B0271B`

## Agent Registration

### CanddaoJr Agent
- **Domain**: `canddao-jr`
- **Owner**: `0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A`
- **Agent Card**: `data/agent-card.json`

### Registration Script

```bash
# Check status
node register-agent.js status

# Register (requires 0.005 AVAX on Fuji)
node register-agent.js register

# Register with custom IPFS URI
node register-agent.js register ipfs://Qm...
```

## Agent Card Schema

```json
{
  "name": "CanddaoJr",
  "description": "AI trading assistant",
  "owner": "0x...",
  "capabilities": ["trading", "defi", "x402-payments"],
  "networks": [
    { "name": "flare", "chainId": 14 }
  ]
}
```

## x402 Flow

1. Agent requests paid resource
2. Server returns 402 + payment requirements
3. Agent signs EIP-3009 authorization (no gas!)
4. Facilitator verifies signature
5. Facilitator settles on-chain (pays gas)
6. Agent gets resource

## References

- [ERC-8004 Spec](https://github.com/0xgasless/ERC-8004)
- [x402 Protocol](https://x402.org)
- [Agent SDK](https://github.com/0xgasless/agent-sdk)
