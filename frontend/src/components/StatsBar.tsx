interface Props {
  totalScanned:    number
  liquidStocks?:   number
  analysedStocks?: number
  totalSignals:    number
  actCount:        number
  watchCount:      number
  exitCount:       number
}

interface StatItem {
  label: string
  value: number | string
  accent: 'act' | 'watch' | 'exit' | null
}

export default function StatsBar({
  totalScanned, liquidStocks, analysedStocks, totalSignals, actCount, watchCount, exitCount,
}: Props) {
  const stats: StatItem[] = [
    { label: 'Universe',      value: totalScanned.toLocaleString('en-IN'),              accent: null    },
    { label: 'Liquid stocks', value: (liquidStocks  ?? '-').toLocaleString(),            accent: null    },
    { label: 'Analysed',      value: (analysedStocks ?? totalScanned).toLocaleString(),  accent: null    },
    { label: 'Signals found', value: totalSignals,                                       accent: null    },
    { label: 'Act now',       value: actCount,                                           accent: 'act'   },
    { label: 'Watch',         value: watchCount,                                         accent: 'watch' },
    { label: 'Exit radar',    value: exitCount,                                          accent: 'exit'  },
  ]

  const ACCENT_STYLES = {
    act:   { top: 'var(--act-color)',   text: 'var(--act-color)',   bg: 'var(--brand-light)' },
    watch: { top: 'var(--watch-color)', text: 'var(--watch-color)', bg: 'var(--amber-light)' },
    exit:  { top: 'var(--exit-color)', text: 'var(--exit-color)',   bg: 'var(--red-light)' },
  }

  return (
    <div
      className="grid gap-2.5 animate-fade-in"
      style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}
    >
      {stats.map(({ label, value, accent }, i) => {
        const a = accent ? ACCENT_STYLES[accent] : null
        return (
          <div
            key={label}
            className="animate-fade-in-up"
            style={{
              background: a ? a.bg : 'var(--surface)',
              border: '1px solid var(--border)',
              borderTop: a ? `3px solid ${a.top}` : '1px solid var(--border)',
              borderRadius: 12,
              padding: '14px 16px',
              boxShadow: 'var(--shadow-card)',
              animationDelay: `${i * 0.04}s`,
            }}
          >
            <div
              className="font-bold text-[22px] tabular-nums leading-none mb-1.5"
              style={{ color: a ? a.text : 'var(--gray-900)' }}
            >
              {value}
            </div>
            <div
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--gray-400)' }}
            >
              {label}
            </div>
          </div>
        )
      })}
    </div>
  )
}