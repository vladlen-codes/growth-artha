interface Props {
  status:   string
  universe: string
  onUniverseChange: (u: string) => void
  onClick:  () => void
}

const UNIVERSES = [
  { value: "nifty50",  label: "Nifty 50",   sub: "50 stocks · ~1 min"   },
  { value: "nifty500", label: "Nifty 500",  sub: "500 stocks · ~5 min"  },
  { value: "full",     label: "All NSE",    sub: "2700+ stocks · ~20 min" },
]

export default function RunRadarButton({
  status, universe, onUniverseChange, onClick
}: Props) {
  const isLoading = status === 'pending' || status === 'running'
  const selected  = UNIVERSES.find(u => u.value === universe) || UNIVERSES[0]

  return (
    <div className="flex items-center gap-2">
      {/* Universe selector */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden
                      text-[12px] font-medium">
        {UNIVERSES.map(u => (
          <button
            key={u.value}
            disabled={isLoading}
            onClick={() => onUniverseChange(u.value)}
            title={u.sub}
            className={`px-3 py-2 transition-colors
              ${universe === u.value
                ? 'bg-[#1D9E75] text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
          >
            {u.label}
          </button>
        ))}
      </div>

      {/* Run button */}
      <button
        onClick={onClick}
        disabled={isLoading}
        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg
                    font-semibold text-[13px] transition-all whitespace-nowrap
          ${isLoading
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-[#1D9E75] text-white hover:bg-[#0F6E56] active:scale-95'
          }`}
      >
        {isLoading ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-gray-300
                            border-t-transparent rounded-full animate-spin" />
            Scanning {selected.sub.split('·')[0].trim()}...
          </>
        ) : (
          <>⚡ Run Radar</>
        )}
      </button>
    </div>
  )
}