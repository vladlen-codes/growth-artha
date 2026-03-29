import { useState, useEffect } from 'react'
import api from '../api/client'

export function useLivePrice(symbol: string, intervalSeconds = 30) {
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!symbol) return

    const fetch = async () => {
      try {
        const res = await api.get(`/stocks/${symbol}/price`)
        const raw = res.data || {}
        setData({
          symbol: raw.symbol,
          price: typeof raw.last_price === 'number' ? raw.last_price : raw.price ?? null,
          changePct: typeof raw.change_pct === 'number' ? raw.change_pct : raw.changePct ?? null,
          updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
          isLive: raw.is_live ?? false,
          source: raw.source ?? null,
        })
      } catch {
        // keep last known data on failure
      } finally {
        setLoading(false)
      }
    }

    fetch()
    // 30s polling live enough for a signal product
    const interval = setInterval(fetch, intervalSeconds * 1000)
    return () => clearInterval(interval)
  }, [symbol, intervalSeconds])

  return { ...data, loading }
}