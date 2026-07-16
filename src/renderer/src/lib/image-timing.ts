export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

export function timeToDoneLabel(
  firstLabeledAt: string | null | undefined,
  doneAt: string | null | undefined
): string {
  if (!firstLabeledAt || !doneAt) return '—'
  const start = Date.parse(firstLabeledAt)
  const end = Date.parse(doneAt)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—'
  return formatDurationMs(end - start)
}
