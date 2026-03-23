interface Signal {
  symbol: string
  score: number
  tags: string[]
  ai_card: string | null
  portfolio_tag: string
  last_price: number
  price_change_pct: number
  signal_count: number
}

interface Props {
  signal: Signal
  variant: 'act' | 'watch' | 'exit'
  onClick: () => void
}

export default function SignalCard({ signal, variant, onClick }: Props) {
  const isPositive = signal.price_change_pct >= 0
  const isHolding  = signal.portfolio_tag === 'holding'
  const isSector   = signal.portfolio_tag === 'sector'

  return (
    <button
      onClick={onClick}
      className="w-full px-5 py-4 flex items-start gap-4 hover:bg-gray-50
                 transition-colors text-left group"
    >
      {/* Symbol + portfolio tag */}
      <div className="min-w-[90px]">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-gray-900 text-sm">{signal.symbol}</span>
          {isHolding && (
            <span className="text-[10px] font-medium bg-brand-light text-brand-dark
                             px-1.5 py-0.5 rounded-full">
              Holding
            </span>
          )}
          {isSector && (
            <span className="text-[10px] font-medium bg-blue-50 text-blue-600
                             px-1.5 py-0.5 rounded-full">
              Sector
            </span>
          )}
        </div>
        <div className={`text-xs font-medium mt-0.5
          ${isPositive ? 'text-brand-green' : 'text-red-500'}`}>
          ₹{signal.last_price.toLocaleString('en-IN')}
          <span className="ml-1">
            {isPositive ? '+' : ''}{signal.price_change_pct}%
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <ScoreBar score={signal.score} variant={variant} />
          <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
            {signal.signal_count} signal{signal.signal_count > 1 ? 's' : ''}
          </span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {signal.tags.slice(0, 4).map(tag => (
            <span key={tag}
                  className="text-[11px] bg-gray-100 text-gray-600
                             px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>

        {/* AI card preview */}
        {signal.ai_card && (
          <p className="text-xs text-gray-400 mt-1.5 line-clamp-1">
            {signal.ai_card}
          </p>
        )}
      </div>

      {/* Arrow */}
      <div className="text-gray-300 group-hover:text-gray-500
                      transition-colors self-center text-lg">
        →
      </div>
    </button>
  )
}

function ScoreBar({ score, variant }: { score: number; variant: string }) {
  const abs   = Math.abs(score)
  const width = Math.round(abs * 100)
  const color = variant === 'exit'
    ? 'bg-red-400'
    : variant === 'act'
    ? 'bg-brand-green'
    : 'bg-amber-400'

  return (
    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}