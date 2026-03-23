import { create } from 'zustand'

interface Holding {
  symbol: string
  quantity: number
  avg_price: number
}

interface PortfolioStore {
  holdings: Holding[]
  sessionId: string
  setHoldings: (holdings: Holding[]) => void
  addHolding: (holding: Holding) => void
  removeHolding: (symbol: string) => void
  getSymbols: () => string[]
}

export const usePortfolioStore = create<PortfolioStore>((set, get) => ({
  holdings: [],
  sessionId: crypto.randomUUID(),

  setHoldings: (holdings) => set({ holdings }),

  addHolding: (holding) => set((state) => ({
    holdings: [...state.holdings.filter(h => h.symbol !== holding.symbol), holding]
  })),

  removeHolding: (symbol) => set((state) => ({
    holdings: state.holdings.filter(h => h.symbol !== symbol)
  })),

  getSymbols: () => get().holdings.map(h => h.symbol)
}))