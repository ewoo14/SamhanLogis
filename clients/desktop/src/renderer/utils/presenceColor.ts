import type { PresenceColor } from '../realtime/createPresenceClient'

export const PRESENCE_COLOR_HEX: Record<PresenceColor, string> = {
  BLUE: '#2563EB',
  GREEN: '#15803D',
  AMBER: '#B45309',
  ROSE: '#E11D48',
  VIOLET: '#7C3AED',
  CYAN: '#0E7490',
  LIME: '#4D7C0F',
  PINK: '#DB2777',
}

const PRESENCE_COLOR_ORDER: PresenceColor[] = [
  'BLUE',
  'GREEN',
  'AMBER',
  'ROSE',
  'VIOLET',
  'CYAN',
  'LIME',
  'PINK',
]

export function presenceColorToHex(color: PresenceColor | string | null | undefined): string {
  if (!color) return PRESENCE_COLOR_HEX.BLUE
  return PRESENCE_COLOR_HEX[color as PresenceColor] ?? color
}

export function presenceColorFromUserId(userId: string | null | undefined): PresenceColor {
  let hash = 0
  if (userId) {
    for (let i = 0; i < userId.length; i += 1) {
      hash = Math.imul(31, hash) + userId.charCodeAt(i)
      hash |= 0
    }
  }
  return PRESENCE_COLOR_ORDER[((hash % PRESENCE_COLOR_ORDER.length) + PRESENCE_COLOR_ORDER.length) % PRESENCE_COLOR_ORDER.length]!
}

export function presenceHexFromUserId(userId: string | null | undefined): string {
  return presenceColorToHex(presenceColorFromUserId(userId))
}
