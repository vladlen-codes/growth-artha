interface Props {
  signal: any
  explanation?: string
  loading: boolean
}

export default function SignalExplainer({ signal, explanation, loading }: Props) {
  if (!signal) {
    return (
      <div className="text-center py-10 text-sm text-gray-400">
        No active signal for this stock in today's scan.
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Score breakdown */}
      <div>
        <h3 className="text-xs font-medium text-gray-500 uppercase
                       tracking-wide mb-3">
          Score breakdown
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Base score',   value: signal.base_score,
              desc: 'Sum of all signal weights' },
            { label: 'Convergence',  value: `+${signal.convergence_bonus}`,
              desc: `${signal.signal_count} signals co-occurring` },
            { label: 'Final score',  value: signal.score,
              desc: signal.portfolio_tag === 'holding'
                ? '1.4× portfolio multiplier applied'
                : signal.portfolio_tag === 'sector'
                ? '1.2× sector multiplier applied'
                : 'No portfolio multiplier' },
          ].map(s => (
            <div key={s.label}
                 className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-lg font-semibold text-gray-900">
                {s.value}
              </div>
              <div className="text-xs font-medium text-gray-600 mt-0.5">
                {s.label}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {s.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Individual signals */}
      <div>
        <h3 className="text-xs font-medium text-gray-500 uppercase
                       tracking-wide mb-3">
          Triggered signals
        </h3>
        <div className="space-y-2">
          {signal.signals?.map((s: any, i: number) => (
            <div key={i}
                 className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
              <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0
                ${s.weight >= 0 ? 'bg-brand-green' : 'bg-red-400'}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-800">
                    {s.name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </span>
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded
                    ${s.weight >= 0
                      ? 'bg-brand-light text-brand-dark'
                      : 'bg-red-50 text-red-600'
                    }`}>
                    {s.weight > 0 ? '+' : ''}{s.weight}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{s.evidence}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Source: {s.source}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gemini explanation */}
      <div>
        <h3 className="text-xs font-medium text-gray-500 uppercase
                       tracking-wide mb-3">
          AI analysis
        </h3>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i}
                   className={`h-4 bg-gray-100 rounded animate-pulse
                     ${i === 3 ? 'w-2/3' : 'w-full'}`}
              />
            ))}
          </div>
        ) : explanation ? (
          <div className="bg-brand-light/40 rounded-lg p-4 text-sm
                          text-gray-700 leading-relaxed border border-brand-light">
            {explanation}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-400">
            AI analysis unavailable: run the radar to generate fresh insights.
          </div>
        )}
      </div>

    </div>
  )
}