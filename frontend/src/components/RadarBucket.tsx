import SignalCard from './SignalCard'

interface Signal {
  symbol: string
  score: number
  tags: string[]
  ai_card: string | null
  portfolio_tag?: string
  last_price?: number
  price_change_pct?: number
  signal_count?: number
}

interface Props {
  title: string
  subtitle: string
  signals: Signal[]
  variant: 'act' | 'watch' | 'exit'
  onSelect: (symbol: string) => void
}

const VARIANT_STYLES = {
  act:   { border: 'border-brand-green', badge: 'bg-brand-light text-brand-dark',
           dot: 'bg-brand-green' },
  watch: { border: 'border-amber-300',   badge: 'bg-amber-50 text-amber-700',
           dot: 'bg-amber-400' },
  exit:  { border: 'border-red-300',     badge: 'bg-red-50 text-red-600',
           dot: 'bg-red-400' },
}

export default function RadarBucket({ title, subtitle, signals, variant, onSelect }: Props) {
  const styles = VARIANT_STYLES[variant]

  if (signals.length === 0) return null

  return (
    <div className={`bg-white rounded-xl border-2 ${styles.border} overflow-hidden`}>
      {/* Bucket header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${styles.dot}`} />
        <div>
          <span className="font-semibold text-gray-900 text-sm">{title}</span>
          <span className="text-xs text-gray-400 ml-2">{subtitle}</span>
        </div>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5
                          rounded-full ${styles.badge}`}>
          {signals.length} stock{signals.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Signal cards */}
      <div className="divide-y divide-gray-50">
        {signals.map(signal => (
          <SignalCard
            key={signal.symbol}
            signal={signal}
            variant={variant}
            onClick={() => onSelect(signal.symbol)}
          />
        ))}
      </div>
    </div>
  )
}