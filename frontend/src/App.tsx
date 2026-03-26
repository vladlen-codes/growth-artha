import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import StockDetail from './pages/StockDetail'
import MarketBar from './components/MarketBar'
import { prewarmDemoStocks } from './api/enpoints'
import './App.css'

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
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <Header onLogoClick={() => navigate({ name: 'dashboard' })} />
      <MarketBar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
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
    <header
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={onLogoClick}
          className="flex items-center gap-2.5 group"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div
            className="flex items-center justify-center text-white font-bold text-[13px] tracking-tight"
            style={{
              width: 30,
              height: 30,
              background: 'linear-gradient(135deg, var(--brand-green) 0%, var(--brand-dark) 100%)',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(22, 201, 123, 0.35)',
            }}
          >
            GA
          </div>
          <div className="flex flex-col leading-none">
            <span
              className="font-bold text-[14px] tracking-tight"
              style={{ color: 'var(--gray-900)' }}
            >
              Growth Artha
            </span>
            <span
              className="text-[11px] hidden sm:block"
              style={{ color: 'var(--gray-400)' }}
            >
              AI signals for Indian investors
            </span>
          </div>
        </button>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <div
            className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{
              background: 'var(--brand-light)',
              color: 'var(--brand-dark)',
              border: '1px solid var(--brand-border)',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: 'var(--brand-green)' }}
            />
            NSE Live
          </div>

          {/* Docs link */}
          <a
            href="https://www.nseindia.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{
              color: 'var(--gray-600)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              textDecoration: 'none',
            }}
          >
            NSE →
          </a>
        </div>
      </div>
    </header>
  )
}