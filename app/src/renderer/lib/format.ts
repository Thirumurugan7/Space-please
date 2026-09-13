const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

/** Decimal units, like Finder: 1 KB = 1000 B. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  let value = bytes
  let unit = 0
  while (value >= 999.5 && unit < UNITS.length - 1) {
    value /= 1000
    unit++
  }
  if (unit === 0) return `${Math.round(value)} B`
  const text = value < 99.95 ? value.toFixed(1).replace(/\.0$/, '') : String(Math.round(value))
  return `${text} ${UNITS[unit]}`
}

const countFormat = new Intl.NumberFormat('en-US')

export function formatCount(n: number): string {
  return countFormat.format(n)
}

export function plural(n: number, word: string): string {
  return `${formatCount(n)} ${word}${n === 1 ? '' : 's'}`
}

/** Both arguments are unix seconds. */
export function relativeTime(seconds: number, now: number): string {
  const diff = Math.max(0, now - seconds)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  const days = Math.floor(diff / 86400)
  if (days < 30) return `${plural(days, 'day')} ago`
  if (days < 365) return `${plural(Math.floor(days / 30), 'month')} ago`
  return `${plural(Math.floor(days / 365), 'year')} ago`
}

export function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}
