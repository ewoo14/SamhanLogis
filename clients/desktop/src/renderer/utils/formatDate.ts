const KST_TIME_ZONE = 'Asia/Seoul'

const twoDigit = (value: string | undefined): string => value?.padStart(2, '0') ?? '00'
const OFFSETLESS_LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/

function offsetlessLocalDateTimeParts(value: string): Record<string, string> | null {
  const match = OFFSETLESS_LOCAL_DATE_TIME_PATTERN.exec(value.trim())
  if (!match) return null

  return {
    year: match[1] ?? '0000',
    month: match[2] ?? '00',
    day: match[3] ?? '00',
    hour: match[4] ?? '00',
    minute: match[5] ?? '00',
    second: match[6] ?? '00',
  }
}

function kstParts(value: string | Date): Record<string, string> | null {
  if (typeof value === 'string') {
    const localParts = offsetlessLocalDateTimeParts(value)
    if (localParts) return localParts
  }

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

export function kstDateTimeInputToLocalDateTime(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed

  const [datePart, timePart = '00:00'] = trimmed.split('T')
  const localTimePart = timePart.replace(/(?:[zZ]|[+-]\d{2}:\d{2})$/, '')
  const [hour = '00', minute = '00', secondWithFraction = '00'] = localTimePart.split(':')
  const [second = '00'] = secondWithFraction.split('.')
  return `${datePart}T${twoDigit(hour)}:${twoDigit(minute)}:${twoDigit(second)}`
}
