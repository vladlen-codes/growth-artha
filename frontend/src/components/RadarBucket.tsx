import SignalCard from './SignalCard'

interface Props {
  title:    string
  subtitle: string
  signals:  any[]
  variant:  'act' | 'watch' | 'exit'
  onSelect: (symbol: string) => void
}

const STYLES = {
  act: {
    dot:        'bg-[#1D9E75]',
    border:     'border-l-[3px] border-l-[#1D9E75]',
    count:      'bg-[#F0FDF8] text-[#065F46]',
    titleColor: 'text-gray-900',
  },
  watch: {
    dot:        'bg-[#F59E0B]',
    border:     'border-l-[3px] border-l-[#F59E0B]',
    count:      'bg-[#FFFBEB] text-[#92400E]',
    titleColor: 'text-gray-900',
  },
  exit: {
    dot:        'bg-[#EF4444]',
    border:     'border-l-[3px] border-l-[#EF4444]',
    count:      'bg-[#FEF2F2] text-[#991B1B]',
    titleColor: 'text-gray-900',
  },
}

export default function RadarBucket({ title, subtitle, signals, variant, onSelect }: Props) {
  if (!signals?.length) return null
  const s = STYLES[variant]

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2.5 mb-2.5 px-1">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
        <span className={`text-[14px] font-bold tracking-tight ${s.titleColor}`}>
          {title}
        </span>
        <span className="text-[12px] text-gray-400">{subtitle}</span>
        <span className={`ml-auto text-[11px] font-semibold
                          px-2.5 py-0.5 rounded-full ${s.count}`}>
          {signals.length} stock{signals.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className={`bg-white rounded-xl border border-gray-200
                       overflow-hidden ${s.border}`}>
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