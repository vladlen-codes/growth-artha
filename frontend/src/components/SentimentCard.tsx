import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

interface Props { symbol: string }

export default function SentimentCard({ symbol }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sentiment', symbol],
    queryFn:  () => api.get(`/stocks/${symbol}/sentiment`).then(r => r.data),
    staleTime: 1000 * 60 * 60 * 4,   // 4 hours — matches backend cache
  })

  if (isLoading) return <SentimentSkeleton />
  if (isError || !data) return <SentimentError />
  if (!data.sentiment_score && data.sentiment_score !== 0) return <SentimentUnavailable />

  const score    = data.sentiment_score as number
  const isPos    = score >= 0.3
  const isNeg    = score <= -0.3
  const barWidth = Math.round(Math.abs(score) * 100)

  const labelStyle = isPos
    ? 'bg-brand-light text-brand-dark'
    : isNeg
    ? 'bg-red-50 text-red-600'
    : 'bg-amber-50 text-amber-700'

  const barColor = isPos
    ? 'bg-brand-green'
    : isNeg
    ? 'bg-red-400'
    : 'bg-amber-400'

  return (
    <div className="space-y-5">

      {/* Sentiment score header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className={`text-sm font-semibold px-3 py-1
                            rounded-full ${labelStyle}`}>
            {data.sentiment_label}
          </span>
          <p className="text-xs text-gray-400 mt-2">
            Based on {data.headline_count} recent headlines ·{' '}
            {formatAge(data.analysed_at)}
          </p>
        </div>
        {/* Score bar */}
        <div className="flex-1 max-w-[160px]">
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>−1.0</span>
            <span>0</span>
            <span>+1.0</span>
          </div>
          <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
            {/* Centre line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300" />
            {/* Score fill */}
            <div
              className={`absolute top-0 bottom-0 rounded-full ${barColor}`}
              style={{
                left:  score >= 0 ? '50%' : `${50 - barWidth / 2}%`,
                width: `${barWidth / 2}%`,
              }}
            />
          </div>
          <div className="text-center text-xs font-medium text-gray-700 mt-1">
            {score > 0 ? '+' : ''}{score.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-700 leading-relaxed">{data.summary}</p>
      </div>

      {/* Themes + catalysts + risks */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[11px] font-medium text-gray-400 uppercase
                        tracking-wide mb-2">Themes</p>
          <div className="space-y-1">
            {data.key_themes.map((t: string) => (
              <span key={t}
                    className="block text-xs bg-gray-100 text-gray-600
                               px-2.5 py-1 rounded-full">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-medium text-gray-400 uppercase
                        tracking-wide mb-2">Catalysts</p>
          <div className="space-y-1">
            {data.catalysts.length > 0
              ? data.catalysts.map((c: string) => (
                  <div key={c}
                       className="flex items-start gap-1.5 text-xs text-brand-dark">
                    <span className="text-brand-green mt-0.5">+</span>
                    {c}
                  </div>
                ))
              : <p className="text-xs text-gray-400">None identified</p>
            }
          </div>
        </div>
        <div>
          <p className="text-[11px] font-medium text-gray-400 uppercase
                        tracking-wide mb-2">Risk flags</p>
          <div className="space-y-1">
            {data.risk_flags.length > 0
              ? data.risk_flags.map((r: string) => (
                  <div key={r}
                       className="flex items-start gap-1.5 text-xs text-red-600">
                    <span className="mt-0.5">!</span>
                    {r}
                  </div>
                ))
              : <p className="text-xs text-gray-400">None identified</p>
            }
          </div>
        </div>
      </div>

      {/* Top headline */}
      {data.top_headline && (
        <div className="border-l-2 border-brand-green pl-3">
          <p className="text-[11px] font-medium text-gray-400 mb-1">
            Top headline
          </p>
          <p className="text-sm text-gray-700 italic">
            "{data.top_headline}"
          </p>
        </div>
      )}

      {/* Headlines list */}
      {data.headlines?.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-gray-400 uppercase
                        tracking-wide mb-2">
            All headlines
          </p>
          <div className="space-y-2">
            {data.headlines.map((h: any, i: number) => (
              <a
                key={i}
                href={h.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 text-xs text-gray-600
                           hover:text-brand-green transition-colors group"
              >
                <span className="text-gray-300 group-hover:text-brand-green
                                 mt-0.5 flex-shrink-0">→</span>
                <div>
                  <span>{h.title}</span>
                  <span className="text-gray-400 ml-1">· {h.source}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

// ── Skeleton / error states ────────────────────────────────────────────────

function SentimentSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-32 bg-gray-100 rounded-full" />
      <div className="h-16 bg-gray-100 rounded-lg" />
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-gray-100 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

function SentimentError() {
  return (
    <div className="text-center py-8 text-sm text-red-500">
      Could not load news sentiment. Try again shortly.
    </div>
  )
}

function SentimentUnavailable() {
  return (
    <div className="text-center py-8 text-sm text-gray-400">
      News sentiment unavailable for this stock.
    </div>
  )
}

function formatAge(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60)   return `Updated just now`
  if (diff < 3600) return `Updated ${Math.floor(diff / 60)}m ago`
  return `Updated ${Math.floor(diff / 3600)}h ago`
}