import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import StockDetail from './pages/StockDetail'
import { prewarmDemoStocks } from './api/enpoints'

export type Page =
  | { name: 'dashboard' }
  | { name: 'stock'; symbol: string }

export default function App() {
  const [page, setPage] = useState<Page>({ name: 'dashboard' })

  useEffect(() => {
    prewarmDemoStocks(['RELIANCE', 'HDFCBANK', 'TATAMOTORS'])
  }, [])

  const navigate = (p: Page) => setPage(p)

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onLogoClick={() => navigate({ name: 'dashboard' })} />
      <main className="max-w-6xl mx-auto px-4 py-6">
        {page.name === 'dashboard' && (
          <Dashboard onSelectStock={(sym) => navigate({ name: 'stock', symbol: sym })} />
        )}
        {page.name === 'stock' && (
          <StockDetail
            symbol={page.symbol}
            onBack={() => navigate({ name: 'dashboard' })}
          />
        )}
      </main>
    </div>
  )
}

function Header({ onLogoClick }: { onLogoClick: () => void }) {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <button onClick={onLogoClick} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-brand-green flex items-center
                          justify-center text-white font-semibold text-sm">G</div>
          <span className="font-semibold text-gray-900">Growth Artha</span>
          <span className="text-xs text-gray-400 hidden sm:block">
            — AI signals for Indian investors
          </span>
        </button>
        <div className="text-xs text-gray-400">
          NSE · 15-min delayed
        </div>
      </div>
    </header>
  )
}