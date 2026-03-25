import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

export default function MarketBar() {
  const { data } = useQuery({
    queryKey: ['market-overview'],
    queryFn:  () => api.get('/stocks/market/overview').then(r => r.data),
    refetchInterval: 30_000,   // refresh every 30 seconds
    staleTime: 25_000,
  })

  const nifty = data?.nifty50
  if (!nifty) return null

  const isUp = (nifty.change_pct ?? 0) >= 0

  return (
    <div className="bg-[#FAFAFA] border-b border-gray-100
                    px-6 py-1.5 flex items-center gap-6 text-[12px]">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gray-700">NIFTY 50</span>
        <span className={`font-bold tabular-nums
          ${isUp ? 'text-[#1D9E75]' : 'text-[#EF4444]'}`}>
          {nifty.last?.toLocaleString('en-IN')}
        </span>
        <span className={`text-[11px] font-medium
          ${isUp ? 'text-[#1D9E75]' : 'text-[#EF4444]'}`}>
          {isUp ? '+' : ''}{nifty.change_pct}%
        </span>
      </div>
      <div className="flex items-center gap-3 text-gray-400">
        <span className="text-[#1D9E75] font-medium">
          ▲ {nifty.advances} adv
        </span>
        <span className="text-[#EF4444] font-medium">
          ▼ {nifty.declines} dec
        </span>
      </div>
      <div className="ml-auto flex items-center gap-1.5 text-gray-400">
        <div className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] animate-pulse" />
        Live · updates every 30s
      </div>
    </div>
  )
}
