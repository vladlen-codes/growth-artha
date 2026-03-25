import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import StockDetail from './pages/StockDetail'
import MarketBar from './components/MarketBar'
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
      <MarketBar />
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
    <header className="bg-white border-b border-[#EAECEF] sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 h-[52px] flex items-center justify-between">
        <button onClick={onLogoClick} className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#1D9E75] rounded-[7px] flex items-center
                          justify-center text-white font-bold text-[13px]
                          tracking-tight">
            GA
          </div>
          <span className="font-semibold text-[14px] text-gray-900 tracking-tight">
            Growth Artha
          </span>
          <span className="text-[12px] text-gray-400 hidden sm:block">
            — AI signals for Indian investors
          </span>
        </button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px]
                          font-semibold text-[#1D9E75]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#1D9E75]
                            animate-pulse" />
            NSE live
          </div>
          {/* REMOVE the 15-min delayed badge entirely */}
        </div>
      </div>
    </header>
  )
}