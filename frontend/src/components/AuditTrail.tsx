import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

interface ToolCall {
  tool:           string
  status:         'success' | 'error'
  result_summary: string
  elapsed_ms:     number
}

interface AuditData {
  tool_calls?:      ToolCall[]
  audit_log?:       any[]
  elapsed_seconds?: number
  using_cached_data?: boolean
  using_non_ai_fallback?: boolean
  fallback_reason?: string
}

interface Props { jobId: string }

export default function AuditTrail({ jobId }: Props) {
  const [open, setOpen] = useState(false)

  const { data, isLoading, isError } = useQuery<AuditData>({
    queryKey: ['audit', jobId],
    queryFn:  () => api.get(`/radar/audit/${jobId}`).then(r => r.data),
    enabled:  !!jobId && open,
    staleTime: Infinity,
  })

  const toolCalls = data?.tool_calls ?? []
  const auditLog = data?.audit_log ?? []
  const successCount = toolCalls.filter(c => c.status === 'success').length
  const errorCount   = toolCalls.filter(c => c.status === 'error').length

  return (
    <div
      className="animate-fade-in-up mt-2"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}
    >
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          transition: 'background 0.15s',
          textAlign: 'left',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-50)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        {/* Purple dot */}
        <div
          style={{
            width: 8, height: 8,
            borderRadius: '50%',
            background: '#9061F9',
            boxShadow: '0 0 0 3px rgba(144, 97, 249, 0.15)',
            flexShrink: 0,
          }}
        />

        <span
          className="font-semibold text-[13px]"
          style={{ color: 'var(--gray-800)' }}
        >
          Agent reasoning trail
        </span>
        <span className="text-[12px]" style={{ color: 'var(--gray-400)' }}>
          - every decision the AI agents made
        </span>

        {/* Summary badges */}
        {toolCalls.length > 0 && (
          <div className="flex items-center gap-1.5 ml-2">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: '#EDFAF4', color: '#0A7A4A' }}
            >
              {successCount} ok
            </span>
            {errorCount > 0 && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: '#FEF3F2', color: '#B42318' }}
              >
                {errorCount} err
              </span>
            )}
          </div>
        )}

        <span
          className="ml-auto text-[12px]"
          style={{ color: 'var(--gray-300)' }}
        >
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* Expanded content */}
      {open && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
          }}
        >
          {isLoading ? (
            <div
              className="px-5 py-4 text-[12px]"
              style={{ color: 'var(--gray-400)' }}
            >
              Loading agent log…
            </div>
          ) : isError ? (
            <div
              className="px-5 py-6 text-center text-[12px]"
              style={{ color: 'var(--red-dark)' }}
            >
              Could not load the audit trail for this scan.
            </div>
          ) : toolCalls.length === 0 ? (
            <div
              className="px-5 py-6 text-center text-[12px]"
              style={{ color: 'var(--gray-400)' }}
            >
              <div>No tool calls recorded for this scan.</div>
              {data?.using_cached_data && (
                <div className="mt-1">This result came from cached scan output.</div>
              )}
              {data?.using_non_ai_fallback && (
                <div className="mt-1">This run used the non-AI fallback pipeline.</div>
              )}
              {data?.fallback_reason && (
                <div className="mt-2" style={{ color: 'var(--gray-500)' }}>
                  Reason: {data.fallback_reason}
                </div>
              )}
              {auditLog.length > 0 && (
                <div className="mt-3 text-left text-[11px]" style={{ color: 'var(--gray-500)' }}>
                  {auditLog.slice(0, 4).map((entry, idx) => (
                    <div key={idx}>- {entry?.message || 'Pipeline step executed'}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div
                className="grid font-semibold text-[10px] uppercase tracking-wider px-5 py-2"
                style={{
                  gridTemplateColumns: '52px 180px 1fr 64px',
                  background: 'var(--gray-50)',
                  color: 'var(--gray-400)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span>Status</span>
                <span>Tool</span>
                <span>Result</span>
                <span className="text-right">Time</span>
              </div>

              {/* Rows */}
              {toolCalls.map((call, i) => (
                <div
                  key={i}
                  className="grid items-center px-5 py-2.5 text-[11px]"
                  style={{
                    gridTemplateColumns: '52px 180px 1fr 64px',
                    borderBottom: i < toolCalls.length - 1
                      ? '1px solid var(--gray-50)' : 'none',
                    background: 'transparent',
                  }}
                >
                  {/* Status badge */}
                  <span
                    className="font-bold text-[10px] px-1.5 py-0.5 rounded-md inline-block w-fit"
                    style={{
                      background: call.status === 'success' ? '#EDFAF4' : '#FEF3F2',
                      color:      call.status === 'success' ? '#0A7A4A' : '#B42318',
                    }}
                  >
                    {call.status === 'success' ? '✓ OK' : '✗ ERR'}
                  </span>

                  {/* Tool name */}
                  <span
                    className="font-mono truncate pr-2"
                    style={{ color: 'var(--gray-500)' }}
                    title={call.tool}
                  >
                    {call.tool}
                  </span>

                  {/* Summary */}
                  <span
                    className="truncate pr-2"
                    style={{ color: 'var(--gray-700)' }}
                    title={call.result_summary}
                  >
                    {call.result_summary}
                  </span>

                  {/* Elapsed */}
                  <span
                    className="tabular-nums text-right"
                    style={{ color: 'var(--gray-400)' }}
                  >
                    {call.elapsed_ms}ms
                  </span>
                </div>
              ))}

              {/* Footer summary */}
              {data?.elapsed_seconds && (
                <div
                  className="px-5 py-2.5 flex items-center gap-2 text-[11px]"
                  style={{
                    borderTop: '1px solid var(--border)',
                    color: 'var(--gray-400)',
                    background: 'var(--gray-50)',
                  }}
                >
                  <span
                    style={{
                      width: 6, height: 6,
                      borderRadius: '50%',
                      background: '#9061F9',
                      display: 'inline-block',
                    }}
                  />
                  {toolCalls.length} tool calls · {data.elapsed_seconds}s total
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}