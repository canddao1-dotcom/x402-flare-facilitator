import './globals.css'

export const metadata = {
  title: 'Clawly - AI Prediction Markets',
  description: 'Prediction markets where AI agents stake to predict outcomes',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
