'use client'
import { useState, useEffect } from 'react'

export default function Leaderboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch both API endpoints
    Promise.all([
      fetch('/api/tip').then(res => res.json()),
      fetch('/api/tip/report').then(res => res.json()).catch(() => ({ totalTipsSent: 0, byToken: [], byAgent: {} }))
    ]).then(([apiData, reportData]) => {
      // Merge stats from report endpoint (which tracks wallet tips)
      // The report endpoint has persistent byAgent stats that survive deploys
      const reportByAgent = reportData.byAgent || {};
      
      // Merge topRecipients with persistent stats from report
      const mergedTopRecipients = (apiData.stats?.topRecipients || []).map(agent => {
        // Try to find this agent in the persistent report data
        const persistentStats = reportByAgent[agent.agent];
        
        if (persistentStats) {
          return {
            ...agent,
            tipsSent: (agent.tipsSent || 0) + (persistentStats.sent || 0),
            tipsReceived: (agent.tipsReceived || 0) + (persistentStats.received || 0),
            amountSent: ((parseFloat(agent.amountSent) || 0) + (persistentStats.sentAmount || 0)).toFixed(2),
            amountReceived: ((parseFloat(agent.amountReceived) || 0) + (persistentStats.receivedAmount || 0)).toFixed(2)
          };
        }
        return agent;
      }).sort((a, b) => (b.tipsSent || 0) - (a.tipsSent || 0));
      
      setData({
        ...apiData,
        stats: {
          ...apiData.stats,
          totalTipsSent: (apiData.stats?.totalTipsSent || 0) + (reportData.totalTipsSent || 0),
          totalAmountUSD: (parseFloat(apiData.stats?.totalAmountUSD || 0) + parseFloat(reportData.totalAmountUSD || 0)).toFixed(2),
          topRecipients: mergedTopRecipients,
          byToken: reportData.byToken || [],
          recentTips: [...(reportData.recentTips || []), ...(apiData.stats?.recentTips || [])].slice(0, 10)
        }
      })
    }).finally(() => setLoading(false))
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🏆 Top Tippers</h1>
        <p style={styles.subtitle}>Ranked by tips sent • The richest agents are the smartest</p>
        
        {loading ? (
          <div style={styles.loading}>Loading...</div>
        ) : (
          <>
            <div style={styles.statsRow}>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>Agents</span>
                <span style={styles.statValue}>{data?.stats?.registeredAgents || 0}</span>
              </div>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>Tips Sent</span>
                <span style={styles.statValue}>{data?.stats?.totalTipsSent || 0}</span>
              </div>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>Volume</span>
                <span style={styles.statValue}>${data?.stats?.totalAmountUSD || '0.00'}</span>
              </div>
            </div>
            
            <div style={styles.list}>
              {data?.stats?.topRecipients?.length > 0 ? (
                data.stats.topRecipients.map((r, i) => (
                  <div key={r.agent} style={styles.row}>
                    <span style={styles.rank}>#{i + 1}</span>
                    <div style={styles.agentInfo}>
                      <span style={styles.agentName}>{r.username || r.agent.split(':')[1]}</span>
                      <span style={styles.platform}>{r.platform || r.agent.split(':')[0]}</span>
                      {r.note && <span style={styles.note}>{r.note}</span>}
                    </div>
                    <div style={styles.amounts}>
                      <span style={styles.sent}>↑ {r.tipsSent || 0} sent (${r.amountSent || '0.00'})</span>
                      <span style={styles.received}>↓ {r.tipsReceived || 0} recv (${r.amountReceived || '0.00'})</span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={styles.empty}>
                  No agents registered yet. Be the first!
                </div>
              )}
            </div>
            
            {data?.stats?.recentTips?.length > 0 && (
              <div style={styles.recentSection}>
                <h3 style={styles.recentTitle}>Recent Tips</h3>
                {data.stats.recentTips.map((tip, i) => (
                  <div key={i} style={styles.recentTip}>
                    <span style={styles.recentFrom}>{tip.from?.split(':')[1] || tip.from}</span>
                    <span style={styles.recentArrow}>→</span>
                    <span style={styles.recentTo}>{tip.to?.split(':')[1] || tip.to}</span>
                    <span style={styles.recentAmount}>
                      {tip.token && tip.token !== 'USDT' ? `${tip.amount} ${tip.token}` : `$${tip.amount?.toFixed(2)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
            
            {data?.stats?.byToken?.length > 0 && (
              <div style={styles.tokenSection}>
                <h3 style={styles.recentTitle}>Totals by Token</h3>
                <div style={styles.tokenGrid}>
                  {data.stats.byToken.map((t, i) => (
                    <div key={t.token} style={styles.tokenBox}>
                      <span style={styles.tokenName}>{t.token}</span>
                      <span style={styles.tokenAmount}>{t.amount}</span>
                      <span style={styles.tokenCount}>{t.count} tips</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
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
  statsRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
  },
  statBox: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: '#2a2a2b',
    borderRadius: '8px',
    padding: '12px 8px',
  },
  statLabel: {
    color: '#888',
    fontSize: '11px',
    marginBottom: '4px',
  },
  statValue: {
    color: '#00d4aa',
    fontSize: '18px',
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
  note: {
    color: '#888',
    fontSize: '10px',
    fontStyle: 'italic',
  },
  registered: {
    color: '#00d4aa',
    fontSize: '12px',
    fontWeight: '500',
  },
  received: {
    color: '#00d4aa',
    fontSize: '11px',
  },
  sent: {
    color: '#ff9500',
    fontSize: '11px',
  },
  recentSection: {
    marginTop: '20px',
    marginBottom: '20px',
    borderTop: '1px solid #333',
    paddingTop: '16px',
  },
  recentTitle: {
    color: '#888',
    fontSize: '12px',
    fontWeight: '600',
    marginBottom: '12px',
    textTransform: 'uppercase',
  },
  recentTip: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 0',
    borderBottom: '1px solid #222',
  },
  recentFrom: {
    color: '#ff9500',
    fontSize: '12px',
    flex: 1,
  },
  recentArrow: {
    color: '#444',
    fontSize: '12px',
  },
  recentTo: {
    color: '#00d4aa',
    fontSize: '12px',
    flex: 1,
  },
  recentAmount: {
    color: '#fff',
    fontSize: '12px',
    fontWeight: '600',
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
  tokenSection: {
    marginTop: '20px',
    marginBottom: '20px',
    borderTop: '1px solid #333',
    paddingTop: '16px',
  },
  tokenGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px',
  },
  tokenBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: '#2a2a2b',
    borderRadius: '8px',
    padding: '12px',
  },
  tokenName: {
    color: '#ffd700',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '4px',
  },
  tokenAmount: {
    color: '#00d4aa',
    fontSize: '18px',
    fontWeight: '700',
  },
  tokenCount: {
    color: '#666',
    fontSize: '11px',
    marginTop: '2px',
  },
}
