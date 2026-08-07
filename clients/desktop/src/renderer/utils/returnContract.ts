export interface ReturnToLocation {
  pathname: string
  search: string
}

export interface ReturnNavigationState {
  returnTo?: ReturnToLocation
}

const SCROLL_KEY_PREFIX = 'samhan:return-scroll:'

function isSafeLocation(value: unknown): value is ReturnToLocation {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ReturnToLocation>
  return typeof candidate.pathname === 'string'
    && candidate.pathname.startsWith('/')
    && !candidate.pathname.startsWith('//')
    && typeof candidate.search === 'string'
    && (candidate.search === '' || candidate.search.startsWith('?'))
}

export function getReturnTo(
  state: unknown,
  fallback: ReturnToLocation,
): ReturnToLocation {
  const candidate = state && typeof state === 'object'
    ? (state as ReturnNavigationState).returnTo
    : undefined
  return isSafeLocation(candidate) ? candidate : fallback
}

function scrollStorageKey(location: ReturnToLocation): string {
  return `${SCROLL_KEY_PREFIX}${location.pathname}${location.search}`
}

export function saveScrollAnchor(location: ReturnToLocation, scrollY: number = window.scrollY): void {
  if (!Number.isFinite(scrollY) || scrollY < 0) return
  try {
    window.sessionStorage.setItem(scrollStorageKey(location), String(Math.round(scrollY)))
  } catch {
    // sessionStorage can be unavailable in restricted/private renderer contexts.
  }
}

export function getScrollAnchor(location: ReturnToLocation): number | null {
  try {
    const raw = window.sessionStorage.getItem(scrollStorageKey(location))
    if (raw == null) return null
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? value : null
  } catch {
    return null
  }
}
