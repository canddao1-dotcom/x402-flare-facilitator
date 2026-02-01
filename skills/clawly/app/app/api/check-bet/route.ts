import { NextResponse } from 'next/server';
import { ethers } from 'ethers';

const CONTRACT = '0xCd807619E1744ef4d4875efC9F24bb42a24049Cd';
const RPC = 'https://flare-api.flare.network/ext/C/rpc';

const ABI = [
  'function getPrediction(bytes32 marketId, address agent) view returns (uint256 pYes, uint256 timestamp, bool claimed)',
  'function getMarket(bytes32 marketId) view returns (string, uint256, uint256, uint256, bool, bool, uint256)',
  'function estimatePayout(bytes32 marketId, address agent, bool assumedOutcome) view returns (uint256)',
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get('market');
    const address = searchParams.get('address');
    
    if (!marketId || !address) {
      return NextResponse.json({ error: 'Missing market or address' }, { status: 400 });
    }
    
    const provider = new ethers.JsonRpcProvider(RPC);
    const contract = new ethers.Contract(CONTRACT, ABI, provider);
    
    const pred = await contract.getPrediction(marketId, address);
    const pYes = Number(pred[0]);
    const timestamp = Number(pred[1]);
    const claimed = pred[2];
    
    // If timestamp is 0, no bet exists
    if (timestamp === 0) {
      return NextResponse.json({ hasBet: false });
    }
    
    // Get market to check if resolved
    const market = await contract.getMarket(marketId);
    const resolved = market[4];
    const outcome = market[5];
    
    let payout = null;
    if (resolved) {
      try {
        const payoutWei = await contract.estimatePayout(marketId, address, outcome);
        payout = ethers.formatUnits(payoutWei, 6);
      } catch {
        // ignore
      }
    }
    
    return NextResponse.json({
      hasBet: true,
      pYes,
      timestamp,
      claimed,
      payout,
      createdAt: new Date(timestamp * 1000).toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({ hasBet: false, error: error.message });
  }
}
