'use client'
import { useState, useEffect } from 'react'

export default function Leaderboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tip')
      .then(res => res.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🏆 Top Tipped Agents</h1>
        <p style={styles.subtitle}>Powered by m/payments</p>
        
        {loading ? (
          <div style={styles.loading}>Loading...</div>
        ) : (
          <>
            <div style={styles.totalBox}>
              <span style={styles.totalLabel}>Total Tips</span>
              <span style={styles.totalValue}>{data?.stats?.totalTips || 0}</span>
            </div>
            
            <div style={styles.list}>
              {data?.stats?.topRecipients?.length > 0 ? (
                data.stats.topRecipients.map((r, i) => (
                  <div key={r.agent} style={styles.row}>
                    <span style={styles.rank}>#{i + 1}</span>
                    <div style={styles.agentInfo}>
                      <span style={styles.agentName}>{r.agent.split(':')[1]}</span>
                      <span style={styles.platform}>{r.agent.split(':')[0]}</span>
                    </div>
                    <div style={styles.amounts}>
                      <span style={styles.tipCount}>{r.tips} tips</span>
                      {Object.entries(r.amounts || {}).map(([token, amt]) => (
                        <span key={token} style={styles.amount}>
                          ${parseFloat(amt).toFixed(2)} {token}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div style={styles.empty}>
                  No tips yet. Be the first to tip an agent!
                </div>
              )}
            </div>
            
            <a href="/" style={styles.backLink}>← Send a tip</a>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: '#0a0a0a',
  },
  card: {
    backgroundColor: '#1a1a1b',
    borderRadius: '16px',
    padding: '24px',
    width: '100%',
    maxWidth: '400px',
    border: '1px solid #333',
  },
  title: {
    color: '#fff',
    fontSize: '22px',
    fontWeight: '600',
    marginBottom: '4px',
    textAlign: 'center',
  },
  subtitle: {
    color: '#666',
    fontSize: '12px',
    textAlign: 'center',
    marginBottom: '20px',
  },
  totalBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2a2a2b',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
  },
  totalLabel: {
    color: '#888',
    fontSize: '14px',
  },
  totalValue: {
    color: '#00d4aa',
    fontSize: '24px',
    fontWeight: '700',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: '#2a2a2b',
    borderRadius: '8px',
    padding: '12px',
  },
  rank: {
    color: '#ffd700',
    fontSize: '16px',
    fontWeight: '700',
    width: '30px',
  },
  agentInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  agentName: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: '500',
  },
  platform: {
    color: '#666',
    fontSize: '11px',
    textTransform: 'uppercase',
  },
  amounts: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
  },
  tipCount: {
    color: '#888',
    fontSize: '11px',
  },
  amount: {
    color: '#00d4aa',
    fontSize: '14px',
    fontWeight: '600',
  },
  empty: {
    color: '#666',
    textAlign: 'center',
    padding: '40px 20px',
    fontSize: '14px',
  },
  loading: {
    color: '#888',
    textAlign: 'center',
    padding: '40px',
  },
  backLink: {
    display: 'block',
    color: '#00d4aa',
    textAlign: 'center',
    fontSize: '14px',
    textDecoration: 'none',
  },
}
