import { NextResponse } from 'next/server';

// Mock markets (replace with contract/DB in production)
const markets = [
  {
    id: 'eth-5000-march-2026',
    question: 'Will ETH hit $5000 by March 2026?',
    potAmount: '10.00',
    closeTime: '2026-03-01T00:00:00Z',
    predictionCount: 0,
    resolved: false,
    outcome: null
  }
];

export async function GET() {
  return NextResponse.json({
    markets: markets.map(m => ({
      id: m.id,
      question: m.question,
      potAmount: m.potAmount,
      closeTime: m.closeTime,
      predictionCount: m.predictionCount,
      resolved: m.resolved,
      ...(m.resolved && { outcome: m.outcome })
    })),
    count: markets.length,
    contract: '0xCd807619E1744ef4d4875efC9F24bb42a24049Cd',
    network: 'flare'
  });
}
