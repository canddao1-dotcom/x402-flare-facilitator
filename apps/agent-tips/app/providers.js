'use client'

import { useState, useEffect } from 'react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'

const queryClient = new QueryClient()

// Lazy-load wallet components only on client
function WalletWrapper({ children }) {
  const [WalletProviders, setWalletProviders] = useState(null)
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
    // Dynamically import wallet stuff only on client
    Promise.all([
      import('@rainbow-me/rainbowkit'),
      import('wagmi'),
      import('@rainbow-me/rainbowkit/styles.css')
    ]).then(([rainbowkit, wagmi]) => {
      const { getDefaultConfig, RainbowKitProvider, darkTheme } = rainbowkit
      const { WagmiProvider } = wagmi
      
      const flare = {
        id: 14,
        name: 'Flare',
        nativeCurrency: { name: 'Flare', symbol: 'FLR', decimals: 18 },
        rpcUrls: {
          default: { http: ['https://flare-api.flare.network/ext/C/rpc'] },
        },
        blockExplorers: {
          default: { name: 'FlareScan', url: 'https://flarescan.com' },
        },
      }
      
      const hyperevm = {
        id: 999,
        name: 'HyperEVM',
        nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
        rpcUrls: {
          default: { http: ['https://rpc.hyperliquid.xyz/evm'] },
        },
        blockExplorers: {
          default: { name: 'Purrsec', url: 'https://purrsec.com' },
        },
      }
      
      const config = getDefaultConfig({
        appName: 'Agent Tips',
        projectId: '21fef48091f12692cad574a6f7753643',
        chains: [flare, hyperevm],
        ssr: false,
      })
      
      // Create the wrapper component
      setWalletProviders(() => ({ children }) => (
        <WagmiProvider config={config}>
          <RainbowKitProvider theme={darkTheme({ accentColor: '#00d4aa', accentColorForeground: 'black', borderRadius: 'medium' })}>
            {children}
          </RainbowKitProvider>
        </WagmiProvider>
      ))
    }).catch(err => {
      console.error('Failed to load wallet providers:', err)
    })
  }, [])
  
  if (!mounted || !WalletProviders) {
    return children
  }
  
  return <WalletProviders>{children}</WalletProviders>
}

export function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletWrapper>{children}</WalletWrapper>
    </QueryClientProvider>
  )
}
