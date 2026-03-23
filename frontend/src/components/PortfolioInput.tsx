import { useState } from 'react'
import { usePortfolioStore } from '../store/portfolioStore'

export default function PortfolioInput() {
  const { holdings, addHolding, removeHolding } = usePortfolioStore()
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  const handleAdd = () => {
    const symbol = input.trim().toUpperCase()
    if (!symbol) return

    if (symbol.length < 2 || symbol.length > 15) {
      setError('Enter a valid NSE symbol')
      return
    }
    if (holdings.length >= 15) {
      setError('Maximum 15 stocks')
      return
    }

    addHolding({ symbol, quantity: 0, avg_price: 0 })
    setInput('')
    setError('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd()
  }

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-2">
        {holdings.map(h => (
          <span
            key={h.symbol}
            className="inline-flex items-center gap-1 bg-brand-light text-brand-dark
                       text-xs font-medium px-2.5 py-1 rounded-full"
          >
            {h.symbol}
            <button
              onClick={() => removeHolding(h.symbol)}
              className="text-brand-dark hover:text-red-500 transition-colors ml-0.5"
            >
              ×
            </button>
          </span>
        ))}
        {holdings.length === 0 && (
          <span className="text-xs text-gray-400 py-1">
            No stocks added — signals will cover all Nifty 50
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value.toUpperCase()); setError('') }}
          onKeyDown={handleKeyDown}
          placeholder="e.g. RELIANCE, TCS, INFY"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2
                     focus:outline-none focus:ring-2 focus:ring-brand-green
                     focus:border-transparent placeholder:text-gray-300"
        />
        <button
          onClick={handleAdd}
          className="text-sm font-medium text-brand-green border border-brand-green
                     px-3 py-2 rounded-lg hover:bg-brand-light transition-colors"
        >
          Add
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}