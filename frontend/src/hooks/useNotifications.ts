import { useEffect, useState } from 'react'
import {
  requestNotificationPermission,
  notifyRadarComplete,
  notifyPortfolioAlert
} from '../utils/notifications'
import { usePortfolioStore } from '../store/portfolioStore'

export function useNotifications() {
  const [permitted, setPermitted] = useState(false)
  const { getSymbols } = usePortfolioStore()

  useEffect(() => {
    // Request permission on first load — before user hits Run Radar
    requestNotificationPermission().then(setPermitted)
  }, [])

  // Call this when radar scan completes
  const onRadarComplete = (result: any) => {
    if (!permitted) return
    notifyRadarComplete(result)

    // Check exit radar for user's held stocks — notify immediately
    const heldSymbols = getSymbols()
    const exitSignals = result.exit_radar || []

    exitSignals.forEach((signal: any) => {
      if (heldSymbols.includes(signal.symbol)) {
        notifyPortfolioAlert(
          signal.symbol,
          signal.tags?.join(', ') || 'Risk signal detected'
        )
      }
    })
  }

  return { permitted, onRadarComplete }
}