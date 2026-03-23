interface Props {
  totalScanned: number
  totalSignals: number
  actCount: number
  watchCount: number
  exitCount: number
}

export default function StatsBar({
  totalScanned, totalSignals, actCount, watchCount, exitCount
}: Props) {
  const stats = [
    { label: 'Stocks scanned',  value: totalScanned },
    { label: 'Signals found',   value: totalSignals },
    { label: 'Act now',         value: actCount,  color: 'text-brand-green' },
    { label: 'Watch',           value: watchCount, color: 'text-amber-600' },
    { label: 'Exit radar',      value: exitCount,  color: 'text-red-500' },
  ]

  return (
    <div className="grid grid-cols-5 gap-3">
      {stats.map(s => (
        <div key={s.label}
             className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-center">
          <div className={`text-xl font-semibold ${s.color || 'text-gray-800'}`}>
            {s.value}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  )
}