import { useState, useEffect } from 'react'
import { getOHLC } from '../api/endpoints'
import api from '../api/client'

export function useLivePrice(symbol: string, intervalSeconds = 60) {
  const [price, setPrice]         = useState<number | null>(null)
  const [changePct, setChangePct] = useState<number | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    if (!symbol) return

    const fetch = async () => {
      try {
        const res = await api.get(`/stocks/${symbol}/price`)
        setPrice(res.data.price)
        setChangePct(res.data.change_pct)
        setUpdatedAt(res.data.updated_at)
      } catch {
        // silently keep last known price on error
      } finally {
        setLoading(false)
      }
    }

    fetch()
    const interval = setInterval(fetch, intervalSeconds * 1000)
    return () => clearInterval(interval)   // cleanup on unmount
  }, [symbol, intervalSeconds])

  return { price, changePct, updatedAt, loading }
}