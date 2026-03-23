// Browser Notification API — no external service needed

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false

  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

export function notifyRadarComplete(result: {
  act: any[], watch: any[], exit_radar: any[]
}) {
  if (Notification.permission !== 'granted') return

  const actCount   = result.act.length
  const topSignal  = result.act[0]

  const title = `Growth Artha — Radar Complete`
  const body  = actCount > 0
    ? `${actCount} action signal${actCount > 1 ? 's' : ''} found. Top pick: ${topSignal?.symbol} (score: ${topSignal?.score})`
    : `Scan complete — ${result.watch.length} stocks to watch today.`

  new Notification(title, {
    body,
    icon:  '/logo.png',
    badge: '/logo.png',
    tag:   'radar-complete',      // replaces previous notification of same type
  })
}

export function notifyPortfolioAlert(symbol: string, reason: string) {
  if (Notification.permission !== 'granted') return

  new Notification(`Growth Artha — Portfolio Alert`, {
    body: `${symbol}: ${reason}`,
    icon:  '/logo.png',
    tag:   `alert-${symbol}`,
    requireInteraction: true,     // stays until user dismisses
  })
}

export function notifySignalUpdate(symbol: string, score: number, tags: string[]) {
  if (Notification.permission !== 'granted') return

  const direction = score > 0 ? 'Opportunity' : 'Risk Alert'
  new Notification(`Growth Artha — ${direction}`, {
    body: `${symbol}: ${tags.slice(0, 2).join(' + ')} (${score > 0 ? '+' : ''}${score})`,
    icon:  '/logo.png',
    tag:   `signal-${symbol}`,
  })
}