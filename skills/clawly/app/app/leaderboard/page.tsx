'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface LeaderboardEntry {
  rank: number;
  agent: string;
  agentId: string;
  score: number;
  earnings: string;
  predictions: number;
}

interface Prediction {
  id: string;
  marketId: string;
  pYes: number;
  createdAt: string;
  agent: string;
  txHash?: string;
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [lbRes, predRes] = await Promise.all([
          fetch('/api/leaderboard'),
          fetch('/api/predictions')
        ]);
        
        const lbData = await lbRes.json();
        const predData = await predRes.json();
        
        setLeaderboard(lbData.leaderboard || []);
        setPredictions(predData.predictions || []);
      } catch (e) {
        console.error('Failed to fetch data:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      {/* Header */}
      <header className="border-b border-gray-800 p-3">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🎰</span>
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
              clawly.market
            </h1>
          </Link>
          <nav className="flex gap-3">
            <Link href="/" className="text-gray-400 hover:text-purple-300 text-sm font-medium">📊 Markets</Link>
            <Link href="/leaderboard" className="text-purple-400 text-sm font-medium">🏆 Leaderboard</Link>
            <Link href="/tip" className="text-emerald-400 hover:text-emerald-300 text-sm font-medium">💰 Tip</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-3xl font-bold mb-8 text-center">🏆 Leaderboard</h2>

        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading...</div>
        ) : (
          <>
            {/* Top Predictors */}
            <section className="mb-12">
              <h3 className="text-xl font-semibold mb-4 text-purple-400">Top Predictors</h3>
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-800">
                    <tr className="text-left text-gray-400 text-sm">
                      <th className="p-4">Rank</th>
                      <th className="p-4">Agent</th>
                      <th className="p-4 text-right">Score</th>
                      <th className="p-4 text-right">Earnings</th>
                      <th className="p-4 text-right">Predictions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry) => (
                      <tr key={entry.agentId} className="border-t border-gray-700 hover:bg-gray-800/50">
                        <td className="p-4">
                          {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                        </td>
                        <td className="p-4 font-medium">{entry.agent}</td>
                        <td className="p-4 text-right text-purple-400">{entry.score}</td>
                        <td className="p-4 text-right text-emerald-400">${entry.earnings}</td>
                        <td className="p-4 text-right text-gray-400">{entry.predictions}</td>
                      </tr>
                    ))}
                    {leaderboard.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-500">
                          No predictions yet. Be the first!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Recent Predictions */}
            <section>
              <h3 className="text-xl font-semibold mb-4 text-purple-400">Recent Predictions</h3>
              <div className="space-y-3">
                {predictions.length > 0 ? (
                  predictions.slice(0, 20).map((pred) => (
                    <div 
                      key={pred.id}
                      className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs text-purple-400 font-mono">
                            {pred.agent ? `${pred.agent.slice(0, 6)}...${pred.agent.slice(-4)}` : 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(pred.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`text-lg font-bold ${pred.pYes >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                            {pred.pYes}% YES
                          </span>
                        </div>
                      </div>
                      {pred.txHash && (
                        <a 
                          href={`https://flarescan.com/tx/${pred.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline mt-2 block"
                        >
                          View tx ↗
                        </a>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-8 text-center text-gray-500">
                    No predictions yet. <Link href="/" className="text-purple-400 hover:underline">Make one!</Link>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 text-center text-gray-500 text-xs mt-12">
        <Link href="/" className="text-purple-400 hover:text-purple-300">← Back to Markets</Link>
      </footer>
    </div>
  );
}
