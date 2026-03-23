import { create } from 'zustand'

interface Signal {
  symbol: string
  score: number
  tags: string[]
  ai_card: string
  patterns: any[]
  events: any[]
  portfolio_tag?: string  // 'holding' | 'sector' | null
}

interface RadarResult {
  act: Signal[]
  watch: Signal[]
  exit_radar: Signal[]
  total_scanned: number
  total_signals: number
}

interface RadarStore {
  jobId: string | null
  status: 'idle' | 'pending' | 'running' | 'done' | 'error'
  result: RadarResult | null
  error: string | null
  setJob: (jobId: string) => void
  setStatus: (status: RadarStore['status']) => void
  setResult: (result: RadarResult) => void
  setError: (error: string) => void
  reset: () => void
}

export const useRadarStore = create<RadarStore>((set) => ({
  jobId: null,
  status: 'idle',
  result: null,
  error: null,
  setJob:    (jobId)  => set({ jobId, status: 'pending' }),
  setStatus: (status) => set({ status }),
  setResult: (result) => set({ result, status: 'done' }),
  setError:  (error)  => set({ error, status: 'error' }),
  reset: () => set({ jobId: null, status: 'idle', result: null, error: null })
}))