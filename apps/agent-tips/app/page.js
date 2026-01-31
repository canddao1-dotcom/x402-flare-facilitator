'use client'
import { useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'

const platforms = [
  { id: 'moltbook', icon: '🦞', name: 'Moltbook', active: true },
]

const GITHUB_REPO = 'https://github.com/AIdatamadao/x402'

const chains = [
  { id: 'flare', name: 'Flare', icon: '🔥', chainId: 14, tokens: ['USDT', 'WFLR', 'FXRP'] },
  { id: 'hyperevm', name: 'HyperEVM', icon: '⚡', chainId: 999, tokens: ['FXRP', 'HYPE'] },
]

// Token contracts
const TOKEN_ADDRESSES = {
  flare: {
    USDT: { address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6 },
    WFLR: { address: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d', decimals: 18 },
    FXRP: { address: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE', decimals: 6 },
  },
  hyperevm: {
    FXRP: { address: '0xd70659a6396285bf7214d7ea9673184e7c72e07e', decimals: 18 },
    HYPE: { address: 'native', decimals: 18 },
  }
}

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }]
  }
]

const percentOptions = [1, 10, 50, 100]

export default function AgentTips() {
  const [selectedPlatform, setSelectedPlatform] = useState('moltbook')
  const [selectedChain, setSelectedChain] = useState('flare')
  const [selectedToken, setSelectedToken] = useState('USDT')
  const [username, setUsername] = useState('')
  const [percent, setPercent] = useState(null)
  const [customPercent, setCustomPercent] = useState('')
  const [saved, setSaved] = useState(false)
  const [tipMode, setTipMode] = useState('pool') // 'pool' or 'wallet'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tipAmount, setTipAmount] = useState('1.00')
  const [txHash, setTxHash] = useState(null)
  
  // Wallet connection
  const { address, isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()
  
  // Get available tokens for selected chain
  const currentChain = chains.find(c => c.id === selectedChain)
  const availableTokens = currentChain?.tokens || ['USDT']
  
  // Reset token if not available on new chain
  const handleChainChange = (chainId) => {
    setSelectedChain(chainId)
    const chain = chains.find(c => c.id === chainId)
    if (chain && !chain.tokens.includes(selectedToken)) {
      setSelectedToken(chain.tokens[0])
    }
  }

  const handleSave = async () => {
    if (!username) {
      setError('Enter agent username')
      return
    }
    
    setLoading(true)
    setError('')
    setTxHash(null)
    
    try {
      // First resolve the agent's wallet address
      const resolveRes = await fetch(`/api/resolve?platform=${selectedPlatform}&username=${username}`)
      const resolveData = await resolveRes.json()
      
      if (!resolveData.address) {
        setError(resolveData.error || `Agent ${username} not found`)
        setLoading(false)
        return
      }
      
      const recipientAddress = resolveData.address
      
      if (tipMode === 'wallet' && isConnected) {
        // Wallet-funded tip - user pays directly
        const tokenInfo = TOKEN_ADDRESSES[selectedChain]?.[selectedToken]
        if (!tokenInfo) {
          setError(`Token ${selectedToken} not available on ${selectedChain}`)
          setLoading(false)
          return
        }
        
        const amount = parseUnits(tipAmount, tokenInfo.decimals)
        
        if (tokenInfo.address === 'native') {
          // Native token transfer (HYPE)
          // TODO: Implement native transfer with useSendTransaction
          setError('Native token tips coming soon')
          setLoading(false)
          return
        }
        
        // ERC20 transfer
        const hash = await writeContractAsync({
          address: tokenInfo.address,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [recipientAddress, amount],
        })
        
        setTxHash(hash)
        setSaved(true)
        setTimeout(() => setSaved(false), 5000)
        
      } else {
        // Pool-funded tip - facilitator pays
        const response = await fetch('/api/tip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: selectedPlatform,
            username: username,
            amount: tipAmount,
            token: selectedToken,
            chain: selectedChain
          })
        })
        
        const data = await response.json()
        
        if (data.success) {
          setTxHash(data.txHash)
          setSaved(true)
          setTimeout(() => setSaved(false), 5000)
        } else {
          setError(data.error || 'Failed to send tip')
        }
      }
    } catch (err) {
      console.error('Tip error:', err)
      setError(err.message || 'Transaction failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Share fees with agents</h2>
        
        {/* Wallet Connect */}
        <div style={styles.connectWrapper}>
          <ConnectButton.Custom>
            {({ account, chain, openConnectModal, openChainModal, mounted }) => {
              const connected = mounted && account && chain
              return (
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
                  {!connected ? (
                    <button onClick={openConnectModal} style={styles.connectBtn}>
                      Connect Wallet
                    </button>
                  ) : (
                    <>
                      <button onClick={openChainModal} style={styles.chainBtnSmall}>
                        {chain.name}
                      </button>
                      <button onClick={openConnectModal} style={styles.addressBtn}>
                        {account.displayName}
                      </button>
                    </>
                  )}
                </div>
              )
            }}
          </ConnectButton.Custom>
        </div>
        
        {/* Tip Mode Toggle */}
        <div style={styles.modeToggle}>
          <button
            onClick={() => setTipMode('pool')}
            style={{
              ...styles.modeBtn,
              ...(tipMode === 'pool' ? styles.modeBtnActive : {})
            }}
          >
            🎁 Free (Pool)
          </button>
          <button
            onClick={() => setTipMode('wallet')}
            disabled={!isConnected}
            style={{
              ...styles.modeBtn,
              ...(tipMode === 'wallet' ? styles.modeBtnActive : {}),
              ...((!isConnected) ? styles.modeBtnDisabled : {})
            }}
          >
            💳 My Wallet
          </button>
        </div>
        
        {/* Platform selector */}
        <div style={styles.platforms}>
          {platforms.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPlatform(p.id)}
              style={{
                ...styles.platformBtn,
                ...(selectedPlatform === p.id ? styles.platformActive : {})
              }}
              title={p.name}
            >
              {p.icon}
            </button>
          ))}
        </div>

        {/* Chain selector */}
        <div style={styles.inputGroup}>
          <label style={styles.label}>Network</label>
          <div style={styles.chainRow}>
            {chains.map(c => (
              <button
                key={c.id}
                onClick={() => handleChainChange(c.id)}
                style={{
                  ...styles.chainBtn,
                  ...(selectedChain === c.id ? styles.chainActive : {})
                }}
              >
                <span>{c.icon}</span>
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Token selector */}
        <div style={styles.inputGroup}>
          <label style={styles.label}>Token</label>
          <div style={styles.tokenRow}>
            {availableTokens.map(t => (
              <button
                key={t}
                onClick={() => setSelectedToken(t)}
                style={{
                  ...styles.tokenBtn,
                  ...(selectedToken === t ? styles.tokenActive : {})
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Username input */}
        <div style={styles.inputGroup}>
          <label style={styles.label}>Agent username</label>
          <div style={styles.inputWrapper}>
            <span style={styles.prefix}>u/</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="CanddaoJr"
              style={styles.input}
            />
          </div>
        </div>

        {/* Tip amount */}
        <div style={styles.inputGroup}>
          <label style={styles.label}>Tip amount ({selectedToken})</label>
          <div style={styles.inputWrapper}>
            <span style={styles.prefix}>{selectedToken === 'USDT' ? '$' : ''}</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={tipAmount}
              onChange={(e) => setTipAmount(e.target.value)}
              placeholder="1.00"
              style={styles.input}
            />
          </div>
        </div>

        {/* Percentage options */}
        <div style={styles.inputGroup}>
          <label style={styles.label}>Fee share percentage</label>
          <div style={styles.percentGrid}>
            {percentOptions.map(p => (
              <button
                key={p}
                onClick={() => { setPercent(p); setCustomPercent(''); }}
                style={{
                  ...styles.percentBtn,
                  ...(percent === p ? styles.percentActive : {})
                }}
              >
                {p}%
              </button>
            ))}
            <input
              type="number"
              min="1"
              max="100"
              value={customPercent}
              onChange={(e) => { setCustomPercent(e.target.value); setPercent(null); }}
              placeholder="Custom"
              style={{
                ...styles.percentBtn,
                ...styles.customInput,
                ...(customPercent ? styles.percentActive : {})
              }}
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div style={styles.error}>{error}</div>
        )}
        
        {/* Success with tx hash */}
        {txHash && (
          <div style={styles.success}>
            ✅ Sent! <a 
              href={`${selectedChain === 'flare' ? 'https://flarescan.com' : 'https://purrsec.com'}/tx/${txHash}`}
              target="_blank"
              rel="noopener"
              style={styles.txLink}
            >
              View tx ↗
            </a>
          </div>
        )}

        {/* Save button */}
        <button 
          onClick={handleSave}
          disabled={loading}
          style={{
            ...styles.saveBtn,
            ...(saved ? styles.saveBtnSuccess : {}),
            ...(loading ? styles.saveBtnLoading : {})
          }}
        >
          {loading ? 'Sending...' : saved ? '✓ Sent!' : `Tip ${tipAmount} ${selectedToken}`}
        </button>

        {/* Branding */}
        <div style={styles.branding}>
          <span>Powered by <strong>m/payments</strong></span>
        </div>
        
        {/* Links */}
        <div style={styles.linksRow}>
          <a href="/leaderboard" style={styles.leaderboardLink}>
            🏆 Leaderboard
          </a>
          <a href={GITHUB_REPO} target="_blank" rel="noopener" style={styles.githubLink}>
            ⬢ GitHub
          </a>
        </div>
        
        {/* Money bag icon */}
        <div style={styles.moneyBag}>💰</div>
      </div>
    </div>
  )
}

const styles = {
  connectWrapper: {
    marginBottom: '16px',
  },
  connectBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1px solid #00d4aa',
    backgroundColor: 'transparent',
    color: '#00d4aa',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  chainBtnSmall: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #333',
    backgroundColor: '#2a2a2b',
    color: '#888',
    fontSize: '12px',
    cursor: 'pointer',
  },
  addressBtn: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #00d4aa',
    backgroundColor: '#1a3a2a',
    color: '#00d4aa',
    fontSize: '12px',
    cursor: 'pointer',
  },
  modeToggle: {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
  },
  modeBtn: {
    flex: 1,
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#2a2a2b',
    color: '#888',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  modeBtnActive: {
    borderColor: '#00d4aa',
    backgroundColor: '#1a3a2a',
    color: '#00d4aa',
  },
  modeBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  success: {
    color: '#00d4aa',
    fontSize: '12px',
    textAlign: 'center',
    marginBottom: '12px',
    padding: '8px',
    backgroundColor: '#1a3a2a',
    borderRadius: '6px',
  },
  txLink: {
    color: '#00d4aa',
    marginLeft: '8px',
  },
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    position: 'relative',
    backgroundColor: '#1a1a1b',
    borderRadius: '16px',
    padding: '24px',
    width: '100%',
    maxWidth: '320px',
    border: '1px solid #333',
  },
  title: {
    color: '#fff',
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '20px',
    textAlign: 'center',
  },
  platforms: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    marginBottom: '24px',
  },
  platformBtn: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    border: '2px solid #333',
    backgroundColor: '#2a2a2b',
    color: '#888',
    fontSize: '20px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  platformActive: {
    borderColor: '#e01b24',
    backgroundColor: '#3a1a1a',
    color: '#fff',
  },
  chainRow: {
    display: 'flex',
    gap: '8px',
  },
  chainBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#2a2a2b',
    color: '#888',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  chainActive: {
    borderColor: '#00d4aa',
    backgroundColor: '#1a3a2a',
    color: '#00d4aa',
  },
  tokenRow: {
    display: 'flex',
    gap: '8px',
  },
  tokenBtn: {
    flex: 1,
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#2a2a2b',
    color: '#888',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tokenActive: {
    borderColor: '#ffd700',
    backgroundColor: '#3a3a1a',
    color: '#ffd700',
  },
  inputGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    color: '#888',
    fontSize: '12px',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#2a2a2b',
    borderRadius: '8px',
    border: '1px solid #333',
    overflow: 'hidden',
  },
  prefix: {
    color: '#666',
    padding: '12px',
    paddingRight: '4px',
    fontSize: '14px',
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    color: '#fff',
    fontSize: '14px',
    padding: '12px',
    paddingLeft: '0',
    outline: 'none',
  },
  percentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '8px',
  },
  percentBtn: {
    padding: '12px 8px',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#2a2a2b',
    color: '#888',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  percentActive: {
    borderColor: '#00d4aa',
    backgroundColor: '#1a3a2a',
    color: '#00d4aa',
  },
  customInput: {
    textAlign: 'center',
    outline: 'none',
    width: '100%',
  },
  saveBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#00d4aa',
    color: '#000',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '16px',
  },
  saveBtnSuccess: {
    backgroundColor: '#00ff88',
  },
  saveBtnLoading: {
    backgroundColor: '#666',
    cursor: 'wait',
  },
  error: {
    color: '#ff4444',
    fontSize: '12px',
    textAlign: 'center',
    marginBottom: '12px',
    padding: '8px',
    backgroundColor: '#3a1a1a',
    borderRadius: '6px',
  },
  branding: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    color: '#666',
    fontSize: '12px',
    marginBottom: '12px',
  },
  linksRow: {
    display: 'flex',
    gap: '8px',
  },
  leaderboardLink: {
    flex: 1,
    display: 'block',
    color: '#ffd700',
    textAlign: 'center',
    fontSize: '12px',
    textDecoration: 'none',
    padding: '10px',
    backgroundColor: '#2a2a2b',
    borderRadius: '8px',
    transition: 'background 0.2s',
  },
  githubLink: {
    flex: 1,
    display: 'block',
    color: '#888',
    textAlign: 'center',
    fontSize: '12px',
    textDecoration: 'none',
    padding: '10px',
    backgroundColor: '#2a2a2b',
    borderRadius: '8px',
    transition: 'all 0.2s',
  },
  moneyBag: {
    position: 'absolute',
    bottom: '16px',
    right: '16px',
    fontSize: '24px',
    opacity: 0.8,
  },
}
