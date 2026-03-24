interface Signal {
  symbol:           string
  score:            number
  tags:             string[]
  ai_card:          string | null
  portfolio_tag:    string
  last_price:       number
  price_change_pct: number
  signal_count:     number
}

interface Props {
  signal:  Signal
  variant: 'act' | 'watch' | 'exit'
  onClick: () => void
}

const TAG_STYLES: Record<string, string> = {
  'FII Buy':           'bg-[#F0FDF8] text-[#065F46] border border-[#A7F3D0]',
  'Inst. Buy':         'bg-[#F0FDF8] text-[#065F46] border border-[#A7F3D0]',
  '52W High':          'bg-[#F0FDF8] text-[#065F46] border border-[#A7F3D0]',
  'Earnings Beat':     'bg-[#F0FDF8] text-[#065F46] border border-[#A7F3D0]',
  '52W High Breakout': 'bg-[#F0FDF8] text-[#065F46] border border-[#A7F3D0]',
  'Double Bottom':     'bg-[#FAF5FF] text-[#6B21A8] border border-[#D8B4FE]',
  'Bullish RSI Divergence': 'bg-[#FAF5FF] text-[#6B21A8] border border-[#D8B4FE]',
  'Support Test':      'bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE]',
  'Resistance Test':   'bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE]',
  'Vol Spike':         'bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]',
  'FII Sell':          'bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]',
  'Double Top':        'bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]',
  'Bearish RSI Divergence': 'bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]',
  'Earnings Miss':     'bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]',
  'Pledge Up':         'bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]',
}

const DEFAULT_TAG = 'bg-gray-100 text-gray-600 border border-gray-200'

const FILL_COLOR = {
  act:   'bg-[#1D9E75]',
  watch: 'bg-[#F59E0B]',
  exit:  'bg-[#EF4444]',
}

const SCORE_COLOR = {
  act:   'text-[#1D9E75]',
  watch: 'text-[#D97706]',
  exit:  'text-[#EF4444]',
}

export default function SignalCard({ signal, variant, onClick }: Props) {
  const isPositive  = signal.price_change_pct >= 0
  const isHolding   = signal.portfolio_tag === 'holding'
  const isSector    = signal.portfolio_tag === 'sector'
  const absScore    = Math.abs(signal.score)
  const scoreWidth  = Math.round(absScore * 100)

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-4
                 hover:bg-gray-50/70 transition-colors text-left group
                 border-b border-gray-100 last:border-0"
    >
      {/* Symbol + price */}
      <div className="min-w-[108px]">
        <div className="font-bold text-[14px] text-gray-900
                        tracking-tight mb-1">
          {signal.symbol}
        </div>
        <div className={`text-[12px] font-semibold
          ${isPositive ? 'text-[#1D9E75]' : 'text-[#EF4444]'}`}>
          ₹{signal.last_price.toLocaleString('en-IN')}
          <span className="ml-1.5 font-medium">
            {isPositive ? '+' : ''}{signal.price_change_pct}%
          </span>
        </div>
      </div>

      {/* Score + tags + AI preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-2">
          <span className={`font-bold text-[13px] tabular-nums
                            min-w-[42px] text-right ${SCORE_COLOR[variant]}`}>
            {signal.score > 0 ? '+' : ''}{signal.score}
          </span>
          <div className="flex-1 h-[3px] bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${FILL_COLOR[variant]}`}
              style={{ width: `${scoreWidth}%` }}
            />
          </div>
          <span className="text-[11px] text-gray-400 whitespace-nowrap">
            {signal.signal_count} signal{signal.signal_count !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {signal.tags.slice(0, 4).map(tag => (
            <span
              key={tag}
              className={`text-[11px] font-semibold px-2 py-0.5
                          rounded-[4px] leading-tight
                          ${TAG_STYLES[tag] || DEFAULT_TAG}`}
            >
              {tag}
            </span>
          ))}
          {isHolding && (
            <span className="text-[10px] font-bold px-1.5 py-0.5
                             rounded-[4px] bg-[#ECFDF5] text-[#064E3B]
                             border border-[#6EE7B7] leading-tight">
              Holding
            </span>
          )}
          {isSector && (
            <span className="text-[10px] font-bold px-1.5 py-0.5
                             rounded-[4px] bg-[#EFF6FF] text-[#1E3A8A]
                             border border-[#BFDBFE] leading-tight">
              Sector
            </span>
          )}
        </div>

        {signal.ai_card && (
          <p className="text-[11px] text-gray-400 truncate max-w-[420px]">
            {signal.ai_card}
          </p>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isHolding && (
          <span className="text-[10px] font-bold px-2 py-1
                           rounded-full bg-[#F0FDF8] text-[#065F46]
                           border border-[#A7F3D0] whitespace-nowrap">
            In portfolio
          </span>
        )}
        <div className="w-7 h-7 rounded-[7px] border border-gray-200
                        flex items-center justify-center text-gray-400
                        text-sm transition-all
                        group-hover:bg-[#1D9E75] group-hover:border-[#1D9E75]
                        group-hover:text-white">
          →
        </div>
      </div>
    </button>
  )
}