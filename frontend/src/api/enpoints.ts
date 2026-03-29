import api from './client'

// Radar
export const runRadar    = (portfolio: string[], universe = 'nifty50') =>
  api.post('/radar/run', { portfolio, universe })

export const getRadarStatus = (jobId: string) =>
  api.get(`/radar/status/${jobId}`)

export const getLatestSignals = () =>
  api.get('/radar/latest')

export const getRadarJobs = (limit = 20) =>
  api.get(`/radar/jobs?limit=${limit}`)

// Stocks
export const getOHLC     = (symbol: string, days = 90) =>
  api.get(`/stocks/${symbol}/ohlc?days=${days}`)

export const getStockInfo = (symbol: string) =>
  api.get(`/stocks/${symbol}/info`)

export const explainSignal = (symbol: string) =>
  api.get(`/stocks/${symbol}/explain`)

export const getPatternBacktest = (symbol: string) =>
  api.get(`/stocks/${symbol}/backtest`)

// Portfolio
export const savePortfolio = (sessionId: string, holdings: any[]) =>
  api.post('/portfolio/save', { session_id: sessionId, holdings })

export const getPortfolio = (sessionId: string) =>
  api.get(`/portfolio/${sessionId}`)

// Chat
export const askChat = (question: string, portfolio: string[]) =>
  api.post('/chat/ask', { question, portfolio })

// Video Studio
export const createVideoStoryboard = (payload: { template: string; duration_seconds: number; portfolio?: string[] }) =>
  api.post('/video/storyboard', payload)

export const createVideoJob = (payload: { template: string; duration_seconds: number; portfolio?: string[]; title?: string; render_mode?: 'auto' | 'mp4' | 'json' }) =>
  api.post('/video/jobs', payload)

export const getVideoJobs = (limit = 20) =>
  api.get(`/video/jobs?limit=${limit}`)

export const getVideoJob = (jobId: string) =>
  api.get(`/video/jobs/${jobId}`)

export const retryVideoJob = (jobId: string) =>
  api.post(`/video/jobs/${jobId}/retry`)

export const cancelVideoJob = (jobId: string) =>
  api.post(`/video/jobs/${jobId}/cancel`)

export const getVideoJobDownloadUrl = (jobId: string) =>
  `${api.defaults.baseURL}/video/jobs/${jobId}/download`

// Call this on app load to warm the cache for demo stocks
export const prewarmDemoStocks = async (symbols: string[]) => {
  // Fire and forget - don't await
  symbols.forEach(sym => {
    getOHLC(sym, 180).catch(() => {})
    getStockInfo(sym).catch(() => {})
  })
}