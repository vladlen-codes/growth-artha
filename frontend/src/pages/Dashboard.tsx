import { useState, useEffect } from 'react'
import { useRadarStore } from '../store/radarStore'
import { usePortfolioStore } from '../store/portfolioStore'
import { useNotifications } from '../hooks/useNotifications'
import { runRadar, getRadarStatus } from '../api/enpoints'
import PortfolioInput from '../components/PortfolioInput'
import RadarBucket from '../components/RadarBucket'
import RunRadarButton from '../components/RunRadarButton'
import StatsBar from '../components/StatsBar'
import AuditTrail from '../components/AuditTrail'

interface Props {
  onSelectStock: (symbol: string) => void
}

export default function Dashboard({ onSelectStock }: Props) {
  const { status, result, jobId, setJob, setStatus, setResult, setError } = useRadarStore()
  const { getSymbols } = usePortfolioStore()
  const { onRadarComplete } = useNotifications()
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null)

  // Poll for job completion
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
          onRadarComplete(job.result)
          clearInterval(interval)
        } else if (job.status === 'error') {
          setError(job.error || 'Scan failed')
          clearInterval(interval)
        } else {
          setStatus(job.status)
        }
      } catch {
        setError('Could not reach server')
        clearInterval(interval)
      }
    }, 2000)   // poll every 2 seconds

    setPollInterval(interval)
    return () => clearInterval(interval)
  }, [jobId])

  const handleRunRadar = async () => {
    try {
      const portfolio = getSymbols()
      const res = await runRadar(portfolio)
      setJob(res.data.job_id)
    } catch (e) {
      setError('Failed to start scan')
    }
  }

  return (
    <div className="space-y-6">

      {/* Top row: portfolio input + run button */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <h2 className="text-sm font-medium text-gray-500 mb-1">Your Portfolio</h2>
            <PortfolioInput />
          </div>
          <RunRadarButton
            status={status}
            onClick={handleRunRadar}
          />
        </div>
      </div>

      {/* Stats bar — only after first scan */}
      {result && (
        <StatsBar
          totalScanned={result.total_scanned}
          totalSignals={result.total_signals}
          actCount={result.act.length}
          watchCount={result.watch.length}
          exitCount={result.exit_radar.length}
        />
      )}

      {/* Loading state */}
      {(status === 'pending' || status === 'running') && (
        <ScanningState />
      )}

      {/* Error state */}
      {status === 'error' && (
        <ErrorState onRetry={handleRunRadar} />
      )}

      {/* Results — three buckets */}
      {status === 'done' && result && (
        <div className="space-y-5">
          <RadarBucket
            title="Act"
            subtitle="Strong convergent signals — review today"
            signals={result.act}
            variant="act"
            onSelect={onSelectStock}
          />
          <RadarBucket
            title="Watch"
            subtitle="Signals forming — not yet confirmed"
            signals={result.watch}
            variant="watch"
            onSelect={onSelectStock}
          />
          <RadarBucket
            title="Exit Radar"
            subtitle="Deteriorating signals — especially on your holdings"
            signals={result.exit_radar}
            variant="exit"
            onSelect={onSelectStock}
          />
        </div>
      )}

      {/* Audit trail — agent reasoning log */}
      {status === 'done' && jobId && (
        <AuditTrail jobId={jobId} />
      )}

      {/* Empty state */}
      {status === 'idle' && (
        <EmptyState />
      )}

    </div>
  )
}

function ScanningState() {
  const steps = [
    'Fetching NSE data...',
    'Detecting chart patterns...',
    'Scoring convergent signals...',
    'Generating AI insights...',
  ]
  const [step, setStep] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 4000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
      <div className="w-10 h-10 border-2 border-brand-green border-t-transparent
                      rounded-full animate-spin mx-auto mb-4" />
      <p className="text-sm font-medium text-gray-700">{steps[step]}</p>
      <p className="text-xs text-gray-400 mt-1">
        Scanning Nifty 50 · Usually takes 20–30 seconds
      </p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-red-50 rounded-xl border border-red-200 p-6 text-center">
      <p className="text-sm font-medium text-red-700 mb-1">Scan failed</p>
      <p className="text-xs text-red-500 mb-4">
        Showing last cached data if available. NSE endpoints occasionally block requests.
      </p>
      <button
        onClick={onRetry}
        className="text-xs font-medium text-red-600 border border-red-300
                   px-3 py-1.5 rounded-md hover:bg-red-100 transition-colors"
      >
        Retry scan
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <div className="w-12 h-12 rounded-full bg-brand-light flex items-center
                      justify-center mx-auto mb-4 text-2xl">
        📡
      </div>
      <h3 className="text-sm font-medium text-gray-700 mb-1">
        Ready to scan
      </h3>
      <p className="text-xs text-gray-400 max-w-xs mx-auto">
        Add your holdings above, then hit Run Radar to get today's
        ranked signals across Nifty 50.
      </p>
    </div>
  )
}