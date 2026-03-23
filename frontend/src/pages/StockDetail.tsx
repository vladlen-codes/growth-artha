import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getStockInfo, explainSignal } from '../api/enpoints'
import { useLivePrice } from '../hooks/useLivePrice'
import CandlestickChart from '../components/CandlestickChart'
import SentimentCard from '../components/SentimentCard'
import SignalExplainer from '../components/SignalExplainer'
import { useRadarStore } from '../store/radarStore'

interface Props {
  symbol: string
  onBack: () => void
}

type Tab = 'chart' | 'signals' | 'news'

export default function StockDetail({ symbol, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('chart')
  const { result } = useRadarStore()
  const { price, changePct, updatedAt } = useLivePrice(symbol)

  // Find this stock's signal from radar result
  const signal = [
    ...(result?.act        || []),
    ...(result?.watch      || []),
    ...(result?.exit_radar || []),
  ].find(s => s.symbol === symbol)

  const { data: info } = useQuery({
    queryKey: ['stock-info', symbol],
    queryFn:  () => getStockInfo(symbol).then(r => r.data),
    staleTime: 1000 * 60 * 30,
  })

  const { data: explanation, isLoading: explainLoading } = useQuery({
    queryKey: ['explain', symbol],
    queryFn:  () => explainSignal(symbol).then(r => r.data),
    enabled:  !!signal,   // only fetch if this stock has a signal
  })

  const TABS: { id: Tab; label: string }[] = [
    { id: 'chart',   label: 'Chart & Patterns' },
    { id: 'signals', label: 'Signal Breakdown' },
    { id: 'news',    label: 'News Sentiment'   },
  ]

  return (
    <div className="space-y-4">

      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500
                   hover:text-gray-800 transition-colors"
      >
        ← Back to Radar
      </button>

      {/* Stock header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-semibold text-gray-900">{symbol}</h1>
              {signal?.portfolio_tag === 'holding' && (
                <span className="text-xs font-medium bg-brand-light
                                 text-brand-dark px-2 py-0.5 rounded-full">
                  In your portfolio
                </span>
              )}
              {signal && <ScoreBadge score={signal.score} />}
            </div>
            <p className="text-sm text-gray-500">
              {info?.name || symbol} · {info?.sector || 'NSE'}
            </p>
          </div>

          {/* Live price */}
          <div className="text-right">
            <div className="text-2xl font-semibold text-gray-900">
              {price ? `₹${price.toLocaleString('en-IN')}` : '—'}
            </div>
            {changePct !== null && (
              <div className={`text-sm font-medium
                ${changePct >= 0 ? 'text-brand-green' : 'text-red-500'}`}>
                {changePct >= 0 ? '+' : ''}{changePct}%
              </div>
            )}
            {updatedAt && (
              <div className="text-[11px] text-gray-400 mt-0.5">
                Updated {formatAge(updatedAt)}
              </div>
            )}
          </div>
        </div>

        {/* Fundamentals row */}
        {info && (
          <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
            {[
              { label: 'P/E Ratio',    value: info.pe_ratio?.toFixed(1) ?? '—' },
              { label: 'Market Cap',   value: formatMarketCap(info.market_cap)  },
              { label: '52W High',     value: info.week52_high ? `₹${info.week52_high.toLocaleString('en-IN')}` : '—' },
              { label: '52W Low',      value: info.week52_low  ? `₹${info.week52_low.toLocaleString('en-IN')}`  : '—' },
            ].map(f => (
              <div key={f.label}>
                <div className="text-xs text-gray-400">{f.label}</div>
                <div className="text-sm font-medium text-gray-800 mt-0.5">{f.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Signal tags row */}
      {signal && (
        <div className="flex flex-wrap gap-2">
          {signal.tags.map((tag: string) => (
            <span key={tag}
                  className="text-xs font-medium bg-white border border-gray-200
                             text-gray-600 px-3 py-1 rounded-full">
              {tag}
            </span>
          ))}
          <span className="text-xs text-gray-400 py-1 ml-1">
            {signal.signal_count} signals · convergence score {signal.score > 0 ? '+' : ''}{signal.score}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 text-sm font-medium transition-colors
                ${tab === t.id
                  ? 'text-brand-green border-b-2 border-brand-green bg-brand-light/30'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'chart' && (
            <CandlestickChart
              symbol={symbol}
              patterns={signal?.patterns || []}
            />
          )}
          {tab === 'signals' && (
            <SignalExplainer
              signal={signal}
              explanation={explanation?.explanation}
              loading={explainLoading}
            />
          )}
          {tab === 'news' && (
            <SentimentCard symbol={symbol} />
          )}
        </div>
      </div>

    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const isPos = score >= 0
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full
      ${isPos
        ? 'bg-brand-light text-brand-dark'
        : 'bg-red-50 text-red-600'
      }`}>
      {isPos ? '+' : ''}{score}
    </span>
  )
}

function formatAge(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60)  return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function formatMarketCap(cap?: number): string {
  if (!cap) return '—'
  if (cap >= 1e12) return `₹${(cap / 1e12).toFixed(1)}L Cr`
  if (cap >= 1e9)  return `₹${(cap / 1e9).toFixed(1)}K Cr`
  return `₹${(cap / 1e7).toFixed(0)} Cr`
}