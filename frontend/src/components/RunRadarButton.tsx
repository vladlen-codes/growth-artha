interface Props {
  status: string
  onClick: () => void
}

export default function RunRadarButton({ status, onClick }: Props) {
  const isLoading = status === 'pending' || status === 'running'

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className={`
        flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm
        transition-all duration-150 whitespace-nowrap
        ${isLoading
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-brand-green text-white hover:bg-brand-dark active:scale-95 shadow-sm'
        }
      `}
    >
      {isLoading ? (
        <>
          <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-transparent
                          rounded-full animate-spin" />
          Scanning...
        </>
      ) : (
        <>
          <span>⚡</span>
          Run Radar
        </>
      )}
    </button>
  )
}