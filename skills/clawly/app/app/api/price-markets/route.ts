import { NextResponse } from 'next/server';
import { ethers } from 'ethers';

const CONTRACT = '0xfD54d48Ff3E931914833A858d317B2AeD2aA9a4c';
const RPC = 'https://flare-api.flare.network/ext/C/rpc';

const ABI = [
  'function markets(bytes32) view returns (bytes32 feedId, uint256 targetPrice, uint256 settlementTime, uint256 totalYes, uint256 totalNo, bool resolved, bool outcome)',
  'event MarketCreated(bytes32 indexed marketId, bytes32 feedId, uint256 targetPrice, uint256 settlementTime)'
];

// FTSO Feed ID mappings
const FEED_SYMBOLS: Record<string, string> = {
  '0x01464c522f555344000000000000000000000000000000000000000000000000': 'FLR/USD',
  '0x015852502f555344000000000000000000000000000000000000000000000000': 'XRP/USD',
  '0x014254432f555344000000000000000000000000000000000000000000000000': 'BTC/USD',
  '0x014554482f555344000000000000000000000000000000000000000000000000': 'ETH/USD',
};

// Known price market IDs
const KNOWN_PRICE_MARKETS = [
  { 
    id: '0x6177c32889f337740abf28dee58c9cf43b40e2a2a5f36a5b87f469a0d061e7ad',
    createTx: '0x4ba31235541a126292080d2ce88918b37d4b8ffe67c0f5649234ac6f4a815321'
  }
];

function decodeFeedSymbol(feedId: string): string {
  return FEED_SYMBOLS[feedId] || feedId.slice(0, 20) + '...';
}

export async function GET() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC);
    const contract = new ethers.Contract(CONTRACT, ABI, provider);
    
    const markets = await Promise.all(
      KNOWN_PRICE_MARKETS.map(async (known) => {
        try {
          const m = await contract.markets(known.id);
          const feedId = m[0];
          const symbol = decodeFeedSymbol(feedId);
          const targetPrice = Number(m[1]) / 1e7; // FTSO uses 7 decimals
          
          return {
            id: known.id,
            type: 'price',
            feedId,
            symbol,
            question: `Will ${symbol} be above $${targetPrice.toFixed(4)} at settlement?`,
            targetPrice,
            settlementTime: new Date(Number(m[2]) * 1000).toISOString(),
            totalYes: ethers.formatUnits(m[3], 6),
            totalNo: ethers.formatUnits(m[4], 6),
            potAmount: ethers.formatUnits(m[3] + m[4], 6),
            resolved: m[5],
            outcome: m[6],
            createTx: known.createTx
          };
        } catch (e) {
          console.error('Error fetching price market:', e);
          return null;
        }
      })
    );
    
    return NextResponse.json({
      markets: markets.filter(Boolean),
      count: markets.filter(Boolean).length,
      contract: CONTRACT,
      network: 'flare',
      type: 'price-ftso'
    });
  } catch (error: any) {
    console.error('Error fetching price markets:', error);
    return NextResponse.json({
      markets: [],
      count: 0,
      contract: CONTRACT,
      network: 'flare',
      error: error.message
    });
  }
}
