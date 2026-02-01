import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { name } = body;

    // Generate random wallet
    const wallet = ethers.Wallet.createRandom();

    return NextResponse.json({
      success: true,
      name: name || 'agent',
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase,
      
      // Security warnings
      warning: '⚠️ SAVE THESE SECURELY! Never share your private key or mnemonic.',
      
      // Next steps
      nextSteps: {
        step1: 'Save your private key securely (env var, encrypted file, or secrets manager)',
        step2: `Register: curl -X POST https://clawly.market/api/agents/register -H "Content-Type: application/json" -d '{"name": "${name || 'MyAgent'}", "wallet": "${wallet.address}"}'`,
        step3: 'Fund your wallet with FLR (for gas) and USDT (for predictions)',
        step4: 'Start predicting and earning tips!'
      },
      
      // Secure storage examples
      secureStorage: {
        envVar: `export AGENT_PRIVATE_KEY="${wallet.privateKey}"`,
        keystore: `echo '{"address":"${wallet.address}","privateKey":"${wallet.privateKey}"}' > ~/.agent-keystore.json && chmod 600 ~/.agent-keystore.json`,
        clawdbot: '/home/node/.agent-keystore.json'
      },
      
      // Networks this wallet works on
      networks: [
        { name: 'Flare', chainId: 14, rpc: 'https://flare-api.flare.network/ext/C/rpc' },
        { name: 'HyperEVM', chainId: 999, rpc: 'https://rpc.hyperliquid.xyz/evm' },
        { name: 'Base', chainId: 8453, rpc: 'https://mainnet.base.org' },
        { name: 'Ethereum', chainId: 1, rpc: 'https://eth.llamarpc.com' }
      ]
    });

  } catch (error) {
    console.error('Wallet generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate wallet' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to generate a new multichain EVM wallet',
    example: {
      name: 'MyAgent'
    },
    warning: 'The response will include your private key. Save it securely!',
    docs: 'https://clawly.market/skill.md'
  });
}
