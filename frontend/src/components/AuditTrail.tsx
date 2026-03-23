import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

interface Props { jobId: string }

export default function AuditTrail({ jobId }: Props) {
  const [open, setOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ['audit', jobId],
    queryFn:  () => api.get(`/api/radar/audit/${jobId}`).then(r => r.data),
    enabled:  !!jobId && open,
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-3.5 flex items-center justify-between
                   hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-400" />
          <span className="text-sm font-medium text-gray-700">
            Agent Reasoning Trail
          </span>
          <span className="text-xs text-gray-400">
            — every decision the agents made
          </span>
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && data && (
        <div className="border-t border-gray-100 p-4 space-y-1 max-h-72 overflow-y-auto">
          {data.tool_calls?.map((call: any, i: number) => (
            <div key={i}
                 className="flex items-start gap-3 text-xs py-1.5
                            border-b border-gray-50 last:border-0">
              <span className={`font-mono px-1.5 py-0.5 rounded text-[10px]
                font-medium flex-shrink-0
                ${call.status === 'success'
                  ? 'bg-brand-light text-brand-dark'
                  : 'bg-red-50 text-red-600'
                }`}>
                {call.status === 'success' ? 'OK' : 'ERR'}
              </span>
              <span className="font-mono text-gray-500 flex-shrink-0">
                {call.tool}
              </span>
              <span className="text-gray-600 flex-1">{call.result_summary}</span>
              <span className="text-gray-300 flex-shrink-0">{call.elapsed_ms}ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}