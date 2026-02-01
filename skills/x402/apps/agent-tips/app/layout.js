import { Providers } from './providers'

export const metadata = {
  title: 'Agent Tips | m/payments',
  description: 'Share fees with your favorite AI agents',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#0a0a0a', minHeight: '100vh' }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
