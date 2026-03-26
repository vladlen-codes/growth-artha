import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

interface MarketOverview {
  nifty50?: {
    last: number
    change_pct: number
    advances?: number
    declines?: number
    volume?: number
  }
}

export default function MarketBar() {
  const { data } = useQuery<MarketOverview>({
    queryKey: ['market-overview'],
    queryFn:  () => api.get('/stocks/market/overview').then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 25_000,
  })

  const nifty = data?.nifty50
  if (!nifty) return null

  const isUp = (nifty.change_pct ?? 0) >= 0

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '6px 0',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-6 text-[12px]">
        {/* Nifty 50 price */}
        <div className="flex items-center gap-2.5">
          <span
            className="font-bold text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded"
            style={{ background: 'var(--gray-100)', color: 'var(--gray-500)' }}
          >
            NIFTY
          </span>
          <span
            className="font-bold tabular-nums text-[13px]"
            style={{ color: 'var(--gray-900)' }}
          >
            {nifty.last?.toLocaleString('en-IN')}
          </span>
          <span
            className="font-semibold tabular-nums text-[12px] px-1.5 py-0.5 rounded-md"
            style={{
              background: isUp ? 'var(--brand-light)' : 'var(--red-light)',
              color: isUp ? 'var(--brand-dark)' : 'var(--red-dark)',
            }}
          >
            {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{nifty.change_pct}%
          </span>
        </div>

        {/* Advances / Declines */}
        {(nifty.advances != null || nifty.declines != null) && (
          <div className="flex items-center gap-3" style={{ color: 'var(--gray-400)' }}>
            <span style={{ color: 'var(--brand-green)', fontWeight: 600 }}>
              ↑ {nifty.advances} adv
            </span>
            <span style={{ color: 'var(--red)', fontWeight: 600 }}>
              ↓ {nifty.declines} dec
            </span>
          </div>
        )}

        {/* Live indicator */}
        <div className="ml-auto flex items-center gap-1.5" style={{ color: 'var(--gray-400)' }}>
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: 'var(--brand-green)' }}
          />
          Live · 30s
        </div>
      </div>
    </div>
  )
}
