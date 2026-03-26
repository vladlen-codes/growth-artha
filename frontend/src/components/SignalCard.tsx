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
  index?:  number
}

const TAG_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  'FII Buy':                { bg: '#EDFAF4', text: '#0A7A4A', border: '#A3F0CB' },
  'Inst. Buy':              { bg: '#EDFAF4', text: '#0A7A4A', border: '#A3F0CB' },
  '52W High':               { bg: '#EDFAF4', text: '#0A7A4A', border: '#A3F0CB' },
  'Earnings Beat':          { bg: '#EDFAF4', text: '#0A7A4A', border: '#A3F0CB' },
  '52W High Breakout':      { bg: '#EDFAF4', text: '#0A7A4A', border: '#A3F0CB' },
  'Double Bottom':          { bg: '#F9F5FF', text: '#6941C6', border: '#D6BBFB' },
  'Bullish RSI Divergence': { bg: '#F9F5FF', text: '#6941C6', border: '#D6BBFB' },
  'Support Test':           { bg: '#EFF8FF', text: '#1849A9', border: '#B2DDFF' },
  'Resistance Test':        { bg: '#EFF8FF', text: '#1849A9', border: '#B2DDFF' },
  'Vol Spike':              { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
  'FII Sell':               { bg: '#FEF3F2', text: '#B42318', border: '#FECDCA' },
  'Double Top':             { bg: '#FEF3F2', text: '#B42318', border: '#FECDCA' },
  'Bearish RSI Divergence': { bg: '#FEF3F2', text: '#B42318', border: '#FECDCA' },
  'Earnings Miss':          { bg: '#FEF3F2', text: '#B42318', border: '#FECDCA' },
  'Pledge Up':              { bg: '#FEF3F2', text: '#B42318', border: '#FECDCA' },
}

const SCORE_CONFIG = {
  act:   { color: '#16C97B', barBg: 'linear-gradient(90deg, #16C97B, #0EA063)' },
  watch: { color: '#D97706', barBg: 'linear-gradient(90deg, #F59E0B, #D97706)' },
  exit:  { color: '#F04438', barBg: 'linear-gradient(90deg, #F04438, #D92D20)' },
}

export default function SignalCard({ signal, variant, onClick, index = 0 }: Props) {
  const isPositive  = signal.price_change_pct >= 0
  const isHolding   = signal.portfolio_tag === 'holding'
  const isSector    = signal.portfolio_tag === 'sector'
  const absScore    = Math.abs(signal.score)
  const scoreWidth  = Math.min(Math.round(absScore * 100), 100)
  const cfg         = SCORE_CONFIG[variant]

  return (
    <button
      onClick={onClick}
      className="w-full text-left group"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 20px',
        background: 'transparent',
        cursor: 'pointer',
        transition: 'background 0.15s',
        borderBottom: '1px solid var(--border)',
        animationDelay: `${index * 0.04}s`,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--gray-50)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
    >
      {/* Symbol + price */}
      <div style={{ minWidth: 110 }}>
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className="font-bold text-[14px] tracking-tight"
            style={{ color: 'var(--gray-900)' }}
          >
            {signal.symbol}
          </span>
          {isHolding && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: 'var(--brand-light)',
                color: 'var(--brand-deeper)',
                border: '1px solid var(--brand-border)',
                letterSpacing: '0.04em',
              }}
            >
              HOLDING
            </span>
          )}
          {isSector && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: '#EFF8FF',
                color: '#1849A9',
                border: '1px solid #B2DDFF',
                letterSpacing: '0.04em',
              }}
            >
              SECTOR
            </span>
          )}
        </div>
        <div
          className="font-semibold text-[12px] tabular-nums"
          style={{ color: isPositive ? 'var(--brand-green)' : 'var(--red)' }}
        >
          ₹{signal.last_price?.toLocaleString('en-IN')}
          <span className="ml-1.5 font-medium">
            {isPositive ? '+' : ''}{signal.price_change_pct}%
          </span>
        </div>
      </div>

      {/* Score + bar + tags */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Score + bar */}
        <div className="flex items-center gap-2.5 mb-2">
          <span
            className="font-bold text-[13px] tabular-nums"
            style={{ color: cfg.color, minWidth: 40, textAlign: 'right' }}
          >
            {signal.score > 0 ? '+' : ''}{signal.score}
          </span>
          <div
            style={{
              flex: 1,
              height: 4,
              background: 'var(--gray-100)',
              borderRadius: 99,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${scoreWidth}%`,
                background: cfg.barBg,
                borderRadius: 99,
                transition: 'width 0.5s ease',
              }}
            />
          </div>
          <span
            className="text-[10px] font-medium whitespace-nowrap"
            style={{ color: 'var(--gray-400)' }}
          >
            {signal.signal_count} sig{signal.signal_count !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {signal.tags.slice(0, 4).map(tag => {
            const ts = TAG_STYLES[tag]
            return (
              <span
                key={tag}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: ts?.bg ?? 'var(--gray-100)',
                  color: ts?.text ?? 'var(--gray-600)',
                  border: `1px solid ${ts?.border ?? 'var(--gray-200)'}`,
                }}
              >
                {tag}
              </span>
            )
          })}
        </div>

        {/* AI card preview */}
        {signal.ai_card && (
          <p
            className="text-[11px] mt-1.5 truncate"
            style={{ color: 'var(--gray-400)', maxWidth: 400 }}
          >
            {signal.ai_card}
          </p>
        )}
      </div>

      {/* Right arrow */}
      <div
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          border: '1px solid var(--border)',
          color: 'var(--gray-400)',
          fontSize: 14,
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLDivElement
          el.style.background = cfg.color
          el.style.borderColor = cfg.color
          el.style.color = '#fff'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLDivElement
          el.style.background = 'transparent'
          el.style.borderColor = 'var(--border)'
          el.style.color = 'var(--gray-400)'
        }}
      >
        →
      </div>
    </button>
  )
}