import { useEffect, useMemo, useState } from 'react'
import {
  cancelVideoJob,
  createVideoJob,
  createVideoStoryboard,
  getVideoJob,
  getVideoJobDownloadUrl,
  getVideoJobs,
  retryVideoJob,
} from '../api/enpoints'

interface Props {
  portfolio: string[]
  compact?: boolean
}

interface StoryboardScene {
  title: string
  narration: string
  visual: string
  seconds: number
}

interface StoryboardResponse {
  duration_seconds: number
  storyboard?: {
    template?: string
    headline?: string
    scenes?: StoryboardScene[]
  }
}

interface VideoJob {
  job_id: string
  status: string
  created_at?: string
  started_at?: string | null
  finished_at?: string
  attempt_count?: number
  max_attempts?: number
  error?: string | null
  title?: string
  render_mode?: 'auto' | 'mp4' | 'json' | string
  rendered_mode?: 'mp4' | 'json' | string | null
  artifact_format?: 'mp4' | 'json' | string | null
  download_url?: string | null
}

export default function VideoStudioPanel({ portfolio, compact = false }: Props) {
  const [template, setTemplate] = useState<'daily_wrap' | 'movers'>('daily_wrap')
  const [renderMode, setRenderMode] = useState<'auto' | 'mp4' | 'json'>('auto')
  const [durationSeconds, setDurationSeconds] = useState(45)
  const [loadingStoryboard, setLoadingStoryboard] = useState(false)
  const [loadingRender, setLoadingRender] = useState(false)
  const [storyboard, setStoryboard] = useState<StoryboardResponse | null>(null)
  const [jobs, setJobs] = useState<VideoJob[]>([])
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeJob = useMemo(() => jobs.find(j => j.job_id === activeJobId) || null, [jobs, activeJobId])
  const analytics = useMemo(() => {
    const total = jobs.length
    const done = jobs.filter(j => (j.status || '').toLowerCase() === 'done').length
    const errored = jobs.filter(j => (j.status || '').toLowerCase() === 'error').length
    const running = jobs.filter(j => ['queued', 'running', 'retrying'].includes((j.status || '').toLowerCase())).length
    const retries = jobs.filter(j => Number(j.attempt_count || 0) > 1).length

    const durationsSec = jobs
      .filter(j => j.started_at && j.finished_at)
      .map(j => {
        const a = new Date(String(j.started_at)).getTime()
        const b = new Date(String(j.finished_at)).getTime()
        return Number.isFinite(a) && Number.isFinite(b) && b >= a ? (b - a) / 1000 : null
      })
      .filter((v): v is number => typeof v === 'number')

    const avgRenderSec = durationsSec.length
      ? Math.round((durationsSec.reduce((sum, v) => sum + v, 0) / durationsSec.length) * 10) / 10
      : null

    const terminalForRate = done + errored
    const successRate = terminalForRate > 0 ? Math.round((done / terminalForRate) * 100) : null
    const retryRate = total > 0 ? Math.round((retries / total) * 100) : null

    return {
      total,
      done,
      errored,
      running,
      avgRenderSec,
      successRate,
      retryRate,
    }
  }, [jobs])

  const refreshJobs = async () => {
    try {
      const res = await getVideoJobs(10)
      const rows = Array.isArray(res.data?.jobs) ? res.data.jobs : []
      setJobs(rows)
      if (!activeJobId && rows.length) {
        setActiveJobId(rows[0].job_id)
      }
    } catch {
      // Non-fatal for dashboard flow.
    }
  }

  useEffect(() => {
    refreshJobs()
  }, [])

  useEffect(() => {
    if (!activeJobId) return
    const interval = setInterval(async () => {
      try {
        const res = await getVideoJob(activeJobId)
        const updated = res.data as VideoJob
        setJobs(prev => {
          const next = [...prev]
          const idx = next.findIndex(j => j.job_id === updated.job_id)
          if (idx >= 0) next[idx] = { ...next[idx], ...updated }
          else next.unshift(updated)
          return next.slice(0, 15)
        })
      } catch {
        // Ignore transient polling errors.
      }
    }, 2500)
    return () => clearInterval(interval)
  }, [activeJobId])

  const handleGenerateStoryboard = async () => {
    setError(null)
    setLoadingStoryboard(true)
    try {
      const res = await createVideoStoryboard({
        template,
        duration_seconds: durationSeconds,
        portfolio,
      })
      setStoryboard(res.data)
    } catch {
      setError('Unable to generate storyboard right now.')
    } finally {
      setLoadingStoryboard(false)
    }
  }

  const handleRender = async () => {
    setError(null)
    setLoadingRender(true)
    try {
      const res = await createVideoJob({
        template,
        duration_seconds: durationSeconds,
        portfolio,
        title: `Dashboard ${template} render`,
        render_mode: renderMode,
      })
      const jobId = res.data?.job_id
      if (jobId) {
        setActiveJobId(jobId)
      }
      await refreshJobs()
    } catch {
      setError('Unable to start render job.')
    } finally {
      setLoadingRender(false)
    }
  }

  const handleRetry = async () => {
    if (!activeJobId) return
    setError(null)
    try {
      await retryVideoJob(activeJobId)
      await refreshJobs()
    } catch {
      setError('Unable to retry this job right now.')
    }
  }

  const handleCancel = async () => {
    if (!activeJobId) return
    setError(null)
    try {
      await cancelVideoJob(activeJobId)
      await refreshJobs()
    } catch {
      setError('Unable to cancel this job right now.')
    }
  }

  const statusTone = (status?: string) => {
    const s = (status || '').toLowerCase()
    if (s === 'done') return { color: 'var(--brand-dark)', bg: 'var(--brand-bg)', border: 'var(--brand-border)' }
    if (s === 'error') return { color: 'var(--red-dark)', bg: 'var(--red-light)', border: 'var(--red-border)' }
    return { color: 'var(--amber-dark)', bg: 'var(--amber-light)', border: 'var(--amber-border)' }
  }

  const activeTone = statusTone(activeJob?.status)

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '16px 18px',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gray-500)' }}>
            Video Studio
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-900)', marginTop: 2 }}>
            Build Daily Shorts
          </div>
        </div>
        <button
          onClick={refreshJobs}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 600,
            background: 'var(--gray-50)',
            color: 'var(--gray-700)',
          }}
        >
          Refresh jobs
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: 'var(--gray-700)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Template
          <select
            value={template}
            onChange={(e) => setTemplate((e.target.value as 'daily_wrap' | 'movers') || 'daily_wrap')}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface)' }}
          >
            <option value="daily_wrap">Daily Wrap</option>
            <option value="movers">Movers Board</option>
          </select>
        </label>

        <label style={{ fontSize: 12, color: 'var(--gray-700)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Duration (seconds)
          <input
            type="number"
            min={30}
            max={90}
            value={durationSeconds}
            onChange={(e) => setDurationSeconds(Math.max(30, Math.min(90, Number(e.target.value) || 45)))}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface)' }}
          />
        </label>

        <label style={{ fontSize: 12, color: 'var(--gray-700)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Render mode
          <select
            value={renderMode}
            onChange={(e) => setRenderMode((e.target.value as 'auto' | 'mp4' | 'json') || 'auto')}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface)' }}
          >
            <option value="auto">Auto (prefer MP4 if available)</option>
            <option value="mp4">MP4 (requires ffmpeg)</option>
            <option value="json">JSON plan only</option>
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          onClick={handleGenerateStoryboard}
          disabled={loadingStoryboard}
          style={{
            border: '1px solid var(--brand-border)',
            borderRadius: 8,
            padding: '8px 12px',
            background: 'var(--brand-bg)',
            color: 'var(--brand-dark)',
            fontSize: 12,
            fontWeight: 700,
            cursor: loadingStoryboard ? 'default' : 'pointer',
          }}
        >
          {loadingStoryboard ? 'Generating storyboard...' : 'Generate storyboard'}
        </button>

        <button
          onClick={handleRender}
          disabled={loadingRender}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 12px',
            background: 'var(--gray-900)',
            color: 'white',
            fontSize: 12,
            fontWeight: 700,
            cursor: loadingRender ? 'default' : 'pointer',
          }}
        >
          {loadingRender ? 'Starting render...' : 'Start render job'}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: 'var(--red-dark)', marginBottom: 10 }}>
          {error}
        </div>
      )}

      {storyboard?.storyboard?.scenes?.length ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 12, background: 'var(--gray-50)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-700)', marginBottom: 8 }}>
            Storyboard: {storyboard.storyboard.headline || storyboard.storyboard.template}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {(compact ? storyboard.storyboard.scenes.slice(0, 3) : storyboard.storyboard.scenes).map((s, idx) => (
              <div key={`${s.title}-${idx}`} style={{ fontSize: 12, color: 'var(--gray-700)' }}>
                <strong>{idx + 1}. {s.title}</strong> ({s.seconds}s): {s.narration}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 12, background: 'var(--surface)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gray-500)', marginBottom: 8 }}>
          Job Analytics
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--gray-50)' }}>
            <div style={{ fontSize: 10, color: 'var(--gray-500)', textTransform: 'uppercase', fontWeight: 700 }}>Success Rate</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand-dark)' }}>{analytics.successRate !== null ? `${analytics.successRate}%` : 'N/A'}</div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--gray-50)' }}>
            <div style={{ fontSize: 10, color: 'var(--gray-500)', textTransform: 'uppercase', fontWeight: 700 }}>Avg Render Time</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-900)' }}>{analytics.avgRenderSec !== null ? `${analytics.avgRenderSec}s` : 'N/A'}</div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--gray-50)' }}>
            <div style={{ fontSize: 10, color: 'var(--gray-500)', textTransform: 'uppercase', fontWeight: 700 }}>Retry Rate</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--amber-dark)' }}>{analytics.retryRate !== null ? `${analytics.retryRate}%` : 'N/A'}</div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--gray-50)' }}>
            <div style={{ fontSize: 10, color: 'var(--gray-500)', textTransform: 'uppercase', fontWeight: 700 }}>Queue Health</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: analytics.running > 0 ? 'var(--amber-dark)' : 'var(--brand-dark)' }}>
              {analytics.running > 0 ? `${analytics.running} active` : 'Idle'}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--gray-500)' }}>
          {analytics.done} done · {analytics.errored} failed · {analytics.total} tracked
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gray-500)', marginBottom: 8 }}>
          Render Jobs
        </div>

        {activeJob ? (
          <div style={{ border: `1px solid ${activeTone.border}`, background: activeTone.bg, borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: activeTone.color }}>Current: {activeJob.job_id}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: activeTone.color, textTransform: 'uppercase' }}>{activeJob.status}</span>
              {activeJob.rendered_mode && (
                <span style={{ fontSize: 11, color: activeTone.color }}>
                  output: {activeJob.rendered_mode.toUpperCase()}
                </span>
              )}
              {activeJob.status === 'done' && (
                <a
                  href={getVideoJobDownloadUrl(activeJob.job_id)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-dark)' }}
                >
                  Download {String(activeJob.artifact_format || activeJob.rendered_mode || 'artifact').toUpperCase()}
                </a>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {typeof activeJob.attempt_count === 'number' && typeof activeJob.max_attempts === 'number' && (
                <span style={{ fontSize: 11, color: activeTone.color }}>
                  attempts: {activeJob.attempt_count}/{activeJob.max_attempts}
                </span>
              )}
              {activeJob.status === 'error' && (
                <button
                  onClick={handleRetry}
                  style={{
                    border: '1px solid var(--red-border)',
                    borderRadius: 8,
                    padding: '4px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'var(--red-light)',
                    color: 'var(--red-dark)',
                  }}
                >
                  Retry
                </button>
              )}
              {(activeJob.status === 'queued' || activeJob.status === 'running' || activeJob.status === 'retrying') && (
                <button
                  onClick={handleCancel}
                  style={{
                    border: '1px solid var(--amber-border)',
                    borderRadius: 8,
                    padding: '4px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'var(--amber-light)',
                    color: 'var(--amber-dark)',
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
            {activeJob.error && (
              <div style={{ fontSize: 11, color: 'var(--red-dark)', marginTop: 6 }}>
                {activeJob.error}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 10 }}>No jobs yet.</div>
        )}

        <div style={{ display: 'grid', gap: 6 }}>
          {jobs.slice(0, 5).map(job => (
            <button
              key={job.job_id}
              onClick={() => setActiveJobId(job.job_id)}
              style={{
                textAlign: 'left',
                border: '1px solid var(--border)',
                background: activeJobId === job.job_id ? 'var(--gray-50)' : 'var(--surface)',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 12,
                color: 'var(--gray-700)',
              }}
            >
              {job.job_id} · {job.status}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
