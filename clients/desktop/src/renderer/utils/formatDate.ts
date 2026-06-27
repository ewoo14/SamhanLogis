const KST_TIME_ZONE = 'Asia/Seoul'

const twoDigit = (value: string | undefined): string => value?.padStart(2, '0') ?? '00'

function kstParts(value: string | Date): Record<string, string> | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
}

export function formatKstDate(value: string | Date): string {
  const parts = kstParts(value)
  if (!parts) return '-'
  return `${parts['year']}.${twoDigit(parts['month'])}.${twoDigit(parts['day'])}`
}

export function formatKstDateTimeInputValue(value: string | Date): string {
  const parts = kstParts(value)
  if (!parts) return ''
  return `${parts['year']}-${twoDigit(parts['month'])}-${twoDigit(parts['day'])}T${twoDigit(parts['hour'])}:${twoDigit(parts['minute'])}`
}

export function kstDateTimeInputToIsoOffset(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(trimmed)) return trimmed

  const [datePart, timePart = '00:00'] = trimmed.split('T')
  const [hour = '00', minute = '00', second = '00'] = timePart.split(':')
  return `${datePart}T${twoDigit(hour)}:${twoDigit(minute)}:${twoDigit(second)}+09:00`
}
