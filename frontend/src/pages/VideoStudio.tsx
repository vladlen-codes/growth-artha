import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faClapperboard } from '@fortawesome/free-solid-svg-icons'
import { usePortfolioStore } from '../store/portfolioStore'
import VideoStudioPanel from '../components/VideoStudioPanel'

interface Props {
  onBack: () => void
}

export default function VideoStudio({ onBack }: Props) {
  const { getSymbols } = usePortfolioStore()

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 0',
          color: 'var(--gray-500)',
          fontSize: 13,
          fontWeight: 500,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--gray-900)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--gray-500)')}
      >
        <FontAwesomeIcon icon={faArrowLeft} style={{ fontSize: 11 }} />
        Back to Dashboard
      </button>

      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '18px 20px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <FontAwesomeIcon icon={faClapperboard} style={{ color: 'var(--brand-dark)' }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Video Studio
          </div>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--gray-900)', margin: 0 }}>
          Render Daily Market Shorts
        </h1>
        <p style={{ marginTop: 8, marginBottom: 0, color: 'var(--gray-600)', fontSize: 13 }}>
          Generate storyboards and queue render jobs from live radar outputs. Use Auto mode to prefer MP4 where available.
        </p>
      </section>

      <VideoStudioPanel portfolio={getSymbols()} />
    </div>
  )
}
