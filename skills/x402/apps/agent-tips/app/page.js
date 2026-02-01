'use client'
import dynamic from 'next/dynamic'

// Dynamically import the wallet-dependent component with no SSR
const AgentTipsContent = dynamic(() => import('./AgentTipsContent'), { 
  ssr: false,
  loading: () => (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#888' }}>
      Loading...
    </div>
  )
})

export default function AgentTips() {
  return <AgentTipsContent />
}
