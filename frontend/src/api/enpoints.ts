import api from './client'

// Radar
export const runRadar    = (portfolio: string[], universe = 'nifty50') =>
  api.post('/radar/run', { portfolio, universe })

export const getRadarStatus = (jobId: string) =>
  api.get(`/radar/status/${jobId}`)

export const getLatestSignals = () =>
  api.get('/radar/latest')

// Stocks
export const getOHLC     = (symbol: string, days = 90) =>
  api.get(`/stocks/${symbol}/ohlc?days=${days}`)

export const getStockInfo = (symbol: string) =>
  api.get(`/stocks/${symbol}/info`)

export const explainSignal = (symbol: string) =>
  api.get(`/stocks/${symbol}/explain`)

// Portfolio
export const savePortfolio = (sessionId: string, holdings: any[]) =>
  api.post('/portfolio/save', { session_id: sessionId, holdings })

export const getPortfolio = (sessionId: string) =>
  api.get(`/portfolio/${sessionId}`)

// Chat
export const askChat = (question: string, portfolio: string[]) =>
  api.post('/chat/ask', { question, portfolio })

// Call this on app load to warm the cache for demo stocks
export const prewarmDemoStocks = async (symbols: string[]) => {
  // Fire and forget — don't await
  symbols.forEach(sym => {
    getOHLC(sym, 180).catch(() => {})
    getStockInfo(sym).catch(() => {})
  })
}