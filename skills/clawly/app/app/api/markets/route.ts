import { NextResponse } from 'next/server';
import { ethers } from 'ethers';

const CONTRACT = '0xCd807619E1744ef4d4875efC9F24bb42a24049Cd';
const RPC = 'https://flare-api.flare.network/ext/C/rpc';

const ABI = [
  'function getMarket(bytes32 marketId) view returns (string question, uint256 seedAmount, uint256 potAmount, uint256 closeTime, bool resolved, bool outcome, uint256 predictionCount)',
];

// Known market IDs (from contract events - manually tracked due to RPC limits)
const KNOWN_MARKETS = [
  { 
    id: '0x8a4a8d1bbf44520f3b81878a468e2b4fb22affa42857d1e0bf9152c2d96f487b',
    slug: 'eth-5000-march-2026',
    createTx: '0x2fa98243422f958e98e78c98f2ce9cb322824d6976cab66a236f3b6969d8a822'
  },
  { 
    id: '0x13a2e3900726722f375fa593c7c5ba0572bc6647a54fe8e54258f99d7f0f7bcd',
    slug: 'test-5min',
    createTx: '0xd30b03fb97cabc9510c606a4c0cf2069c92b22d928989d7538c57af43f8ad90f'
  }
];

export async function GET() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC);
    const contract = new ethers.Contract(CONTRACT, ABI, provider);
    
    const markets = await Promise.all(
      KNOWN_MARKETS.map(async (known) => {
        try {
          const market = await contract.getMarket(known.id);
          return {
            id: known.id,
            slug: known.slug,
            question: market[0],
            seedAmount: ethers.formatUnits(market[1], 6),
            potAmount: ethers.formatUnits(market[2], 6),
            closeTime: new Date(Number(market[3]) * 1000).toISOString(),
            resolved: market[4],
            outcome: market[5],
            predictionCount: Number(market[6]),
            createTx: known.createTx
          };
        } catch (e) {
          console.error('Error fetching market:', e);
          return null;
        }
      })
    );
    
    return NextResponse.json({
      markets: markets.filter(Boolean),
      count: markets.filter(Boolean).length,
      contract: CONTRACT,
      network: 'flare',
      source: 'on-chain'
    });
  } catch (error: any) {
    console.error('Error fetching markets:', error);
    return NextResponse.json({
      markets: [],
      count: 0,
      contract: CONTRACT,
      network: 'flare',
      error: error.message
    });
  }
}
