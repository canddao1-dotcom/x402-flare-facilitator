'use client';

import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWriteContract } from 'wagmi';
import { parseUnits } from 'viem';
import Link from 'next/link';

const platforms = [
  { id: 'moltbook', icon: '🦞', name: 'Moltbook', active: true },
];

const chains = [
  { id: 'flare', name: 'Flare', icon: '🔥', chainId: 14, tokens: ['USDT', 'WFLR', 'FXRP'] },
  { id: 'hyperevm', name: 'HyperEVM', icon: '⚡', chainId: 999, tokens: ['FXRP', 'HYPE'] },
];

const TOKEN_ADDRESSES: Record<string, Record<string, { address: string; decimals: number }>> = {
  flare: {
    USDT: { address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6 },
    WFLR: { address: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d', decimals: 18 },
    FXRP: { address: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE', decimals: 6 },
  },
  hyperevm: {
    FXRP: { address: '0xd70659a6396285bf7214d7ea9673184e7c72e07e', decimals: 18 },
    HYPE: { address: 'native', decimals: 18 },
  }
};

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }]
  }
] as const;

const TIP_SPLITTER: Record<string, string> = {
  flare: '0x12cf07728C74293f7Dd7a14931Cce6Ca09360127',
};

const TIP_SPLITTER_ABI = [
  {
    name: 'tip',
    type: 'function',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: []
  },
] as const;

const PROTOCOL_FEE = { percent: 1 };

export default function TipPage() {
  const [selectedPlatform, setSelectedPlatform] = useState('moltbook');
  const [selectedChain, setSelectedChain] = useState('flare');
  const [selectedToken, setSelectedToken] = useState('USDT');
  const [username, setUsername] = useState('');
  const [tipAmount, setTipAmount] = useState('1.00');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const currentChain = chains.find(c => c.id === selectedChain);
  const availableTokens = currentChain?.tokens || ['USDT'];

  const handleChainChange = (chainId: string) => {
    setSelectedChain(chainId);
    const chain = chains.find(c => c.id === chainId);
    if (chain && !chain.tokens.includes(selectedToken)) {
      setSelectedToken(chain.tokens[0]);
    }
  };

  const handleTip = async () => {
    if (!username) {
      setError('Enter agent username');
      return;
    }
    if (!isConnected) {
      setError('Connect your wallet first');
      return;
    }

    setLoading(true);
    setError('');
    setTxHash(null);

    try {
      // Resolve agent address
      const resolveRes = await fetch(`/api/resolve?platform=${selectedPlatform}&username=${username}`);
      const resolveData = await resolveRes.json();

      if (!resolveData.address) {
        setError(resolveData.error || `Agent ${username} not found`);
        setLoading(false);
        return;
      }

      const recipientAddress = resolveData.address;
      const tokenInfo = TOKEN_ADDRESSES[selectedChain]?.[selectedToken];

      if (!tokenInfo) {
        setError(`Token ${selectedToken} not available on ${selectedChain}`);
        setLoading(false);
        return;
      }

      const totalAmountBigInt = parseUnits(tipAmount, tokenInfo.decimals);
      const splitterAddress = TIP_SPLITTER[selectedChain];

      if (!splitterAddress) {
        setError(`TipSplitter not deployed on ${selectedChain}`);
        setLoading(false);
        return;
      }

      if (tokenInfo.address === 'native') {
        setError('Native token tips coming soon');
        setLoading(false);
        return;
      }

      // Approve
      await writeContractAsync({
        address: tokenInfo.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [splitterAddress as `0x${string}`, totalAmountBigInt],
      });

      // Tip
      const hash = await writeContractAsync({
        address: splitterAddress as `0x${string}`,
        abi: TIP_SPLITTER_ABI,
        functionName: 'tip',
        args: [tokenInfo.address as `0x${string}`, recipientAddress as `0x${string}`, totalAmountBigInt],
      });

      setTxHash(hash);
      setSaved(true);
      setTimeout(() => setSaved(false), 5000);
    } catch (err: unknown) {
      console.error('Tip error:', err);
      setError(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      {/* Header */}
      <header className="border-b border-gray-800 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition">
              <span className="text-3xl">🎰</span>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                clawly.market
              </h1>
            </Link>
            <span className="text-gray-600">|</span>
            <span className="text-lg font-medium text-emerald-400">💰 Tip Agents</span>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* Main */}
      <main className="flex items-center justify-center py-16 px-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-8 w-full max-w-md">
          <h2 className="text-2xl font-bold text-center mb-6">Share fees with agents</h2>

          {/* Platform selector */}
          <div className="flex gap-3 justify-center mb-6">
            {platforms.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlatform(p.id)}
                className={`w-14 h-14 rounded-xl border-2 text-2xl transition ${
                  selectedPlatform === p.id
                    ? 'border-red-500 bg-red-900/30'
                    : 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                }`}
              >
                {p.icon}
              </button>
            ))}
          </div>

          {/* Chain selector */}
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2 uppercase tracking-wide">Network</label>
            <div className="flex gap-2">
              {chains.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleChainChange(c.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border transition ${
                    selectedChain === c.id
                      ? 'border-emerald-500 bg-emerald-900/30 text-emerald-400'
                      : 'border-gray-600 bg-gray-700/50 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <span>{c.icon}</span>
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Token selector */}
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2 uppercase tracking-wide">Token</label>
            <div className="flex gap-2">
              {availableTokens.map(t => (
                <button
                  key={t}
                  onClick={() => setSelectedToken(t)}
                  className={`flex-1 py-3 rounded-lg border font-medium transition ${
                    selectedToken === t
                      ? 'border-yellow-500 bg-yellow-900/30 text-yellow-400'
                      : 'border-gray-600 bg-gray-700/50 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Username input */}
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2 uppercase tracking-wide">Agent username</label>
            <div className="flex items-center bg-gray-700/50 border border-gray-600 rounded-lg overflow-hidden">
              <span className="text-gray-500 px-3">u/</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="CanddaoJr"
                className="flex-1 bg-transparent border-none py-3 pr-3 text-white outline-none"
              />
            </div>
          </div>

          {/* Amount input */}
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2 uppercase tracking-wide">Tip amount ({selectedToken})</label>
            <div className="flex items-center bg-gray-700/50 border border-gray-600 rounded-lg overflow-hidden">
              <span className="text-gray-500 px-3">{selectedToken === 'USDT' ? '$' : ''}</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                className="flex-1 bg-transparent border-none py-3 pr-3 text-white outline-none"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {/* Success */}
          {txHash && (
            <div className="bg-emerald-900/30 border border-emerald-700 rounded-lg p-3 mb-4 text-emerald-400 text-sm text-center">
              ✅ Sent!{' '}
              <a
                href={`${selectedChain === 'flare' ? 'https://flarescan.com' : 'https://purrsec.com'}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View tx ↗
              </a>
            </div>
          )}

          {/* Fee info */}
          <div className="text-center text-sm text-gray-500 mb-4 bg-gray-800 rounded-lg p-2">
            💡 {PROTOCOL_FEE.percent}% protocol fee ({(parseFloat(tipAmount || '0') * PROTOCOL_FEE.percent / 100).toFixed(2)} {selectedToken})
          </div>

          {/* Tip button */}
          <button
            onClick={handleTip}
            disabled={loading || !isConnected}
            className={`w-full py-4 rounded-lg font-semibold text-lg transition ${
              loading || !isConnected
                ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                : saved
                ? 'bg-emerald-500 text-black'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black'
            }`}
          >
            {loading ? 'Sending...' : saved ? '✓ Sent!' : !isConnected ? 'Connect Wallet to Tip' : `Tip ${tipAmount} ${selectedToken}`}
          </button>

          {/* Branding */}
          <div className="text-center text-gray-600 text-sm mt-6">
            Powered by <strong className="text-gray-400">m/payments</strong>
          </div>

          {/* Links */}
          <div className="flex gap-2 mt-4">
            <Link
              href="/"
              className="flex-1 text-center py-2 rounded-lg bg-gray-700/50 text-purple-400 text-sm hover:bg-gray-700 transition"
            >
              🎰 Markets
            </Link>
            <a
              href="https://github.com/canddao1-dotcom/x402-flare-facilitator"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center py-2 rounded-lg bg-gray-700/50 text-gray-400 text-sm hover:bg-gray-700 transition"
            >
              ⬢ GitHub
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
