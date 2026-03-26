import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBolt, faSatelliteDish, faRobot, faMagnifyingGlassChart,
  faChartLine, faNewspaper, faDatabase, faChartBar, faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { useRadarStore } from '../store/radarStore'
import { usePortfolioStore } from '../store/portfolioStore'
import { useNotifications } from '../hooks/useNotifications'
import { runRadar, getRadarStatus, getLatestSignals } from '../api/enpoints'
import PortfolioInput from '../components/PortfolioInput'
import RadarBucket from '../components/RadarBucket'
import RunRadarButton from '../components/RunRadarButton'
import StatsBar from '../components/StatsBar'
import AuditTrail from '../components/AuditTrail'

interface Props {
  onSelectStock: (symbol: string) => void
}

export default function Dashboard({ onSelectStock }: Props) {
  const { status, result, error, jobId, setJob, setStatus, setResult, setError } = useRadarStore()
  const { getSymbols } = usePortfolioStore()
  const { onRadarComplete } = useNotifications()
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null)
  const [showCachedBanner, setShowCachedBanner] = useState(false)
  const [universe, setUniverse] = useState<string>('nifty50')

  const tryLoadCachedResult = async () => {
    try {
      const latest = await getLatestSignals()
      const cached = latest.data
      const hasRadarShape = cached
        && Array.isArray(cached.act)
        && Array.isArray(cached.watch)
        && Array.isArray(cached.exit_radar)
      const hasMeaningfulCachedData = hasRadarShape && (
        (cached.total_scanned ?? 0) > 0
        || (cached.total_signals ?? 0) > 0
        || cached.act.length > 0
        || cached.watch.length > 0
        || cached.exit_radar.length > 0
      )
      if (hasMeaningfulCachedData) {
        setResult(cached)
        setShowCachedBanner(true)
        return true
      }
    } catch { /* ignore */ }
    return false
  }

  useEffect(() => {
    if (!jobId || status === 'done' || status === 'error') {
      if (pollInterval) clearInterval(pollInterval)
      return
    }
    const interval = setInterval(async () => {
      try {
        const res = await getRadarStatus(jobId)
        const job = res.data
        if (job.status === 'done') {
          setResult(job.result)
          setShowCachedBanner(false)
          onRadarComplete(job.result)
          clearInterval(interval)
        } else if (job.status === 'error') {
          const hasCached = await tryLoadCachedResult()
          if (!hasCached) setError(job.error || 'Scan failed')
          clearInterval(interval)
        } else {
          setStatus(job.status)
        }
      } catch {
        const hasCached = await tryLoadCachedResult()
        if (!hasCached) setError('Could not reach server')
        clearInterval(interval)
      }
    }, 2000)
    setPollInterval(interval)
    return () => clearInterval(interval)
  }, [jobId])

  const handleRunRadar = async () => {
    try {
      setShowCachedBanner(false)
      const portfolio = getSymbols()
      const res = await runRadar(portfolio, universe)
      setJob(res.data.job_id)
    } catch {
      setError('Failed to start scan — is the backend running?')
    }
  }

  return (
    <div className="space-y-5">

      {/* ── Hero header (idle only) ── */}
      {status === 'idle' && <HeroBanner onRunRadar={handleRunRadar} />}

      {/* ── Portfolio + Run Radar toolbar ── */}
      <div
        className="animate-fade-in-up"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '20px 24px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-end gap-5">
          <div className="flex-1">
            <p
              className="text-[11px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: 'var(--gray-400)' }}
            >
              Your Portfolio
            </p>
            <PortfolioInput />
          </div>
          <div className="flex-shrink-0">
            <RunRadarButton
              status={status}
              universe={universe}
              onUniverseChange={setUniverse}
              onClick={handleRunRadar}
            />
          </div>
        </div>
      </div>

      {/* ── Stats bar ── */}
      {result && (
        <div className="animate-fade-in-up stagger-1">
          <StatsBar
            totalScanned={result.total_scanned}
            liquidStocks={(result as any).liquid_stocks}
            analysedStocks={(result as any).analysed_stocks}
            totalSignals={result.total_signals}
            actCount={result.act.length}
            watchCount={result.watch.length}
            exitCount={result.exit_radar.length}
          />
        </div>
      )}

      {/* ── Scanning state ── */}
      {(status === 'pending' || status === 'running') && (
        <ScanningState universe={universe} />
      )}

      {/* ── Error state ── */}
      {status === 'error' && (
        <ErrorState onRetry={handleRunRadar} errorMessage={error} />
      )}

      {/* ── Results ── */}
      {status === 'done' && result && (
        <div className="space-y-4">
          {showCachedBanner && <CachedDataBanner />}
          <RadarBucket title="Act" subtitle="Strong convergent signals — review today" signals={result.act} variant="act" onSelect={onSelectStock} />
          <RadarBucket title="Watch" subtitle="Signals forming — not yet confirmed" signals={result.watch} variant="watch" onSelect={onSelectStock} />
          <RadarBucket title="Exit Radar" subtitle="Deteriorating signals — especially on your holdings" signals={result.exit_radar} variant="exit" onSelect={onSelectStock} />
        </div>
      )}

      {/* ── Audit trail ── */}
      {status === 'done' && jobId && <AuditTrail jobId={jobId} />}

      {/* ── Feature showcase (idle only, below portfolio card) ── */}
      {status === 'idle' && <FeatureShowcase />}

    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero Banner
// ─────────────────────────────────────────────────────────────────────────────
function HeroBanner({ onRunRadar }: { onRunRadar: () => void }) {
  const [tick, setTick] = useState(0)

  // Animated ticker — fake live prices for demo visual (real prices load via backend)
  const TICKER_STOCKS = [
    { sym: 'RELIANCE', base: 2941, chg: +1.24, color: '#16C97B' },
    { sym: 'TCS',      base: 3487, chg: +0.85, color: '#16C97B' },
    { sym: 'HDFCBANK', base: 1752, chg: -0.32, color: '#F04438' },
    { sym: 'INFY',     base: 1543, chg: +1.07, color: '#16C97B' },
    { sym: 'ICICIBANK',base: 1295, chg: +0.67, color: '#16C97B' },
    { sym: 'BAJFINANCE',base: 6821, chg: -0.41, color: '#F04438' },
    { sym: 'WIPRO',    base: 292,  chg: +0.93, color: '#16C97B' },
    { sym: 'TITAN',    base: 3395, chg: -0.18, color: '#F04438' },
  ]

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 2000)
    return () => clearInterval(t)
  }, [])

  return (
    <div
      className="animate-fade-in-up overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0D1F17 0%, #0A2E1E 50%, #081B12 100%)',
        borderRadius: 20,
        padding: '0',
        boxShadow: '0 8px 40px rgba(22,201,123,0.15), 0 2px 8px rgba(0,0,0,0.2)',
        border: '1px solid rgba(22,201,123,0.2)',
        position: 'relative',
      }}
    >
      {/* Decorative radial glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 50% at 70% 50%, rgba(22,201,123,0.08) 0%, transparent 70%)',
      }} />

      {/* Grid dot pattern */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />

      <div className="relative" style={{ padding: '40px 40px 32px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 40, alignItems: 'center' }}>

        {/* Left: headline + CTA */}
        <div>
          {/* Eyebrow */}
          <div
            className="inline-flex items-center gap-2 text-[11px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full mb-4"
            style={{
              background: 'rgba(22,201,123,0.12)',
              border: '1px solid rgba(22,201,123,0.25)',
              color: '#4ADEAA',
            }}
          >
            <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'#16C97B', animation:'pulse 2s infinite' }} />
            AI-Powered Market Intelligence · NSE
          </div>

          {/* Headline */}
          <h1
            className="font-extrabold leading-tight mb-3"
            style={{
              fontSize: 38,
              color: '#fff',
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
            }}
          >
            Your AI radar for<br />
            <span style={{
              background: 'linear-gradient(90deg, #16C97B 0%, #4ADEAA 50%, #16C97B 100%)',
              backgroundSize: '200% 100%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'shimmerText 3s linear infinite',
            }}>
              Indian markets
            </span>
          </h1>

          <p
            className="text-[14px] leading-relaxed mb-6 max-w-md"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            Three specialised AI agents scan the Nifty 50, detect chart patterns,
            score convergent signals and surface the stocks that deserve your attention — today.
          </p>

          {/* CTA row */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={onRunRadar}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '11px 24px',
                background: 'linear-gradient(135deg, #16C97B 0%, #0EA063 100%)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                boxShadow: 'none',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '0.88'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '1'
              }}
            >
              <FontAwesomeIcon icon={faBolt} /> Run Radar now
            </button>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
              Free · No signup · ~30 seconds
            </span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-6 mt-6 flex-wrap">
            {[
              { icon: faSatelliteDish, label: '50+ stocks',  sub: 'scanned per run' },
              { icon: faChartBar,      label: '9 signals',   sub: 'per stock analysed' },
              { icon: faRobot,         label: '3 AI agents', sub: 'working in sequence' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2.5">
                <FontAwesomeIcon icon={s.icon} style={{ color: '#16C97B', fontSize: 16, opacity: 0.8 }} />
                <div>
                  <div className="font-bold text-[15px]" style={{ color: '#fff' }}>{s.label}</div>
                  <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: live ticker */}
        <div
          style={{
            width: 260,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <div
            className="text-[10px] font-bold uppercase tracking-widest px-4 py-2.5 flex items-center gap-2"
            style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16C97B', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            Nifty 50 · Live
          </div>
          <div style={{ padding: '6px 0' }}>
            {TICKER_STOCKS.map((s, i) => {
              // tiny artificial price wobble for demo
              const wobble = Math.sin((tick + i * 2.3) * 0.7) * 0.03
              const price = (s.base * (1 + wobble)).toFixed(0)
              const chgDisplay = (s.chg + wobble * 10).toFixed(2)
              const isPos = parseFloat(chgDisplay) >= 0

              return (
                <div
                  key={s.sym}
                  className="flex items-center justify-between px-4 py-2"
                  style={{ borderBottom: i < TICKER_STOCKS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                >
                  <span className="font-semibold text-[12px]" style={{ color: 'rgba(255,255,255,0.8)' }}>
                    {s.sym}
                  </span>
                  <div className="text-right">
                    <div className="font-bold text-[12px]" style={{ color: '#fff' }}>
                      ₹{parseFloat(price).toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: 10, color: isPos ? '#4ADEAA' : '#FC8181', fontWeight: 600 }}>
                      {isPos ? '+' : ''}{chgDisplay}%
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Pipeline steps bar */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '16px 40px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1,
          background: 'rgba(0,0,0,0.2)',
        }}
      >
        {[
          { icon: faDatabase,             step: '01', title: 'Data Agent',   desc: 'Fetches OHLC, bulk deals & news for every stock' },
          { icon: faMagnifyingGlassChart, step: '02', title: 'Signal Agent', desc: 'Detects patterns, backtests & scores convergence' },
          { icon: faRobot,                step: '03', title: 'Insight Agent', desc: 'Generates AI alert cards & portfolio briefing' },
        ].map((p, i) => (
          <div
            key={p.step}
            className="flex items-start gap-3"
            style={{
              padding: '12px 20px',
              borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}
          >
            <div
              className="text-xl flex-shrink-0 flex items-center justify-center"
              style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(22,201,123,0.12)', color: '#16C97B', marginTop: 2 }}
            >
              <FontAwesomeIcon icon={p.icon} style={{ fontSize: 14 }} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold" style={{ color: '#16C97B', letterSpacing: '0.08em' }}>
                  {p.step}
                </span>
                <span className="font-semibold text-[12px]" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {p.title}
                </span>
              </div>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.38)', lineHeight: 1.4 }}>
                {p.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Showcase (below portfolio card when idle)
// ─────────────────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: faChartLine,
    title: 'Chart Pattern Detection',
    desc: 'Automatically identifies Double Tops, Double Bottoms, RSI Divergences, 52W breakouts and more across the full universe.',
    badge: '12+ patterns',
    color: '#16C97B',
    bg: '#EDFAF4',
    border: '#A3F0CB',
  },
  {
    icon: faBolt,
    title: 'Convergence Scoring',
    desc: 'Each stock gets a score based on how many independent signals agree. Co-occurring signals get a multiplier — the strongest picks float to the top.',
    badge: 'Multi-signal',
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
  },
  {
    icon: faRobot,
    title: 'Gemini AI Cards',
    desc: 'The Insight Agent writes a plain-English alert card for every Act and Watch stock, citing specific data points behind each signal — never generic.',
    badge: 'Gemini 2.0',
    color: '#6941C6',
    bg: '#F9F5FF',
    border: '#D6BBFB',
  },
  {
    icon: faNewspaper,
    title: 'News Sentiment',
    desc: 'Headlines are fetched and scored to surface bullish catalysts and risk flags. Every signal card gets enriched with the latest sentiment data.',
    badge: 'Real-time',
    color: '#1849A9',
    bg: '#EFF8FF',
    border: '#B2DDFF',
  },
]

function FeatureShowcase() {
  return (
    <div className="animate-fade-in-up stagger-2">
      <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="animate-fade-in-up"
            style={{
              background: 'var(--surface)',
              border: `1px solid var(--border)`,
              borderTop: `3px solid ${f.color}`,
              borderRadius: 14,
              padding: '20px',
              boxShadow: 'var(--shadow-card)',
              animationDelay: `${0.1 + i * 0.07}s`,
              transition: 'box-shadow 0.2s, transform 0.2s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'
              ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-card)'
              ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
            }}
          >
            {/* Icon + badge */}
            <div className="flex items-start justify-between mb-3">
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: f.bg,
                  border: `1px solid ${f.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: f.color, fontSize: 16,
                }}
              >
                <FontAwesomeIcon icon={f.icon} />
              </div>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: f.bg, color: f.color, border: `1px solid ${f.border}` }}
              >
                {f.badge}
              </span>
            </div>

            {/* Title */}
            <h3
              className="font-bold text-[13px] mb-1.5 leading-snug"
              style={{ color: 'var(--gray-900)' }}
            >
              {f.title}
            </h3>

            {/* Description */}
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: 'var(--gray-500)' }}
            >
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Scanning State
// ─────────────────────────────────────────────────────────────────────────────
const SCAN_STEPS = [
  { icon: faSatelliteDish,       text: 'Fetching NSE market data...' },
  { icon: faMagnifyingGlassChart, text: 'Detecting chart patterns...' },
  { icon: faChartBar,            text: 'Scoring convergent signals...' },
  { icon: faRobot,               text: 'Generating AI insights...' },
]

function ScanningState({ universe }: { universe: string }) {
  const [step, setStep] = useState(0)
  const universeLabel = universe === 'nifty50' ? 'Nifty 50' : universe === 'nifty500' ? 'Nifty 500' : 'All NSE'

  useEffect(() => {
    const t = setInterval(() => setStep(s => Math.min(s + 1, SCAN_STEPS.length - 1)), 5000)
    return () => clearInterval(t)
  }, [])

  return (
    <div
      className="animate-fade-in"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '48px 24px',
        textAlign: 'center',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        border: '3px solid var(--gray-100)', borderTopColor: 'var(--brand-green)',
        margin: '0 auto 16px',
        animation: 'spin 0.9s linear infinite',
      }} />
      <p className="font-semibold text-[15px] mb-1" style={{ color: 'var(--gray-800)' }}>
        <FontAwesomeIcon icon={SCAN_STEPS[step].icon} style={{ marginRight: 6, color: 'var(--brand-green)' }} />
        {SCAN_STEPS[step].text}
      </p>
      <p className="text-[12px]" style={{ color: 'var(--gray-400)' }}>
        Scanning {universeLabel} · Usually takes 20–40 seconds
      </p>
      <div className="flex items-center justify-center gap-2 mt-5">
        {SCAN_STEPS.map((_, i) => (
          <div key={i} style={{
            width: i === step ? 20 : 6, height: 6, borderRadius: 99,
            background: i <= step ? 'var(--brand-green)' : 'var(--gray-200)',
            transition: 'all 0.4s ease',
          }} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Error State
// ─────────────────────────────────────────────────────────────────────────────
function ErrorState({ onRetry, errorMessage }: { onRetry: () => void; errorMessage: string | null }) {
  const isApiKeyError = (errorMessage || '').toLowerCase().includes('api key')
    || (errorMessage || '').toLowerCase().includes('gemini')
    || (errorMessage || '').toLowerCase().includes('quota')

  return (
    <div className="animate-fade-in" style={{
      background: 'var(--red-light)', border: '1px solid var(--red-border)',
      borderRadius: 16, padding: '28px 24px', textAlign: 'center', boxShadow: 'var(--shadow-card)',
    }}>
      <div
        style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(240,68,56,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px',
          color: 'var(--red)',
          fontSize: 18,
        }}
      >
        <FontAwesomeIcon icon={faTriangleExclamation} />
      </div>
      <p className="font-semibold text-[14px] mb-1" style={{ color: 'var(--red-dark)' }}>Scan failed</p>
      <p className="text-[12px] mb-2 max-w-sm mx-auto" style={{ color: 'var(--red)' }}>
        {isApiKeyError
          ? 'Gemini API quota exceeded or key invalid. Update your .env and restart the backend.'
          : (errorMessage || 'Could not complete scan. NSE endpoints occasionally block requests.')}
      </p>
      {!isApiKeyError && (
        <p className="text-[11px] mb-4" style={{ color: 'var(--red)', opacity: 0.7 }}>
          Last cached data shown if available.
        </p>
      )}
      <button
        onClick={onRetry}
        style={{
          fontSize: 12, fontWeight: 600, color: 'var(--red-dark)',
          border: '1px solid var(--red-border)', background: 'rgba(255,255,255,0.7)',
          padding: '7px 16px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#fff')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.7)')}
      >
        ↻ Retry scan
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Cached Banner
// ─────────────────────────────────────────────────────────────────────────────
function CachedDataBanner() {
  return (
    <div className="animate-fade-in flex items-center gap-2.5 px-4 py-3 rounded-xl" style={{
      background: 'var(--amber-light)', border: '1px solid var(--amber-border)',
    }}>
      <span>🕐</span>
      <p className="text-[12px]" style={{ color: 'var(--amber-dark)' }}>
        Showing last cached scan results — new scan failed. NSE endpoints occasionally block requests.
      </p>
    </div>
  )
}