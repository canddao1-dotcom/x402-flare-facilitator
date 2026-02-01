'use client'

import { useState, useEffect } from 'react'
import { ethers } from 'ethers'

const CONTRACT_ADDRESS = '0xfD54d48Ff3E931914833A858d317B2AeD2aA9a4c'
const USDT_ADDRESS = '0xe7cd86e13AC4309349F30B3435a9d337750fC82D'
const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc'

const CONTRACT_ABI = [
  'function markets(bytes32) view returns (bytes32 feedId, uint256 targetPrice, uint256 settlementTime, uint256 totalYes, uint256 totalNo, bool resolved, bool outcome)',
  'function bet(bytes32 marketId, bool isYes, uint256 amount) external',
  'function claim(bytes32 marketId) external',
  'event MarketCreated(bytes32 indexed marketId, bytes32 feedId, uint256 targetPrice, uint256 settlementTime)',
  'event BetPlaced(bytes32 indexed marketId, address indexed bettor, bool isYes, uint256 amount)'
]

const USDT_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
]

// FTSO Feed ID to symbol mapping
const FEED_SYMBOLS = {
  '0x01464c522f555344000000000000000000000000000000000000000000000000': 'FLR/USD',
  '0x015852502f555344000000000000000000000000000000000000000000000000': 'XRP/USD',
  '0x014254432f555344000000000000000000000000000000000000000000000000': 'BTC/USD',
  '0x014554482f555344000000000000000000000000000000000000000000000000': 'ETH/USD',
}

function decodeFeedId(feedId) {
  return FEED_SYMBOLS[feedId] || feedId.slice(0, 20) + '...'
}

export default function Home() {
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState(null)
  const [signer, setSigner] = useState(null)

  // Known market IDs (in production, fetch from events)
  const KNOWN_MARKETS = [
    '0x6177c32889f337740abf28dee58c9cf43b40e2a2a5f36a5b87f469a0d061e7ad'
  ]

  useEffect(() => {
    fetchMarkets()
  }, [])

  async function fetchMarkets() {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL)
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider)
      
      // Fetch all known markets
      const marketData = await Promise.all(
        KNOWN_MARKETS.map(async (id) => {
          try {
            const m = await contract.markets(id)
            return {
              id,
              feedId: m[0],
              symbol: decodeFeedId(m[0]),
              targetPrice: Number(m[1]) / 1e7, // Adjust decimals
              settlementTime: Number(m[2]),
              totalYes: Number(ethers.formatUnits(m[3], 6)),
              totalNo: Number(ethers.formatUnits(m[4], 6)),
              resolved: m[5],
              outcome: m[6]
            }
          } catch (e) {
            console.error('Error fetching market', id, e)
            return null
          }
        })
      )
      
      setMarkets(marketData.filter(m => m && m.settlementTime > 0))
    } catch (e) {
      console.error('Error fetching markets:', e)
    } finally {
      setLoading(false)
    }
  }

  async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
      alert('Please install MetaMask!')
      return
    }
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const accounts = await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      setAccount(accounts[0])
      setSigner(signer)
      
      // Switch to Flare network
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xe' }], // 14 in hex
        })
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0xe',
              chainName: 'Flare',
              nativeCurrency: { name: 'Flare', symbol: 'FLR', decimals: 18 },
              rpcUrls: ['https://flare-api.flare.network/ext/C/rpc'],
              blockExplorerUrls: ['https://flarescan.com']
            }]
          })
        }
      }
    } catch (e) {
      console.error('Connect error:', e)
    }
  }

  async function placeBet(marketId, isYes) {
    if (!signer) {
      await connectWallet()
      return
    }
    
    const amount = prompt(`Enter USDT amount to bet ${isYes ? 'YES' : 'NO'}:`)
    if (!amount || isNaN(amount)) return
    
    try {
      const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, signer)
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
      const amountWei = ethers.parseUnits(amount, 6)
      
      // Check/set approval
      const allowance = await usdt.allowance(account, CONTRACT_ADDRESS)
      if (allowance < amountWei) {
        const approveTx = await usdt.approve(CONTRACT_ADDRESS, ethers.MaxUint256)
        await approveTx.wait()
      }
      
      // Place bet
      const tx = await contract.bet(marketId, isYes, amountWei)
      await tx.wait()
      
      alert('Bet placed successfully!')
      fetchMarkets()
    } catch (e) {
      console.error('Bet error:', e)
      alert('Error: ' + e.message)
    }
  }

  function formatTime(timestamp) {
    if (timestamp === 0) return 'N/A'
    const date = new Date(timestamp * 1000)
    return date.toLocaleString()
  }

  function getTimeRemaining(timestamp) {
    const now = Date.now() / 1000
    const diff = timestamp - now
    if (diff <= 0) return 'Ended'
    if (diff < 60) return `${Math.floor(diff)}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`
    return `${Math.floor(diff / 86400)}d`
  }

  return (
    <div className="container">
      <header>
        <div>
          <div className="logo">🔮 Clawly</div>
          <div className="tagline">AI Prediction Markets on Flare</div>
        </div>
        <button 
          className={`connect-btn ${account ? 'connected' : ''}`}
          onClick={connectWallet}
        >
          {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect Wallet'}
        </button>
      </header>

      {loading ? (
        <div className="loading">Loading markets...</div>
      ) : markets.length === 0 ? (
        <div className="empty-state">
          <h2>No active markets</h2>
          <p>Check back soon for new prediction markets!</p>
        </div>
      ) : (
        <div className="markets-grid">
          {markets.map(market => (
            <div key={market.id} className="market-card">
              <div className="market-header">
                <span className="market-feed">{market.symbol}</span>
                <span className={`market-status ${market.resolved ? 'resolved' : 'active'}`}>
                  {market.resolved ? (market.outcome ? '✓ YES' : '✗ NO') : 'LIVE'}
                </span>
              </div>
              
              <div className="market-question">
                Will {market.symbol} be above target at settlement?
              </div>
              
              <div className="market-target">
                ${market.targetPrice.toFixed(6)}
              </div>
              
              <div className="market-stats">
                <div className="stat">
                  <div className="stat-label">YES Pool</div>
                  <div className="stat-value yes">{market.totalYes.toFixed(2)} USDT</div>
                </div>
                <div className="stat">
                  <div className="stat-label">NO Pool</div>
                  <div className="stat-value no">{market.totalNo.toFixed(2)} USDT</div>
                </div>
              </div>
              
              <div className="market-footer">
                <div className="market-time">
                  {market.resolved ? 'Settled' : `Settles: ${getTimeRemaining(market.settlementTime)}`}
                </div>
              </div>
              
              {!market.resolved && (
                <div className="bet-buttons">
                  <button className="bet-btn yes" onClick={() => placeBet(market.id, true)}>
                    Bet YES
                  </button>
                  <button className="bet-btn no" onClick={() => placeBet(market.id, false)}>
                    Bet NO
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      <footer style={{ marginTop: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem' }}>
        <p>Contract: <a href={`https://flarescan.com/address/${CONTRACT_ADDRESS}`} target="_blank" style={{ color: 'var(--accent)' }}>{CONTRACT_ADDRESS.slice(0, 10)}...</a></p>
        <p style={{ marginTop: '0.5rem' }}>Powered by Flare FTSO • Built by Canddao Jr</p>
      </footer>
    </div>
  )
}
