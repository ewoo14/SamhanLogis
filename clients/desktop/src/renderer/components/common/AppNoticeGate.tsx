import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal } from '@samhan/design-system'
import { getActiveAppNotices, type ActiveAppNotice } from '../../api/appNotice'

type SafeNoticeStorage = Pick<Storage, 'getItem' | 'setItem'>

const DISMISS_PREFIX = 'samhan.appNotice.dismissed.'

function fallbackStorage(storage: Map<string, string>): SafeNoticeStorage {
  return {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, value)
    },
  }
}

function safeLocalStorage(fallback: Map<string, string>): SafeNoticeStorage {
  const fallbackStore = fallbackStorage(fallback)
  if (typeof window === 'undefined') return fallbackStore
  try {
    const probeKey = '__samhan_notice_probe__'
    window.localStorage.setItem(probeKey, '1')
    window.localStorage.removeItem(probeKey)
    return {
      getItem: (key) => {
        try {
          return window.localStorage.getItem(key)
        } catch {
          return fallbackStore.getItem(key)
        }
      },
      setItem: (key, value) => {
        try {
          window.localStorage.setItem(key, value)
        } catch {
          fallbackStore.setItem(key, value)
        }
      },
    }
  } catch {
    return fallbackStore
  }
}

function dismissKey(noticeId: string): string {
  return `${DISMISS_PREFIX}${noticeId}`
}

function visibleNotice(
  notices: ActiveAppNotice[],
  storage: SafeNoticeStorage,
  closedIds: Set<string>,
): ActiveAppNotice | null {
  return notices.find((notice) => !closedIds.has(notice.id) && storage.getItem(dismissKey(notice.id)) !== 'true') ?? null
}

export function AppNoticeGate({
  bootstrapped,
  authenticated,
}: {
  bootstrapped: boolean
  authenticated: boolean
}) {
  const [notices, setNotices] = useState<ActiveAppNotice[]>([])
  const [currentNoticeId, setCurrentNoticeId] = useState<string | null>(null)
  const [imageIndex, setImageIndex] = useState(0)
  const [imageStatus, setImageStatus] = useState<'loading' | 'loaded' | 'error'>('loaded')
  const [closedIds, setClosedIds] = useState<Set<string>>(() => new Set())
  const checkedRef = useRef(false)
  const fallbackStorageRef = useRef(new Map<string, string>())

  const storage = useMemo(() => safeLocalStorage(fallbackStorageRef.current), [])
  const notice = useMemo(() => {
    if (currentNoticeId) {
      return notices.find((candidate) => candidate.id === currentNoticeId && !closedIds.has(candidate.id)) ?? null
    }
    return visibleNotice(notices, storage, closedIds)
  }, [closedIds, currentNoticeId, notices, storage])

  useEffect(() => {
    if (!bootstrapped || !authenticated || checkedRef.current) return
    checkedRef.current = true

    getActiveAppNotices()
      .then((rows) => {
        setNotices(rows)
        const first = visibleNotice(rows, storage, new Set())
        setCurrentNoticeId(first?.id ?? null)
        setImageIndex(0)
      })
      .catch((err: unknown) => {
        console.warn('[app-notice] 활성 공지 조회 실패 — 앱 부팅은 계속 진행합니다.', err)
      })
  }, [authenticated, bootstrapped, storage])

  const images = useMemo(() => (
    notice ? [...notice.images].sort((a, b) => a.displayOrder - b.displayOrder) : []
  ), [notice])
  const image = images[imageIndex] ?? null
  const hasMultiple = images.length > 1

  useEffect(() => {
    setImageStatus(image ? 'loading' : 'loaded')
  }, [image?.imageUrl])

  if (!notice) return null

  const closeCurrent = () => {
    const nextClosedIds = new Set(closedIds)
    nextClosedIds.add(notice.id)
    setClosedIds(nextClosedIds)
    const next = visibleNotice(notices, storage, nextClosedIds)
    setCurrentNoticeId(next?.id ?? null)
    setImageIndex(0)
  }

  const dismissForever = () => {
    storage.setItem(dismissKey(notice.id), 'true')
    closeCurrent()
  }

  const move = (delta: number) => {
    if (images.length === 0) return
    setImageIndex((prev) => (prev + delta + images.length) % images.length)
  }

  return (
    <Modal
      open
      onClose={closeCurrent}
      title={notice.title}
      size="lg"
      footer={(
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={dismissForever}
            data-testid="app-notice-dismiss-forever"
          >
            다시 보지 않기
          </Button>
          <Button type="button" variant="primary" onClick={closeCurrent}>
            닫기
          </Button>
        </>
      )}
    >
      <div
        data-testid="app-notice-modal"
        style={{
          display: 'grid',
          gap: 12,
        }}
      >
        <div
          style={{
            position: 'relative',
            display: 'grid',
            placeItems: 'center',
            minHeight: 260,
            border: '1px solid var(--color-neutral-200)',
            borderRadius: 8,
            overflow: 'hidden',
            background: 'var(--color-neutral-50)',
            touchAction: 'pan-y',
          }}
          onTouchStart={(event) => {
            const startX = event.touches[0]?.clientX
            if (startX === undefined) return
            const handleTouchEnd = (endEvent: TouchEvent) => {
              const endX = endEvent.changedTouches[0]?.clientX
              if (endX !== undefined && Math.abs(endX - startX) > 40) {
                move(endX < startX ? 1 : -1)
              }
              window.removeEventListener('touchend', handleTouchEnd)
            }
            window.addEventListener('touchend', handleTouchEnd, { once: true })
          }}
        >
          {image ? (
            <>
              {imageStatus === 'loading' ? (
                <div
                  data-testid="app-notice-image-loading"
                  role="status"
                  aria-live="polite"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--color-neutral-600)',
                    background: 'linear-gradient(90deg, var(--color-neutral-50), var(--color-neutral-100), var(--color-neutral-50))',
                  }}
                >
                  이미지를 불러오는 중입니다.
                </div>
              ) : null}
              {imageStatus === 'error' ? (
                <div
                  role="status"
                  style={{ padding: 24, color: 'var(--state-danger)', textAlign: 'center' }}
                >
                  이미지를 불러오지 못했습니다.
                </div>
              ) : null}
              <img
                data-testid="app-notice-image"
                src={image.imageUrl}
                alt={image.caption ?? notice.title}
                onLoad={() => setImageStatus('loaded')}
                onError={() => setImageStatus('error')}
                style={{
                  width: '100%',
                  maxHeight: 'min(62vh, 560px)',
                  objectFit: 'contain',
                  display: imageStatus === 'error' ? 'none' : 'block',
                  opacity: imageStatus === 'loaded' ? 1 : 0,
                }}
              />
            </>
          ) : (
            <div style={{ padding: 24, color: 'var(--color-neutral-600)' }}>
              등록된 이미지가 없습니다.
            </div>
          )}
          {hasMultiple ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => move(-1)}
                aria-label="이전 이미지"
                data-testid="app-notice-prev"
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  minWidth: 48,
                  minHeight: 48,
                }}
              >
                이전
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => move(1)}
                aria-label="다음 이미지"
                data-testid="app-notice-next"
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  minWidth: 48,
                  minHeight: 48,
                }}
              >
                다음
              </Button>
            </>
          ) : null}
        </div>
        {image?.caption ? (
          <p style={{ margin: 0, color: 'var(--color-neutral-700)', lineHeight: 1.5 }}>
            {image.caption}
          </p>
        ) : null}
        {images.length > 0 ? (
          <div
            data-testid="app-notice-indicator"
            aria-live="polite"
            aria-label={`이미지 ${imageIndex + 1} / ${images.length}`}
            style={{ display: 'flex', justifyContent: 'center', gap: 6 }}
          >
            {images.map((candidate, index) => (
              <span
                key={`${candidate.imageUrl}-${candidate.displayOrder}`}
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: index === imageIndex ? 'var(--color-primary-600)' : 'var(--color-neutral-300)',
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
