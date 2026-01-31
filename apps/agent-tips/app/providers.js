'use client'

import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import '@rainbow-me/rainbowkit/styles.css'

// Define Flare chain
const flare = {
  id: 14,
  name: 'Flare',
  iconUrl: 'https://s2.coinmarketcap.com/static/img/coins/64x64/7950.png',
  nativeCurrency: { name: 'Flare', symbol: 'FLR', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://flare-api.flare.network/ext/C/rpc'] },
    public: { http: ['https://flare-api.flare.network/ext/C/rpc'] },
  },
  blockExplorers: {
    default: { name: 'FlareScan', url: 'https://flarescan.com' },
  },
}

// Define HyperEVM chain
const hyperevm = {
  id: 999,
  name: 'HyperEVM',
  iconUrl: 'https://hyperliquid.xyz/favicon.ico',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.hyperliquid.xyz/evm'] },
    public: { http: ['https://rpc.hyperliquid.xyz/evm'] },
  },
  blockExplorers: {
    default: { name: 'Purrsec', url: 'https://purrsec.com' },
  },
}

const config = getDefaultConfig({
  appName: 'Agent Tips',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_ID || 'agent-tips-demo',
  chains: [flare, hyperevm],
  ssr: true,
})

const queryClient = new QueryClient()

export function Providers({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          theme={darkTheme({
            accentColor: '#00d4aa',
            accentColorForeground: 'black',
            borderRadius: 'medium',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
