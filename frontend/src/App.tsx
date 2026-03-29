import { useState, useEffect, Component, Suspense, lazy } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import MarketBar from './components/MarketBar'
import { prewarmDemoStocks } from './api/enpoints'
import gaLogo from './assets/GA-logo.png'
import './App.css'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const StockDetail = lazy(() => import('./pages/StockDetail'))
const VideoStudio = lazy(() => import('./pages/VideoStudio'))

export type Page =
  | { name: 'dashboard' }
  | { name: 'video' }
  | { name: 'stock'; symbol: string }

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
  message: string
}

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, message: '' }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App render crashed:', error, info)
    this.setState({ message: error?.message || 'Unknown error' })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--page-bg)',
          padding: 24,
        }}
      >
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '22px 20px',
            width: '100%',
            maxWidth: 460,
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 14 }}>
            The page crashed while rendering. Reload to recover.
          </div>
          {this.state.message && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--red-dark)',
                background: 'var(--red-light)',
                border: '1px solid var(--red-border)',
                borderRadius: 8,
                padding: '8px 10px',
                marginBottom: 12,
                wordBreak: 'break-word',
              }}
            >
              {this.state.message}
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              border: 'none',
              borderRadius: 8,
              background: 'var(--brand-green)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              padding: '9px 14px',
              cursor: 'pointer',
            }}
          >
            Reload app
          </button>
        </div>
      </div>
    )
  }
}

export default function App() {
  const [page, setPage] = useState<Page>({ name: 'dashboard' })

  useEffect(() => {
    prewarmDemoStocks(['RELIANCE', 'HDFCBANK', 'TATAMOTORS'])
  }, [])

  const navigate = (p: Page) => setPage(p)

  return (
    <AppErrorBoundary>
      <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
        <Header onLogoClick={() => navigate({ name: 'dashboard' })} />
        <MarketBar />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <Suspense fallback={<PageLoader />}>
            {page.name === 'dashboard' && (
              <Dashboard
                onSelectStock={(sym) => navigate({ name: 'stock', symbol: sym })}
                onOpenVideoStudio={() => navigate({ name: 'video' })}
              />
            )}
            {page.name === 'stock' && (
              <StockDetail
                symbol={page.symbol}
                onBack={() => navigate({ name: 'dashboard' })}
              />
            )}
            {page.name === 'video' && (
              <VideoStudio onBack={() => navigate({ name: 'dashboard' })} />
            )}
          </Suspense>
        </main>
      </div>
    </AppErrorBoundary>
  )
}

function PageLoader() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-card)',
        padding: '18px 16px',
        color: 'var(--gray-600)',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      Loading page...
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
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              overflow: 'hidden',
              boxShadow: '0 3px 10px rgba(16, 128, 74, 0.24)',
            }}
          >
            <img
              src={gaLogo}
              alt="Growth Artha logo"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
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