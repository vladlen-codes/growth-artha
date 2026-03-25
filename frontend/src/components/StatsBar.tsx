interface Props {
  totalScanned:  number
  liquidStocks?: number
  analysedStocks?: number
  totalSignals:  number
  actCount:      number
  watchCount:    number
  exitCount:     number
}

export default function StatsBar({
  totalScanned, liquidStocks, analysedStocks, totalSignals, actCount, watchCount, exitCount
}: Props) {
  return (
    <div className="grid grid-cols-7 gap-2.5 mb-5">
      {[
        { label: 'Universe',          value: totalScanned.toLocaleString('en-IN'), accent: null },
        { label: 'Liquid stocks',     value: liquidStocks  || '—', accent: null },
        { label: 'Analysed',          value: analysedStocks || totalScanned, accent: null },
        { label: 'Signals found',     value: totalSignals,  accent: null },
        { label: 'Act now',           value: actCount,      accent: 'act'   },
        { label: 'Watch',             value: watchCount,    accent: 'watch' },
        { label: 'Exit radar',        value: exitCount,     accent: 'exit'  },
      ].map(({ label, value, accent }) => (
        <div
          key={label}
          className={`bg-white rounded-[10px] border border-gray-200
                      px-4 py-3.5
                      ${accent === 'act'   ? 'border-t-[3px] border-t-[#1D9E75]' : ''}
                      ${accent === 'watch' ? 'border-t-[3px] border-t-[#F59E0B]' : ''}
                      ${accent === 'exit'  ? 'border-t-[3px] border-t-[#EF4444]' : ''}
                      `}
        >
          <div className={`text-[26px] font-bold tracking-tight leading-none mb-1
            ${accent === 'act'   ? 'text-[#1D9E75]' : ''}
            ${accent === 'watch' ? 'text-[#D97706]' : ''}
            ${accent === 'exit'  ? 'text-[#EF4444]' : ''}
            ${!accent            ? 'text-gray-900'  : ''}
          `}>
            {value}
          </div>
          <div className="text-[11px] text-gray-400 font-medium">{label}</div>
        </div>
      ))}
    </div>
  )
}