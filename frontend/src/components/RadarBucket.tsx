import SignalCard from './SignalCard'

interface Props {
  title:    string
  subtitle: string
  signals:  any[]
  variant:  'act' | 'watch' | 'exit'
  onSelect: (symbol: string) => void
}

const VARIANT = {
  act: {
    color:      '#16C97B',
    light:      '#EDFAF4',
    border:     '#A3F0CB',
    countBg:    '#EDFAF4',
    countText:  '#0A7A4A',
    leftBorder: '#16C97B',
    label:      'ACT',
    labelBg:    'rgba(22, 201, 123, 0.12)',
    labelColor: '#0A7A4A',
  },
  watch: {
    color:      '#F59E0B',
    light:      '#FFFBEB',
    border:     '#FDE68A',
    countBg:    '#FFFBEB',
    countText:  '#92400E',
    leftBorder: '#F59E0B',
    label:      'WATCH',
    labelBg:    'rgba(245, 158, 11, 0.12)',
    labelColor: '#92400E',
  },
  exit: {
    color:      '#F04438',
    light:      '#FEF3F2',
    border:     '#FECDCA',
    countBg:    '#FEF3F2',
    countText:  '#B42318',
    leftBorder: '#F04438',
    label:      'EXIT',
    labelBg:    'rgba(240, 68, 56, 0.12)',
    labelColor: '#B42318',
  },
}

export default function RadarBucket({ title, subtitle, signals, variant, onSelect }: Props) {
  if (!signals?.length) return null
  const v = VARIANT[variant]

  return (
    <div className="animate-fade-in-up mb-4">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-3 px-1">
        {/* Bullet */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: v.color,
            boxShadow: `0 0 0 3px ${v.light}`,
            flexShrink: 0,
          }}
        />

        {/* Label badge */}
        <span
          className="text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full"
          style={{ background: v.labelBg, color: v.labelColor }}
        >
          {v.label}
        </span>

        <span
          className="font-bold text-[15px] tracking-tight"
          style={{ color: 'var(--gray-900)' }}
        >
          {title}
        </span>
        <span
          className="text-[12px]"
          style={{ color: 'var(--gray-400)' }}
        >
          {subtitle}
        </span>

        {/* Count badge */}
        <span
          className="ml-auto text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
          style={{ background: v.countBg, color: v.countText, border: `1px solid ${v.border}` }}
        >
          {signals.length} {signals.length === 1 ? 'stock' : 'stocks'}
        </span>
      </div>

      {/* Card list */}
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 14,
          border: '1px solid var(--border)',
          borderLeft: `4px solid ${v.leftBorder}`,
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
        }}
      >
        {signals.map((signal, i) => (
          <SignalCard
            key={signal.symbol}
            signal={signal}
            variant={variant}
            onClick={() => onSelect(signal.symbol)}
            index={i}
          />
        ))}
      </div>
    </div>
  )
}