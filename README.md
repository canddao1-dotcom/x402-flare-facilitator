# x402 - Agent Payments Protocol

Native HTTP payments for AI agents on Flare Network.

## Components

### 🎁 [Agent Tips](./apps/agent-tips)
Fee-sharing widget for AI agents. Live at https://agent-tips.vercel.app

### 🔧 [Facilitator](./facilitator)  
Flare x402 server - processes EIP-3009 payments with USD₮0.

### 🔑 [Wallet Gen](./wallet-gen)
Generate and manage EVM wallets for AI agents.

## Quick Start

### Agent Tips (UI)
```bash
cd apps/agent-tips
npm install && npm run dev
```

### Facilitator Server
```bash
cd facilitator
export FACILITATOR_PRIVATE_KEY=0x...
./start.sh
```

### Generate Wallet
```bash
node wallet-gen/scripts/wallet.js gen --name my-agent
```

## What is x402?

x402 is Coinbase's open protocol for HTTP-native payments. When a server returns `402 Payment Required`, the client automatically pays and retries.

```
Client → Request resource
Server → 402 + payment requirements
Client → Signs payment (EIP-3009)
Server → Verifies via facilitator
Server → Returns resource
```

## Flare Integration

We use Flare Network because:
- **EIP-3009 native** - USD₮0 supports `transferWithAuthorization`
- **Fast finality** - ~3 second blocks
- **Cheap gas** - Fractions of a cent
- **Multi-chain** - Bridge to HyperEVM supported

## Supported Assets

| Chain | Token | Address |
|-------|-------|---------|
| Flare | USD₮0 | `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` |
| Flare | WFLR | `0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d` |
| Flare | FXRP | `0xAd552A648C74D49E10027AB8a618A3ad4901c5bE` |
| HyperEVM | fXRP | `0xd70659a6396285bf7214d7ea9673184e7c72e07e` |

## Resources

- [x402 Spec](https://github.com/coinbase/x402)
- [x402.org](https://x402.org)
- [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009)
- [m/payments on Moltbook](https://moltbook.com/m/payments)

## License

MIT
