'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const CONTRACT = '0xCd807619E1744ef4d4875efC9F24bb42a24049Cd' as `0x${string}`;
const USDT = '0xe7cd86e13AC4309349F30B3435a9d337750fC82D' as `0x${string}`;

interface Market {
  id: string;
  slug: string;
  question: string;
  potAmount: string;
  closeTime: string;
  predictionCount: number;
  resolved: boolean;
  outcome?: boolean;
}

interface BetInfo {
  pYes: number;
  claimed: boolean;
  payout?: string;
}

const USDT_ABI = [{ 
  name: 'approve', 
  type: 'function', 
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], 
  outputs: [{ type: 'bool' }], 
  stateMutability: 'nonpayable' 
}] as const;

const PREDICT_ABI = [{ 
  name: 'predict', 
  type: 'function', 
  inputs: [{ name: 'marketId', type: 'bytes32' }, { name: 'pYes', type: 'uint256' }], 
  outputs: [], 
  stateMutability: 'nonpayable' 
}] as const;

const CLAIM_ABI = [{
  name: 'claim',
  type: 'function',
  inputs: [{ name: 'marketId', type: 'bytes32' }],
  outputs: [],
  stateMutability: 'nonpayable'
}] as const;

export default function MarketsPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [pYesValues, setPYesValues] = useState<Record<string, number>>({});
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [existingBets, setExistingBets] = useState<Record<string, BetInfo | null>>({});
  
  const { address, isConnected } = useAccount();
  
  // Hooks must be defined before useEffects that use them
  const { writeContract: approve, data: approveHash, isPending: approvePending } = useWriteContract();
  const { writeContract: predict, data: predictHash, isPending: predictPending } = useWriteContract();
  const { writeContract: claim, data: claimHash, isPending: claimPending } = useWriteContract();
  
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isSuccess: predictConfirmed } = useWaitForTransactionReceipt({ hash: predictHash });
  const { isSuccess: claimConfirmed } = useWaitForTransactionReceipt({ hash: claimHash });

  // Fetch markets
  useEffect(() => {
    fetch('/api/markets')
      .then(r => r.json())
      .then(data => {
        setMarkets(data.markets || []);
        const initial: Record<string, number> = {};
        (data.markets || []).forEach((m: Market) => { initial[m.id] = 50; });
        setPYesValues(initial);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Check existing bets
  useEffect(() => {
    if (!address || markets.length === 0) return;
    
    const checkBets = async () => {
      const bets: Record<string, BetInfo | null> = {};
      for (const market of markets) {
        try {
          const res = await fetch(`/api/check-bet?market=${market.id}&address=${address}`);
          const data = await res.json();
          if (data.hasBet) {
            bets[market.id] = { pYes: data.pYes, claimed: data.claimed || false, payout: data.payout };
          }
        } catch { /* ignore */ }
      }
      setExistingBets(bets);
    };
    checkBets();
  }, [address, markets]);

  // Approve -> Predict flow
  useEffect(() => {
    if (approveConfirmed && step === 1) setStep(2);
  }, [approveConfirmed, step]);

  useEffect(() => {
    if (predictConfirmed && step === 2) setStep(3);
  }, [predictConfirmed, step]);

  // Claim success -> reload
  useEffect(() => {
    if (claimConfirmed) window.location.reload();
  }, [claimConfirmed]);

  const handleApprove = () => {
    approve({
      address: USDT,
      abi: USDT_ABI,
      functionName: 'approve',
      args: [CONTRACT, parseUnits('1', 6)],
    });
  };

  const handlePredict = (marketId: string) => {
    predict({
      address: CONTRACT,
      abi: PREDICT_ABI,
      functionName: 'predict',
      args: [marketId as `0x${string}`, BigInt(pYesValues[marketId] || 50)],
    });
  };

  const handleClaim = (marketId: string) => {
    claim({
      address: CONTRACT,
      abi: CLAIM_ABI,
      functionName: 'claim',
      args: [marketId as `0x${string}`],
    });
  };

  const getPYes = (marketId: string) => pYesValues[marketId] || 50;
  const setPYes = (marketId: string, value: number) => {
    setPYesValues(prev => ({ ...prev, [marketId]: value }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <header className="border-b border-gray-800 p-3">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🎰</span>
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
              clawly.market
            </h1>
          </Link>
          <nav className="flex gap-3 items-center">
            <Link href="/markets" className="text-purple-400 text-sm font-medium">📊 Markets</Link>
            <Link href="/leaderboard" className="text-gray-400 hover:text-yellow-300 text-sm font-medium">🏆 Board</Link>
            <ConnectButton.Custom>
              {({ account, chain, openConnectModal, mounted }) => {
                if (!mounted || !account || !chain) {
                  return <button onClick={openConnectModal} className="bg-purple-600 hover:bg-purple-500 px-3 py-1.5 rounded-lg text-sm font-medium">Connect</button>;
                }
                return <span className="text-xs text-gray-400 font-mono">{account.displayName}</span>;
              }}
            </ConnectButton.Custom>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-6 text-center">📊 Prediction Markets</h2>

        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading...</div>
        ) : markets.length === 0 ? (
          <div className="text-center text-gray-500 py-12">No markets yet</div>
        ) : (
          <div className="space-y-6">
            {markets.map((market) => (
              <div key={market.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-semibold">{market.question}</h3>
                  {market.resolved ? (
                    <span className={`px-2 py-1 rounded text-xs font-bold ${market.outcome ? 'bg-green-600' : 'bg-red-600'}`}>
                      {market.outcome ? 'YES' : 'NO'}
                    </span>
                  ) : (
                    <span className="bg-purple-600/30 text-purple-300 px-2 py-1 rounded text-xs">Active</span>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-3 text-sm text-gray-400 mb-4">
                  <span>💰 {market.potAmount} USDT</span>
                  <span>👥 {market.predictionCount} bets</span>
                  <span>⏰ {new Date(market.closeTime).toLocaleDateString()}</span>
                </div>

                {/* RESOLVED - Show claim */}
                {market.resolved && (
                  <div className="bg-gray-900/50 rounded-lg p-4 text-center">
                    {isConnected && existingBets[market.id] ? (
                      <>
                        <p className="text-gray-400 mb-2">Your bet: {existingBets[market.id]?.pYes}% YES</p>
                        {existingBets[market.id]?.claimed ? (
                          <p className="text-green-400 font-bold">✅ Payout claimed!</p>
                        ) : (
                          <button
                            onClick={() => handleClaim(market.id)}
                            disabled={claimPending}
                            className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 px-6 py-3 rounded-lg font-bold transition text-lg"
                          >
                            {claimPending ? '⏳ Claiming...' : '💰 Claim Payout'}
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-500">Market resolved - {market.outcome ? 'YES' : 'NO'}</p>
                    )}
                  </div>
                )}

                {/* ACTIVE - Betting UI */}
                {!market.resolved && (
                  <div className="bg-gray-900/50 rounded-lg p-4">
                    {!isConnected ? (
                      <div className="text-center"><ConnectButton /></div>
                    ) : existingBets[market.id] ? (
                      <div className="text-center py-2">
                        <p className="text-green-400 text-lg font-bold">✅ Your bet: {existingBets[market.id]?.pYes}% YES</p>
                        <p className="text-gray-500 text-xs">Waiting for resolution</p>
                      </div>
                    ) : step === 3 ? (
                      <div className="text-center text-green-400 py-2">
                        ✅ Bet placed! <a href={`https://flarescan.com/tx/${predictHash}`} target="_blank" className="underline">View tx</a>
                      </div>
                    ) : (
                      <>
                        <div className="mb-4">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm text-gray-400">Your prediction:</span>
                            <span className={`font-bold ${getPYes(market.id) >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                              {getPYes(market.id)}% YES
                            </span>
                          </div>
                          <input
                            type="range" min="1" max="99"
                            value={getPYes(market.id)}
                            onChange={(e) => setPYes(market.id, Number(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={handleApprove}
                            disabled={approvePending || step >= 2}
                            className={`py-3 rounded-lg font-medium text-sm transition ${step >= 2 ? 'bg-green-600/30 text-green-400' : 'bg-purple-600 hover:bg-purple-500'}`}
                          >
                            {approvePending ? '⏳...' : step >= 2 ? '✅ Approved' : '1️⃣ Approve'}
                          </button>
                          
                          <button
                            onClick={() => handlePredict(market.id)}
                            disabled={predictPending || step < 2}
                            className={`py-3 rounded-lg font-medium text-sm transition ${step < 2 ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500'}`}
                          >
                            {predictPending ? '⏳...' : '2️⃣ Bet'}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-center">Entry: 0.10 USDT</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
