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
      setError('Enter a valid NSE symbol (2–15 chars)')
      return
    }
    if (holdings.length >= 15) {
      setError('Maximum 15 stocks')
      return
    }
    if (holdings.find(h => h.symbol === symbol)) {
      setError(`${symbol} already added`)
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
      {/* Chip list */}
      <div className="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
        {holdings.map(h => (
          <span
            key={h.symbol}
            className="inline-flex items-center gap-1 font-semibold text-[12px] px-2.5 py-1 rounded-full"
            style={{
              background: 'var(--brand-light)',
              color: 'var(--brand-deeper)',
              border: '1px solid var(--brand-border)',
            }}
          >
            {h.symbol}
            <button
              onClick={() => removeHolding(h.symbol)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--brand-dark)',
                padding: '0 0 0 2px',
                lineHeight: 1,
                fontSize: 14,
                transition: 'color 0.15s',
                opacity: 0.7,
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--red)')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--brand-dark)')}
              title={`Remove ${h.symbol}`}
            >
              ×
            </button>
          </span>
        ))}
        {holdings.length === 0 && (
          <span className="text-[12px] py-1" style={{ color: 'var(--gray-400)' }}>
            No stocks added: signals will cover all Nifty 50
          </span>
        )}
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value.toUpperCase()); setError('') }}
          onKeyDown={handleKeyDown}
          placeholder="e.g. RELIANCE, TCS, INFY"
          style={{
            flex: 1,
            fontSize: 13,
            border: error ? '1.5px solid var(--red)' : '1.5px solid var(--border)',
            borderRadius: 9,
            padding: '8px 12px',
            outline: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            background: 'var(--surface)',
            color: 'var(--gray-900)',
          }}
          onFocus={e => {
            (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--brand-green)'
            ;(e.currentTarget as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(22, 201, 123, 0.12)'
          }}
          onBlur={e => {
            (e.currentTarget as HTMLInputElement).style.borderColor = error ? 'var(--red)' : 'var(--border)'
            ;(e.currentTarget as HTMLInputElement).style.boxShadow = 'none'
          }}
        />
        <button
          onClick={handleAdd}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--brand-dark)',
            border: '1.5px solid var(--brand-green)',
            background: 'var(--brand-light)',
            padding: '8px 16px',
            borderRadius: 9,
            cursor: 'pointer',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--brand-green)'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#fff'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--brand-light)'
            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--brand-dark)'
          }}
        >
          + Add
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-[11px] mt-1.5 font-medium" style={{ color: 'var(--red)' }}>
          {error}
        </p>
      )}

      {/* Demo link */}
      {holdings.length === 0 && (
        <button
          onClick={() => {
            ;['TCS', 'INFY', 'HDFCBANK'].forEach(sym =>
              addHolding({ symbol: sym, quantity: 100, avg_price: 0 })
            )
          }}
          className="text-[11px] mt-2 underline underline-offset-2"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--gray-400)',
            transition: 'color 0.15s',
            padding: 0,
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--brand-green)')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--gray-400)')}
        >
          Load demo portfolio (TCS, INFY, HDFCBANK)
        </button>
      )}
    </div>
  )
}