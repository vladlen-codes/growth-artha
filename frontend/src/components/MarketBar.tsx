import { useQuery } from '@tanstack/react-query'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowTrendUp, faArrowTrendDown } from '@fortawesome/free-solid-svg-icons'
import api from '../api/client'

interface GainerLoser {
  symbol: string
  pChange: number
}

interface MarketOverview {
  nifty50?: {
    last: number
    change_pct: number
    advances?: number
    declines?: number
  }
  gainers?: GainerLoser[]
  losers?: GainerLoser[]
}

export default function MarketBar() {
  const { data } = useQuery<MarketOverview>({
    queryKey: ['market-overview'],
    queryFn:  () => api.get('/stocks/market/overview').then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 25_000,
  })

  const nifty   = data?.nifty50
  const gainers = data?.gainers?.slice(0, 3) || []
  const losers  = data?.losers?.slice(0, 3)  || []

  if (!nifty) return null

  const isUp = (nifty.change_pct ?? 0) >= 0

  return (
    <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '5px 0' }}>
      <div
        className="max-w-6xl mx-auto px-4 sm:px-6"
        style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', scrollbarWidth: 'none' }}
      >
        {/* Nifty 50 index */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            paddingRight: 16, marginRight: 16,
            borderRight: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '2px 6px', borderRadius: 4,
              background: 'var(--gray-100)', color: 'var(--gray-500)',
            }}
          >
            NIFTY 50
          </span>
          <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--gray-900)', tabularNums: true } as any}>
            {nifty.last?.toLocaleString('en-IN')}
          </span>
          <span
            style={{
              fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 6,
              background: isUp ? 'var(--brand-light)' : 'var(--red-light)',
              color: isUp ? 'var(--brand-dark)' : 'var(--red-dark)',
            }}
          >
            {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{nifty.change_pct}%
          </span>
          {(nifty.advances != null || nifty.declines != null) && (
            <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
              <span style={{ color: 'var(--brand-green)', fontWeight: 600 }}>{nifty.advances}↑</span>
              {' '}<span style={{ color: 'var(--red)', fontWeight: 600 }}>{nifty.declines}↓</span>
            </span>
          )}
        </div>

        {/* Gainers */}
        {gainers.length > 0 && (
          <>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand-green)', marginRight: 10, flexShrink: 0, letterSpacing: '0.06em' }}>
              <FontAwesomeIcon icon={faArrowTrendUp} style={{ marginRight: 4 }} />
              TOP
            </span>
            {gainers.map(g => (
              <TickerChip
                key={g.symbol}
                symbol={g.symbol}
                change={g.pChange}
                positive={true}
              />
            ))}
          </>
        )}

        {/* Divider */}
        {gainers.length > 0 && losers.length > 0 && (
          <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 12px', flexShrink: 0 }} />
        )}

        {/* Losers */}
        {losers.length > 0 && (
          <>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', marginRight: 10, flexShrink: 0, letterSpacing: '0.06em' }}>
              <FontAwesomeIcon icon={faArrowTrendDown} style={{ marginRight: 4 }} />
              WORST
            </span>
            {losers.map(g => (
              <TickerChip
                key={g.symbol}
                symbol={g.symbol}
                change={g.pChange}
                positive={false}
              />
            ))}
          </>
        )}

        {/* Live dot */}
        <div
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            color: 'var(--gray-400)', fontSize: 11,
          }}
        >
          <span
            style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-green)', display: 'inline-block' }}
            className="animate-pulse"
          />
          Live · 30s
        </div>
      </div>
    </div>
  )
}

function TickerChip({ symbol, change, positive }: { symbol: string; change: number; positive: boolean }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '2px 8px', borderRadius: 6, marginRight: 8, flexShrink: 0,
        background: positive ? 'rgba(22,201,123,0.06)' : 'rgba(240,68,56,0.06)',
        border: `1px solid ${positive ? 'rgba(22,201,123,0.15)' : 'rgba(240,68,56,0.15)'}`,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-700)' }}>{symbol}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: positive ? 'var(--brand-green)' : 'var(--red)' }}>
        {positive ? '+' : ''}{typeof change === 'number' ? change.toFixed(1) : change}%
      </span>
    </div>
  )
}
