import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBolt, faSpinner } from '@fortawesome/free-solid-svg-icons'

interface Props {
  status:           string
  universe:         string
  onUniverseChange: (u: string) => void
  onClick:          () => void
}

const UNIVERSES = [
  { value: 'nifty50',  label: 'Nifty 50',  sub: '50 stocks · ~1 min'    },
  { value: 'nifty500', label: 'Nifty 500', sub: '500 stocks · ~5 min'   },
  { value: 'full',     label: 'All NSE',   sub: '2700+ stocks · ~20 min' },
]

export default function RunRadarButton({ status, universe, onUniverseChange, onClick }: Props) {
  const isLoading = status === 'pending' || status === 'running'
  const selected  = UNIVERSES.find(u => u.value === universe) || UNIVERSES[0]

  return (
    <div className="flex items-center gap-2.5">
      {/* Universe selector */}
      <div
        className="flex overflow-hidden text-[12px] font-medium"
        style={{
          border: '1px solid var(--border)',
          borderRadius: 9,
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        {UNIVERSES.map(u => (
          <button
            key={u.value}
            disabled={isLoading}
            onClick={() => onUniverseChange(u.value)}
            title={u.sub}
            style={{
              padding: '7px 13px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              border: 'none',
              fontWeight: 500,
              fontSize: 12,
              transition: 'background 0.15s, color 0.15s',
              background: universe === u.value ? 'var(--brand-green)' : 'var(--surface)',
              color: universe === u.value ? '#fff' : 'var(--gray-500)',
              borderRight: '1px solid var(--border)',
            }}
          >
            {u.label}
          </button>
        ))}
      </div>

      {/* Run button */}
      <button
        onClick={onClick}
        disabled={isLoading}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 20px',
          borderRadius: 9,
          fontWeight: 700,
          fontSize: 13,
          border: 'none',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s',
          background: isLoading
            ? 'var(--gray-100)'
            : 'linear-gradient(135deg, var(--brand-green) 0%, var(--brand-dark) 100%)',
          color: isLoading ? 'var(--gray-400)' : '#fff',
        }}
        onMouseEnter={e => {
          if (!isLoading) (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'
        }}
        onMouseLeave={e => {
          if (!isLoading) (e.currentTarget as HTMLButtonElement).style.opacity = '1'
        }}
      >
        {isLoading ? (
          <>
            <FontAwesomeIcon icon={faSpinner} spin style={{ fontSize: 13 }} />
            Scanning {selected.sub.split('·')[0].trim()}…
          </>
        ) : (
          <><FontAwesomeIcon icon={faBolt} style={{ fontSize: 12 }} /> Run Radar</>
        )}
      </button>
    </div>
  )
}