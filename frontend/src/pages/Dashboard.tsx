import { useState, useEffect, type CSSProperties } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBolt, faSatelliteDish, faRobot, faMagnifyingGlassChart,
  faChartLine, faNewspaper, faDatabase, faChartBar, faTriangleExclamation, faComments,
} from '@fortawesome/free-solid-svg-icons'
import { useRadarStore } from '../store/radarStore'
import { usePortfolioStore } from '../store/portfolioStore'
import { useNotifications } from '../hooks/useNotifications'
import { runRadar, getRadarStatus, getLatestSignals, askChat, getRadarJobs } from '../api/enpoints'
import api from '../api/client'
import { useQueries, useQuery } from '@tanstack/react-query'
import PortfolioInput from '../components/PortfolioInput'
import RadarBucket from '../components/RadarBucket'
import RunRadarButton from '../components/RunRadarButton'
import StatsBar from '../components/StatsBar'
import AuditTrail from '../components/AuditTrail'

interface Props {
  onSelectStock: (symbol: string) => void
  onOpenVideoStudio: () => void
}

export default function Dashboard({ onSelectStock, onOpenVideoStudio }: Props) {
  const AUDIT_FILTER_KEY = 'growth-artha-audit-filter-all-jobs'
  const AUDIT_SELECTED_JOB_KEY = 'growth-artha-audit-selected-job-id'
  const { status, result, error, jobId, setJob, setStatus, setResult, setError } = useRadarStore()
  const { getSymbols } = usePortfolioStore()
  const { onRadarComplete } = useNotifications()
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null)
  const [showCachedBanner, setShowCachedBanner] = useState(false)
  const [universe, setUniverse] = useState<string>('nifty50')
  const [selectedAuditJobId, setSelectedAuditJobId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(AUDIT_SELECTED_JOB_KEY)
    } catch {
      return null
    }
  })
  const [showAllJobs, setShowAllJobs] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUDIT_FILTER_KEY) === '1'
    } catch {
      return false
    }
  })

  const { data: recentJobsData, refetch: refetchRecentJobs } = useQuery<{ jobs: RadarHistoryJob[] }>({
    queryKey: ['radar-jobs-history'],
    queryFn: () => getRadarJobs(25).then(r => r.data),
    staleTime: 20_000,
  })

  const recentJobs = recentJobsData?.jobs ?? []
  const doneJobsCount = recentJobs.filter((j) => isDoneStatus(j.status)).length
  const allJobsCount = recentJobs.length
  const visibleJobs = showAllJobs ? recentJobs : recentJobs.filter((j) => isDoneStatus(j.status))
  const latestJobId = visibleJobs[0]?.job_id ?? null
  const selectedJob = recentJobs.find((j) => j.job_id === selectedAuditJobId) ?? null

  useEffect(() => {
    if (jobId) {
      setSelectedAuditJobId(jobId)
    }
  }, [jobId])

  useEffect(() => {
    try {
      localStorage.setItem(AUDIT_FILTER_KEY, showAllJobs ? '1' : '0')
    } catch {
      // Ignore localStorage issues (private mode/quota).
    }
  }, [showAllJobs, AUDIT_FILTER_KEY])

  useEffect(() => {
    try {
      if (selectedAuditJobId) {
        localStorage.setItem(AUDIT_SELECTED_JOB_KEY, selectedAuditJobId)
      } else {
        localStorage.removeItem(AUDIT_SELECTED_JOB_KEY)
      }
    } catch {
      // Ignore localStorage issues (private mode/quota).
    }
  }, [selectedAuditJobId, AUDIT_SELECTED_JOB_KEY])

  useEffect(() => {
    if (!visibleJobs.length) {
      if (!showAllJobs) {
        const fallback = recentJobs[0]?.job_id ?? null
        setSelectedAuditJobId(fallback)
      }
      return
    }

    const exists = visibleJobs.some((j) => j.job_id === selectedAuditJobId)
    if (!exists) {
      setSelectedAuditJobId(visibleJobs[0].job_id)
    }
  }, [showAllJobs, visibleJobs.length, selectedAuditJobId, recentJobs, visibleJobs])

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
          refetchRecentJobs()
          clearInterval(interval)
        } else if (job.status === 'error') {
          const hasCached = await tryLoadCachedResult()
          if (!hasCached) setError(job.error || 'Scan failed')
          refetchRecentJobs()
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
      refetchRecentJobs()
    } catch {
      setError('Failed to start scan - is the backend running?')
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
          <RadarBucket title="Act" subtitle="Strong convergent signals - review today" signals={result.act} variant="act" onSelect={onSelectStock} />
          <RadarBucket title="Watch" subtitle="Signals forming - not yet confirmed" signals={result.watch} variant="watch" onSelect={onSelectStock} />
          <RadarBucket title="Exit Radar" subtitle="Deteriorating signals - especially on your holdings" signals={result.exit_radar} variant="exit" onSelect={onSelectStock} />
        </div>
      )}

      {/* ── Audit trail ── */}
      {status === 'done' && (
        <div className="space-y-2">
            {!!recentJobs.length && (
            <div
              className="animate-fade-in-up"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '10px 12px',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <label
                htmlFor="audit-job-select"
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                Audit Trail Job
              </label>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    onClick={() => setShowAllJobs(false)}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: showAllJobs ? 'var(--surface)' : 'var(--gray-50)',
                      color: showAllJobs ? 'var(--gray-600)' : 'var(--gray-900)',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '4px 8px',
                      cursor: showAllJobs ? 'pointer' : 'default',
                    }}
                    disabled={!showAllJobs}
                  >
                    Done only ({doneJobsCount})
                  </button>
                  <button
                    onClick={() => setShowAllJobs(true)}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: showAllJobs ? 'var(--gray-50)' : 'var(--surface)',
                      color: showAllJobs ? 'var(--gray-900)' : 'var(--gray-600)',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '4px 8px',
                      cursor: showAllJobs ? 'default' : 'pointer',
                    }}
                    disabled={showAllJobs}
                  >
                    All jobs ({allJobsCount})
                  </button>
                </div>
              <div className="mt-1.5 flex items-center gap-2">
                <select
                  id="audit-job-select"
                    value={selectedAuditJobId ?? ''}
                  onChange={(e) => setSelectedAuditJobId(e.target.value || null)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--surface)',
                    color: 'var(--gray-800)',
                    fontSize: 12,
                    padding: '7px 9px',
                    minWidth: 260,
                  }}
                  >
                    {visibleJobs.map((j) => (
                    <option key={j.job_id} value={j.job_id}>
                      {formatJobLabel(j)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => refetchRecentJobs()}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--surface)',
                    color: 'var(--gray-600)',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '7px 10px',
                    cursor: 'pointer',
                  }}
                >
                  Refresh
                </button>
                <button
                  onClick={() => {
                    if (latestJobId) setSelectedAuditJobId(latestJobId)
                  }}
                  disabled={!latestJobId || selectedAuditJobId === latestJobId}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: selectedAuditJobId === latestJobId ? 'var(--gray-50)' : 'var(--surface)',
                    color: selectedAuditJobId === latestJobId ? 'var(--gray-400)' : 'var(--gray-700)',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '7px 10px',
                    cursor: !latestJobId || selectedAuditJobId === latestJobId ? 'default' : 'pointer',
                  }}
                >
                  Open latest
                </button>
              </div>

              {!visibleJobs.length && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--gray-500)' }}>
                  No completed jobs yet. Switch to All jobs to view pending/running entries.
                </div>
              )}

              {selectedJob && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusChip status={selectedJob.status} />
                  {selectedJob.using_cached_data && (
                    <span style={metaChipStyle}>cached</span>
                  )}
                  {selectedJob.using_non_ai_fallback && (
                    <span style={metaChipStyle}>fallback</span>
                  )}
                  {typeof selectedJob.total_signals === 'number' && (
                    <span style={metaChipStyle}>{selectedJob.total_signals} signals</span>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedAuditJobId && <AuditTrail jobId={selectedAuditJobId} />}
        </div>
      )}

      {/* ── Portfolio-aware Market Chat ── */}
      <MarketChatPanel portfolio={getSymbols()} onSelectStock={onSelectStock} />

      {/* ── Phase 3 Video Studio ── */}
      <section
        style={{
          background: 'linear-gradient(120deg, #F8FCFA 0%, #EEF8F3 100%)',
          border: '1px solid var(--brand-border)',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--brand-dark)', marginBottom: 3 }}>
            Phase 3
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--gray-900)' }}>
            Video Studio is now live
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 2 }}>
            Generate storyboards, start render jobs, and download JSON or MP4 artifacts.
          </div>
        </div>
        <button
          onClick={onOpenVideoStudio}
          style={{
            border: '1px solid var(--brand-border)',
            borderRadius: 9,
            background: 'var(--brand-green)',
            color: 'white',
            fontSize: 12,
            fontWeight: 800,
            padding: '8px 12px',
            cursor: 'pointer',
          }}
        >
          Open Video Studio
        </button>
      </section>

      {/* ── Feature showcase (idle only, below portfolio card) ── */}
      {status === 'idle' && <FeatureShowcase />}

    </div>
  )
}

interface RadarHistoryJob {
  job_id: string
  status: string
  scanned_at?: string
  created_at?: string
  finished_at?: string
  total_signals?: number
  using_cached_data?: boolean
  using_non_ai_fallback?: boolean
}

function formatJobLabel(job: RadarHistoryJob): string {
  const ts = job.scanned_at || job.finished_at || job.created_at
  const timeLabel = ts ? new Date(ts).toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }) : 'time n/a'
  const relative = formatTimeAgo(ts)

  const signalCount = typeof job.total_signals === 'number' ? job.total_signals : 0
  const flags = [
    job.using_cached_data ? 'cached' : null,
    job.using_non_ai_fallback ? 'fallback' : null,
  ].filter(Boolean)

  const statusTag = toStatusTag(job.status)

  return `${statusTag} ${job.job_id} · ${relative} · ${signalCount} signals${flags.length ? ` · ${flags.join('/')}` : ''} · ${timeLabel}`
}

function toStatusTag(status: string | undefined): string {
  const normalized = (status || '').toLowerCase()
  if (normalized === 'done') return '[DONE]'
  if (normalized === 'running') return '[RUN]'
  if (normalized === 'pending') return '[PEND]'
  if (normalized === 'error') return '[ERR]'
  return '[UNK]'
}

function isDoneStatus(status: string | undefined): boolean {
  return (status || '').toLowerCase() === 'done'
}

function formatTimeAgo(ts: string | undefined): string {
  if (!ts) return 'time n/a'
  const t = new Date(ts).getTime()
  if (!Number.isFinite(t)) return 'time n/a'
  const diffMs = Date.now() - t
  if (diffMs < 0) return 'just now'
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}h ago`
  const day = Math.floor(hour / 24)
  return `${day}d ago`
}

const metaChipStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  padding: '2px 7px',
  borderRadius: 999,
  color: 'var(--gray-600)',
  border: '1px solid var(--border)',
  background: 'var(--gray-50)',
}

function StatusChip({ status }: { status: string }) {
  const normalized = (status || '').toLowerCase()
  const cfg = normalized === 'done'
    ? { fg: '#0A7A4A', bg: '#EDFAF4', border: '#B8E6CF' }
    : normalized === 'running' || normalized === 'pending'
      ? { fg: '#9A6300', bg: '#FFFBEB', border: '#F4D58A' }
      : { fg: '#B42318', bg: '#FEF3F2', border: '#F9C8C5' }

  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        padding: '2px 7px',
        borderRadius: 999,
        color: cfg.fg,
        border: `1px solid ${cfg.border}`,
        background: cfg.bg,
      }}
    >
      {normalized || 'unknown'}
    </span>
  )
}

interface ChatCitation {
  symbol?: string
  score?: number
  bucket?: string
  reason?: string
  source?: string
}

interface ChatResponse {
  answer: string
  citations?: ChatCitation[]
  analysis_mode?: string
  portfolio_impact?: {
    portfolio_count?: number
    flagged_count?: number
    flagged_symbols?: string[]
  }
}

interface ChatTurn {
  question: string
  response: ChatResponse
  at: string
}

function MarketChatPanel({ portfolio, onSelectStock }: { portfolio: string[]; onSelectStock: (symbol: string) => void }) {
  const CHAT_HISTORY_KEY = 'growth-artha-market-chat-history'
  const [question, setQuestion] = useState('Given my portfolio, what are my top focus stocks today?')
  const [response, setResponse] = useState<ChatResponse | null>(null)
  const [history, setHistory] = useState<ChatTurn[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_HISTORY_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const sanitized = parsed
        .filter((t: any) => t && typeof t.question === 'string' && t.response && typeof t.response.answer === 'string')
        .slice(0, 5)
      setHistory(sanitized)
    } catch {
      // Ignore corrupted localStorage entries.
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history.slice(0, 5)))
    } catch {
      // Ignore storage quota/unavailable issues.
    }
  }, [history])

  const submit = async () => {
    const q = question.trim()
    if (!q) return
    setLoading(true)
    setError(null)

    try {
      const res = await askChat(q, portfolio)
      const data = res.data
      const normalized: ChatResponse = typeof data?.answer === 'string'
        ? data
        : { answer: 'No answer returned.' }
      if (typeof data?.answer === 'string') {
        setResponse(data)
      } else {
        setResponse({ answer: 'No answer returned.' })
      }
      setHistory(prev => [{
        question: q,
        response: normalized,
        at: new Date().toISOString(),
      }, ...prev].slice(0, 5))
    } catch {
      setError('Could not get chat response right now.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="animate-fade-in-up"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '18px 18px 16px',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--gray-100)',
              color: 'var(--brand-dark)',
            }}
          >
            <FontAwesomeIcon icon={faComments} />
          </span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gray-900)' }}>Market Chat</div>
            <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
              Portfolio-aware Q&A with structured citations
            </div>
          </div>
        </div>
        {response?.analysis_mode && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: response.analysis_mode === 'ai' ? 'var(--brand-green)' : 'var(--amber-dark)',
              background: response.analysis_mode === 'ai' ? 'var(--green-light)' : 'var(--amber-light)',
              border: `1px solid ${response.analysis_mode === 'ai' ? 'var(--green-border)' : 'var(--amber-border)'}`,
              borderRadius: 999,
              padding: '3px 7px',
            }}
          >
            {response.analysis_mode}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          placeholder="Ask about momentum, risk, or your holdings..."
          style={{
            width: '100%',
            resize: 'vertical',
            minHeight: 64,
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 13,
            color: 'var(--gray-900)',
            background: 'var(--surface)',
          }}
        />
        <div className="flex items-center justify-between gap-3">
          <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
            Portfolio symbols: {portfolio.length}
          </div>
          <button
            onClick={submit}
            disabled={loading}
            style={{
              border: 'none',
              borderRadius: 9,
              background: 'var(--brand-green)',
              color: '#fff',
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Thinking...' : 'Ask Chat'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red-dark)' }}>{error}</div>
      )}

      {response?.answer && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 12px',
              background: 'var(--gray-50)',
              fontSize: 13,
              color: 'var(--gray-800)',
              lineHeight: 1.45,
            }}
          >
            {response.answer}
          </div>

          {response.portfolio_impact && (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '9px 11px',
                background: 'var(--surface)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                Portfolio Impact
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-700)' }}>
                Flagged {response.portfolio_impact.flagged_count ?? 0} / {response.portfolio_impact.portfolio_count ?? 0} holdings
              </div>
              {!!response.portfolio_impact.flagged_symbols?.length && (
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 3 }}>
                  {response.portfolio_impact.flagged_symbols.join(', ')}
                </div>
              )}
            </div>
          )}

          {!!response.citations?.length && (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '9px 11px',
                background: 'var(--surface)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Citations
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {response.citations.slice(0, 5).map((c, idx) => (
                  <div key={`${c.symbol || 'row'}-${idx}`} style={{ fontSize: 12, color: 'var(--gray-700)' }}>
                    {c.symbol ? (
                      <button
                        onClick={() => onSelectStock(c.symbol as string)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--brand-dark)',
                          fontWeight: 800,
                          cursor: 'pointer',
                          padding: 0,
                          marginRight: 4,
                        }}
                      >
                        {c.symbol}
                      </button>
                    ) : (
                      <span style={{ fontWeight: 700 }}>N/A</span>
                    )}
                    {typeof c.score === 'number' ? ` · score ${c.score.toFixed(2)}` : ''}
                    {c.bucket ? ` · ${c.bucket}` : ''}
                    {c.source ? ` · ${c.source}` : ''}
                    {c.reason ? ` - ${c.reason}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!!history.length && (
        <div
          style={{
            marginTop: 12,
            borderTop: '1px solid var(--border)',
            paddingTop: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Recent Questions
            </div>
            <button
              onClick={() => {
                setHistory([])
                try {
                  localStorage.removeItem(CHAT_HISTORY_KEY)
                } catch {
                  // ignore storage errors
                }
              }}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--surface)',
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--gray-600)',
                cursor: 'pointer',
              }}
            >
              Clear history
            </button>
          </div>
          {history.map((turn, idx) => {
            const ts = new Date(turn.at)
            return (
              <button
                key={`${turn.at}-${idx}`}
                onClick={() => {
                  setQuestion(turn.question)
                  setResponse(turn.response)
                }}
                style={{
                  textAlign: 'left',
                  border: '1px solid var(--border)',
                  borderRadius: 9,
                  background: 'var(--surface)',
                  padding: '8px 10px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 3 }}>
                  {turn.question}
                </div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                  {turn.response.analysis_mode || 'n/a'} · {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function HeroBanner({ onRunRadar }: { onRunRadar: () => void }) {
  const TICKER_STOCKS = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'INFY',
    'ICICIBANK', 'BAJFINANCE', 'WIPRO', 'TITAN',
  ]

  const quoteQueries = useQueries({
    queries: TICKER_STOCKS.map(sym => ({
      queryKey: ['hero-ticker-quote', sym],
      queryFn: () => api.get(`/stocks/${sym}/price`).then(r => r.data),
      staleTime: 25_000,
      refetchInterval: 30_000,
      retry: 1,
    })),
  })

  const tickerRows = TICKER_STOCKS.map((sym, i) => {
    const q = quoteQueries[i]?.data as any
    return {
      sym,
      price: typeof q?.last_price === 'number'
        ? q.last_price
        : (typeof q?.price === 'number' ? q.price : null),
      changePct: typeof q?.change_pct === 'number'
        ? q.change_pct
        : (typeof q?.changePct === 'number' ? q.changePct : null),
      isLive: q?.is_live,
    }
  })

  const availableRows = tickerRows.filter(r => r.price != null)
  const hasAnyQuote = availableRows.length > 0
  const hasAnyTrueLive = availableRows.some(r => r.isLive === true)
  const feedLabel = !hasAnyQuote ? 'No feed' : hasAnyTrueLive ? 'Live' : 'Delayed'
  const feedColor = !hasAnyQuote ? '#9CA3AF' : hasAnyTrueLive ? '#16C97B' : '#F59E0B'

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
            score convergent signals and surface the stocks that deserve your attention, today.
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
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: feedColor, display: 'inline-block', animation: 'pulse 2s infinite' }} />
            Nifty 50 · {feedLabel}
          </div>
          <div style={{ padding: '6px 0' }}>
            {tickerRows.map((s, i) => {
              const isPos = (s.changePct ?? 0) >= 0

              return (
                <div
                  key={s.sym}
                  className="flex items-center justify-between px-4 py-2"
                  style={{ borderBottom: i < tickerRows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                >
                  <span className="font-semibold text-[12px]" style={{ color: 'rgba(255,255,255,0.8)' }}>
                    {s.sym}
                  </span>
                  <div className="text-right">
                    <div className="font-bold text-[12px]" style={{ color: '#fff' }}>
                      {s.price != null ? `₹${s.price.toLocaleString('en-IN')}` : '-'}
                    </div>
                    {s.changePct != null ? (
                      <div style={{ fontSize: 10, color: isPos ? '#4ADEAA' : '#FC8181', fontWeight: 600 }}>
                        {isPos ? '+' : ''}{s.changePct.toFixed(2)}%
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
                        -
                      </div>
                    )}
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
    desc: 'Each stock gets a score based on how many independent signals agree. Co-occurring signals get a multiplier - the strongest picks float to the top.',
    badge: 'Multi-signal',
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
  },
  {
    icon: faRobot,
    title: 'Gemini AI Cards',
    desc: 'The Insight Agent writes a plain-English alert card for every Act and Watch stock, citing specific data points behind each signal - never generic.',
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
        Scanning {universeLabel} · Usually takes 20-40 seconds
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

function CachedDataBanner() {
  return (
    <div className="animate-fade-in flex items-center gap-2.5 px-4 py-3 rounded-xl" style={{
      background: 'var(--amber-light)', border: '1px solid var(--amber-border)',
    }}>
      <span>🕐</span>
      <p className="text-[12px]" style={{ color: 'var(--amber-dark)' }}>
        Showing last cached scan results: new scan failed. NSE endpoints occasionally block requests.
      </p>
    </div>
  )
}