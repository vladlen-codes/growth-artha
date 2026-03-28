import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getStockInfo, explainSignal } from '../api/enpoints'
import { useLivePrice } from '../hooks/useLivePrice'
import CandlestickChart from '../components/CandlestickChart'
import SentimentCard from '../components/SentimentCard'
import SignalExplainer from '../components/SignalExplainer'
import { useRadarStore } from '../store/radarStore'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowLeft, faChartLine, faBroadcastTower, faNewspaper,
  faCircleUp, faCircleDown, faArrowTrendUp, faArrowTrendDown,
  faScaleBalanced, faLayerGroup,
} from '@fortawesome/free-solid-svg-icons'

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

  const variant: 'act' | 'watch' | 'exit' | null =
    result?.act?.find((s: any) => s.symbol === symbol) ? 'act' :
    result?.watch?.find((s: any) => s.symbol === symbol) ? 'watch' :
    result?.exit_radar?.find((s: any) => s.symbol === symbol) ? 'exit' : null

  const variantColor = variant === 'act' ? '#16C97B'
    : variant === 'watch' ? '#D97706'
    : variant === 'exit' ? '#F04438'
    : 'var(--gray-500)'

  const { data: info } = useQuery({
    queryKey: ['stock-info', symbol],
    queryFn:  () => getStockInfo(symbol).then(r => r.data),
    staleTime: 1000 * 60 * 30,
  })

  const { data: explanation, isLoading: explainLoading } = useQuery({
    queryKey: ['explain', symbol],
    queryFn:  () => explainSignal(symbol).then(r => r.data),
    enabled:  !!signal,
  })

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'chart',   label: 'Chart',    icon: faChartLine    },
    { id: 'signals', label: 'Signals',  icon: faBroadcastTower },
    { id: 'news',    label: 'News',     icon: faNewspaper    },
  ]

  const isPositive = (changePct ?? 0) >= 0

  return (
    <div className="space-y-4">

      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
          color: 'var(--gray-500)', fontSize: 13, fontWeight: 500,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--gray-900)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--gray-500)')}
      >
        <FontAwesomeIcon icon={faArrowLeft} style={{ fontSize: 11 }} />
        Back to Radar
      </button>

      {/* Stock header */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '20px 24px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          {/* Left: name + sector */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--gray-900)', margin: 0 }}>
                {symbol}
              </h1>
              {signal?.portfolio_tag === 'holding' && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99,
                  background: 'var(--brand-light)', color: 'var(--brand-deep)',
                  border: '1px solid var(--brand-border)', letterSpacing: '0.06em',
                }}>
                  YOUR HOLDING
                </span>
              )}
              {variant && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                  background: variant === 'act' ? '#EDFAF4' : variant === 'watch' ? '#FFFBEB' : '#FEF3F2',
                  color: variantColor,
                  border: `1px solid ${variant === 'act' ? '#A3F0CB' : variant === 'watch' ? '#FDE68A' : '#FECDCA'}`,
                  letterSpacing: '0.06em',
                }}>
                  {variant === 'act' ? 'ACT' : variant === 'watch' ? 'WATCH' : 'EXIT RADAR'}
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: 0 }}>
              {info?.name || symbol}
              {info?.sector && ` · ${info.sector}`}
              {info?.industry && ` · ${info.industry}`}
            </p>
          </div>

          {/* Right: live price */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--gray-900)', letterSpacing: '-0.02em' }}>
              {price ? `₹${price.toLocaleString('en-IN')}` : '—'}
            </div>
            {changePct !== null && (
              <div style={{
                fontSize: 13, fontWeight: 600, marginTop: 2,
                color: isPositive ? 'var(--brand-green)' : 'var(--red)',
                display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end',
              }}>
                <FontAwesomeIcon icon={isPositive ? faArrowTrendUp : faArrowTrendDown} style={{ fontSize: 11 }} />
                {isPositive ? '+' : ''}{changePct}%
              </div>
            )}
            {updatedAt && (
              <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 2 }}>
                Updated {formatAge(updatedAt)}
              </div>
            )}
          </div>
        </div>

        {/* Fundamentals grid */}
        {info && (info.pe_ratio || info.market_cap || info.week52_high) && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
            marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)',
          }}>
            {[
              { label: 'P/E Ratio',   value: info.pe_ratio ? info.pe_ratio.toFixed(1) : '—' },
              { label: 'P/B Ratio',   value: info.pb_ratio ? info.pb_ratio.toFixed(2) : '—' },
              { label: '52W High',    value: info.week52_high ? `₹${info.week52_high.toLocaleString('en-IN')}` : '—' },
              { label: '52W Low',     value: info.week52_low  ? `₹${info.week52_low.toLocaleString('en-IN')}`  : '—' },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                  {f.label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-800)' }}>{f.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Score + signal summary row */}
        {signal && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <FontAwesomeIcon icon={faScaleBalanced} style={{ fontSize: 11, color: variantColor }} />
              <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Score</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: variantColor }}>
                {signal.score > 0 ? '+' : ''}{signal.score}
              </span>
            </div>
            <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <FontAwesomeIcon icon={faLayerGroup} style={{ fontSize: 11, color: 'var(--gray-400)' }} />
              <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                {signal.signal_count} signal{signal.signal_count !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginLeft: 4 }}>
              {signal.tags?.slice(0, 5).map((tag: string) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 10, fontWeight: 600,
                    padding: '2px 8px', borderRadius: 99,
                    background: 'var(--gray-100)', color: 'var(--gray-600)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? variantColor : 'var(--gray-500)',
                background: tab === t.id ? (
                  variant === 'act' ? 'rgba(22,201,123,0.05)' :
                  variant === 'watch' ? 'rgba(217,119,6,0.05)' :
                  variant === 'exit' ? 'rgba(240,68,56,0.05)' : 'transparent'
                ) : 'transparent',
                border: 'none',
                borderBottom: tab === t.id ? `2px solid ${variantColor}` : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <FontAwesomeIcon icon={t.icon} style={{ fontSize: 12, opacity: 0.8 }} />
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {tab === 'chart' && (
            <CandlestickChart symbol={symbol} patterns={signal?.patterns || []} />
          )}
          {tab === 'signals' && (
            <SignalBreakdown
              signal={signal}
              explanation={explanation?.explanation}
              explainLoading={explainLoading}
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

// ── Signal Breakdown Panel ───────────────────────────────────────────────────

function SignalBreakdown({ signal, explanation, explainLoading }: {
  signal: any
  explanation?: string
  explainLoading: boolean
}) {
  if (!signal) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--gray-400)' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
        <p style={{ fontSize: 13 }}>No signal data yet — run a Radar scan first</p>
      </div>
    )
  }

  const allSignals: any[] = signal.signals || []
  const positive = allSignals.filter((s: any) => s.weight >= 0)
  const negative = allSignals.filter((s: any) => s.weight < 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* AI card at the top */}
      {(signal.ai_card || explanation || explainLoading) && (
        <div style={{
          background: 'linear-gradient(135deg, #0D1F17 0%, #0A2E1E 100%)',
          borderRadius: 12, padding: '16px 20px',
          border: '1px solid rgba(22,201,123,0.2)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#16C97B', letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>
            AI Insight
          </div>
          {explainLoading ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Generating insight…</div>
          ) : (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, margin: 0 }}>
              {explanation || signal.ai_card}
            </p>
          )}
        </div>
      )}

      {/* Score composition */}
      <div>
        <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Score Composition
        </h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Base Score',  value: signal.base_score,         color: '#1849A9', bg: '#EFF8FF' },
            { label: 'Convergence', value: `+${signal.convergence_bonus}`, color: '#6941C6', bg: '#F9F5FF' },
            { label: 'Portfolio ×', value: signal.portfolio_tag === 'holding' ? '1.4×' : signal.portfolio_tag === 'sector' ? '1.2×' : '1.0×', color: '#D97706', bg: '#FFFBEB' },
            { label: 'Final Score', value: (signal.score > 0 ? '+' : '') + signal.score, color: '#16C97B', bg: '#EDFAF4', bold: true },
          ].map(s => (
            <div key={s.label} style={{
              background: s.bg, border: `1px solid ${s.color}22`,
              borderRadius: 10, padding: '10px 14px', minWidth: 90, flex: '1 1 80px',
            }}>
              <div style={{ fontSize: 10, color: s.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: s.bold ? 800 : 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Positive signals */}
      {positive.length > 0 && (
        <div>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Bullish Signals ({positive.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {positive.map((s: any, i: number) => (
              <SignalRow key={i} signal={s} isPositive={true} />
            ))}
          </div>
        </div>
      )}

      {/* Negative signals */}
      {negative.length > 0 && (
        <div>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Risk Signals ({negative.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {negative.map((s: any, i: number) => (
              <SignalRow key={i} signal={s} isPositive={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SignalRow({ signal, isPositive }: { signal: any; isPositive: boolean }) {
  const color = isPositive ? '#16C97B' : '#F04438'
  const bg    = isPositive ? '#EDFAF4' : '#FEF3F2'

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '10px 14px', borderRadius: 10,
      background: 'var(--gray-50)', border: '1px solid var(--border)',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, fontSize: 13,
      }}>
        <FontAwesomeIcon icon={isPositive ? faCircleUp : faCircleDown} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-800)' }}>
            {signal.name?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0 }}>
            {signal.weight > 0 ? '+' : ''}{signal.weight.toFixed(2)}
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--gray-500)', margin: '3px 0 0', lineHeight: 1.4 }}>
          {signal.evidence}
        </p>
        {signal.source && (
          <span style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 2, display: 'inline-block' }}>
            Source: {signal.source}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Utilities ────────────────────────────────────────────────────────────────

function formatAge(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}