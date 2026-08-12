export interface ReturnToLocation {
  pathname: string
  search: string
}

export interface ReturnNavigationState {
  returnTo?: ReturnToLocation
  /** 목록에서 상세로 push된 바로 그 history entry의 key. */
  returnEntryKey?: string
}

const SCROLL_KEY_PREFIX = 'samhan:return-scroll:'
const SCROLL_ANCHOR_TTL_MS = 24 * 60 * 60 * 1000
const MAX_SCROLL_ANCHORS = 50

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

function scrollStorageKey(entryKey: string): string {
  return `${SCROLL_KEY_PREFIX}${entryKey}`
}

type ScrollAnchor = { scrollY: number; createdAt: number }

function parseScrollAnchor(raw: string): ScrollAnchor | null {
  try {
    const anchor = JSON.parse(raw) as Partial<ScrollAnchor>
    return typeof anchor.scrollY === 'number' && Number.isFinite(anchor.scrollY) && anchor.scrollY >= 0
      && typeof anchor.createdAt === 'number' && Number.isFinite(anchor.createdAt) && anchor.createdAt >= 0
      ? { scrollY: anchor.scrollY, createdAt: anchor.createdAt }
      : null
  } catch {
    return null
  }
}

function cleanupScrollAnchors(now: number): void {
  try {
    const entries: Array<{ key: string; anchor: ScrollAnchor }> = []
    for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = window.sessionStorage.key(i)
      if (!key?.startsWith(SCROLL_KEY_PREFIX)) continue
      const raw = window.sessionStorage.getItem(key)
      if (!raw) {
        window.sessionStorage.removeItem(key)
        continue
      }
      const anchor = parseScrollAnchor(raw)
      if (!anchor || now - anchor.createdAt > SCROLL_ANCHOR_TTL_MS || now < anchor.createdAt) {
        window.sessionStorage.removeItem(key)
        continue
      }
      entries.push({ key, anchor })
    }
    entries.sort((a, b) => b.anchor.createdAt - a.anchor.createdAt)
    for (const entry of entries.slice(MAX_SCROLL_ANCHORS)) window.sessionStorage.removeItem(entry.key)
  } catch {
    // sessionStorage can be unavailable in restricted/private renderer contexts.
  }
}

export function saveScrollAnchor(entryKey: string, scrollY: number = window.scrollY): void {
  if (!entryKey || !Number.isFinite(scrollY) || scrollY < 0) return
  try {
    const now = Date.now()
    cleanupScrollAnchors(now)
    window.sessionStorage.setItem(scrollStorageKey(entryKey), JSON.stringify({
      scrollY: Math.round(scrollY),
      createdAt: now,
    } satisfies ScrollAnchor))
    cleanupScrollAnchors(now)
  } catch {
    // sessionStorage can be unavailable in restricted/private renderer contexts.
  }
}

/** 해당 history entry가 되감겨 목록으로 돌아온 한 번만 읽고 즉시 소비한다. */
export function getScrollAnchor(entryKey: string): number | null {
  if (!entryKey) return null
  try {
    const now = Date.now()
    cleanupScrollAnchors(now)
    const raw = window.sessionStorage.getItem(scrollStorageKey(entryKey))
    if (raw == null) return null
    window.sessionStorage.removeItem(scrollStorageKey(entryKey))
    return parseScrollAnchor(raw)?.scrollY ?? null
  } catch {
    return null
  }
}

/** 목록 데이터가 렌더된 뒤 저장된 정수 픽셀 anchor를 복원한다. */
export function restoreScrollAnchorWhenReady(
  entryKey: string,
  isReady: () => boolean,
): () => void {
  const anchor = getScrollAnchor(entryKey)
  if (anchor == null) return () => undefined

  let cancelled = false
  let attempts = 0
  let readyFrames = 0
  let frame = 0
  const restore = () => {
    if (cancelled) return
    if (isReady()) readyFrames += 1
    else readyFrames = 0
    if (readyFrames >= 2 || attempts >= 60) {
      window.scrollTo({ top: anchor, behavior: 'auto' })
      return
    }
    attempts += 1
    frame = window.requestAnimationFrame(restore)
  }
  frame = window.requestAnimationFrame(restore)
  return () => {
    cancelled = true
    window.cancelAnimationFrame(frame)
  }
}
