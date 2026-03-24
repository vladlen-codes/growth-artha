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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-5 py-3.5
                   hover:bg-gray-50 transition-colors"
      >
        <div className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
        <span className="text-[13px] font-semibold text-gray-800">
          Agent reasoning trail
        </span>
        <span className="text-[12px] text-gray-400">
          — every decision the agents made
        </span>
        <span className="ml-auto text-gray-300 text-sm">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {data?.tool_calls?.length ? (
            <div className="divide-y divide-gray-50">
              {data.tool_calls.map((call: any, i: number) => (
                <div key={i}
                     className="flex items-center gap-3 px-5 py-2.5 text-[11px]">
                  <span className={`font-bold px-1.5 py-0.5 rounded-[3px]
                                    min-w-[28px] text-center text-[10px]
                    ${call.status === 'success'
                      ? 'bg-[#F0FDF8] text-[#065F46]'
                      : 'bg-[#FEF2F2] text-[#991B1B]'
                    }`}>
                    {call.status === 'success' ? 'OK' : 'ERR'}
                  </span>
                  <span className="font-mono text-gray-500 min-w-[160px]">
                    {call.tool}
                  </span>
                  <span className="text-gray-700 flex-1">
                    {call.result_summary}
                  </span>
                  <span className="text-gray-300 tabular-nums">
                    {call.elapsed_ms}ms
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-4 text-[12px] text-gray-400">
              Loading agent log...
            </div>
          )}
        </div>
      )}
    </div>
  )
}