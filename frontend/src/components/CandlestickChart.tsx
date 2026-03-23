import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createChart,
  ColorType,
  CandlestickSeries,
  createSeriesMarkers,
} from 'lightweight-charts'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { getOHLC } from '../api/enpoints'

interface Pattern {
  pattern: string
  date: string
  price: number
  confidence: number
  description: string
}

interface Props {
  symbol: string
  patterns: Pattern[]
}

// Colour map for each pattern type
const PATTERN_COLORS: Record<string, string> = {
  '52W High Breakout':      '#1D9E75',
  'Double Bottom':          '#1D9E75',
  'Bullish RSI Divergence': '#0F6E56',
  'Support Test':           '#378ADD',
  'Volume Spike':           '#BA7517',
  'Resistance Test':        '#E24B4A',
  'Double Top':             '#A32D2D',
  'Bearish RSI Divergence': '#E24B4A',
}

export default function CandlestickChart({ symbol, patterns }: Props) {
  const chartRef    = useRef<HTMLDivElement>(null)
  const chartObj    = useRef<IChartApi | null>(null)
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ohlc', symbol],
    queryFn:  () => getOHLC(symbol, 180).then(r => r.data),
    staleTime: 1000 * 60 * 15,
  })

  // Initialise chart once
  useEffect(() => {
    if (!chartRef.current) return

    const chart = createChart(chartRef.current, {
      layout: {
        background:  { type: ColorType.Solid, color: '#ffffff' },
        textColor:   '#6b7280',
        fontSize:    11,
        fontFamily:  'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines:   { color: '#f3f4f6' },
        horzLines:   { color: '#f3f4f6' },
      },
      crosshair: {
        vertLine:    { color: '#d1d5db', width: 1, style: 2 },
        horzLine:    { color: '#d1d5db', width: 1, style: 2 },
      },
      rightPriceScale: { borderColor: '#f3f4f6' },
      timeScale: {
        borderColor:      '#f3f4f6',
        timeVisible:      true,
        secondsVisible:   false,
      },
      width:  chartRef.current.clientWidth,
      height: 380,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor:        '#1D9E75',
      downColor:      '#E24B4A',
      borderUpColor:  '#1D9E75',
      borderDownColor:'#E24B4A',
      wickUpColor:    '#1D9E75',
      wickDownColor:  '#E24B4A',
    })

    chartObj.current    = chart
    candleSeries.current = series

    // Resize observer — chart fills container width
    const ro = new ResizeObserver(() => {
      if (chartRef.current) {
        chart.applyOptions({ width: chartRef.current.clientWidth })
      }
    })
    ro.observe(chartRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
    }
  }, [])

  // Load OHLC data
  useEffect(() => {
    if (!data?.data || !candleSeries.current) return

    const formatted = data.data.map((d: any) => ({
      time:  d.time,
      open:  d.open,
      high:  d.high,
      low:   d.low,
      close: d.close,
    }))

    candleSeries.current.setData(formatted)

    // Add pattern markers on the candles
    if (patterns.length > 0) {
      const markers = patterns
        .filter(p => p.date)
        .map(p => ({
          time:     p.date,
          position: p.pattern.toLowerCase().includes('top')
                    || p.pattern.toLowerCase().includes('bearish')
                    || p.pattern.toLowerCase().includes('resistance')
            ? 'aboveBar' as const
            : 'belowBar' as const,
          color:    PATTERN_COLORS[p.pattern] || '#BA7517',
          shape:    p.pattern.toLowerCase().includes('top')
                    || p.pattern.toLowerCase().includes('bearish')
            ? 'arrowDown' as const
            : 'arrowUp' as const,
          text:     p.pattern,
          size:     1.5,
        }))
        // deduplicate by time+pattern
        .filter((m, i, arr) =>
          arr.findIndex(x => x.time === m.time && x.text === m.text) === i
        )
        // sort by time (required by lightweight-charts)
        .sort((a, b) => (a.time < b.time ? -1 : 1))

      createSeriesMarkers(candleSeries.current, markers)
    }

    // Fit chart to show last 90 days by default
    chartObj.current?.timeScale().fitContent()

  }, [data, patterns])

  if (isLoading) return <ChartSkeleton />
  if (isError)   return <ChartError symbol={symbol} />

  return (
    <div>
      {/* Pattern legend */}
      {patterns.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {patterns.map(p => (
            <div
              key={`${p.pattern}-${p.date}`}
              className="flex items-center gap-1.5 text-xs text-gray-600
                         bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full"
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: PATTERN_COLORS[p.pattern] || '#BA7517' }}
              />
              <span className="font-medium">{p.pattern}</span>
              <span className="text-gray-400">
                · {Math.round(p.confidence * 100)}% conf.
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Chart container */}
      <div ref={chartRef} className="rounded-lg overflow-hidden" />

      {/* Pattern details below chart */}
      {patterns.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Detected patterns
          </p>
          {patterns.map((p, i) => (
            <PatternRow key={i} pattern={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function PatternRow({ pattern }: { pattern: Pattern }) {
  const color = PATTERN_COLORS[pattern.pattern] || '#BA7517'
  const isBullish = !pattern.pattern.toLowerCase().includes('bearish')
                 && !pattern.pattern.toLowerCase().includes('top')
                 && !pattern.pattern.toLowerCase().includes('resistance')

  return (
    <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
      <div
        className="w-1 self-stretch rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800">
            {pattern.pattern}
          </span>
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{
              background: isBullish ? '#E1F5EE' : '#FCEBEB',
              color:      isBullish ? '#0F6E56' : '#A32D2D',
            }}
          >
            {isBullish ? 'Bullish' : 'Bearish'}
          </span>
          <span className="text-xs text-gray-400">{pattern.date}</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{pattern.description}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-xs font-medium text-gray-700">
          {Math.round(pattern.confidence * 100)}%
        </div>
        <div className="text-[10px] text-gray-400">confidence</div>
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="h-96 bg-gray-50 rounded-lg animate-pulse flex items-center
                    justify-center">
      <p className="text-sm text-gray-400">Loading chart...</p>
    </div>
  )
}

function ChartError({ symbol }: { symbol: string }) {
  return (
    <div className="h-96 bg-red-50 rounded-lg flex items-center justify-center">
      <div className="text-center">
        <p className="text-sm text-red-600 font-medium">
          Chart unavailable for {symbol}
        </p>
        <p className="text-xs text-red-400 mt-1">
          NSE data may be temporarily unavailable
        </p>
      </div>
    </div>
  )
}