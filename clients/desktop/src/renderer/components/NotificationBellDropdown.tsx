/**
 * 알림 종 dropdown panel — Issue 4 Slice 2.
 *
 * - 60초 polling fetchMyUnread
 * - 채널별 grouping (안전재고 / 메신저 / 결재 / 이카운트 이관)
 * - 각 row 클릭 → acknowledge mutation + cache invalidate + deeplink navigate
 * - 빈 panel 시 "확인할 알림이 없습니다" 표시
 * - 하단 "전체 알림 보기" 링크 → /notifications
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  acknowledgeNotification,
  CHANNEL_LABEL,
  fetchMyUnread,
  groupByChannel,
  type NotificationCenter,
} from '../api/notificationApi'

const DROPDOWN_VIEWPORT_GUTTER_PX = 8

export function NotificationBellDropdown() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', 'my'],
    queryFn: fetchMyUnread,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  const ackMutation = useMutation({
    mutationFn: acknowledgeNotification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useLayoutEffect(() => {
    const el = panelRef.current
    if (!open || !el) {
      if (el) el.style.translate = ''
      return
    }

    const alignPanel = () => alignDropdownPanelToViewport(el)
    alignPanel()

    window.addEventListener('resize', alignPanel)
    return () => {
      window.removeEventListener('resize', alignPanel)
      el.style.translate = ''
    }
  }, [open])

  const handleClickRow = (n: NotificationCenter) => {
    ackMutation.mutate(n.id)
    if (n.deeplink && isSafeDeeplink(n.deeplink)) {
      navigate(n.deeplink)
      setOpen(false)
    }
  }

  const grouped = groupByChannel(notifications)
  const channelKeys = Object.keys(grouped)
  const count = notifications.length

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        data-testid="notification-bell"
        aria-label={`알림 ${count}건`}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          background: 'transparent',
          border: '1px solid var(--color-neutral-200)',
          borderRadius: 8,
          cursor: 'pointer',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-neutral-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 ? (
          <span
            data-testid="notification-bell-badge"
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              background: 'var(--color-danger-500)',
              color: 'var(--color-neutral-0)',
              fontSize: 10,
              fontWeight: 700,
              padding: '0 4px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panelRef}
          data-testid="notification-bell-panel"
          style={{
            position: 'absolute',
            top: 44,
            right: 0,
            width: 'min(360px, calc(100vw - 16px))',
            maxHeight: 480,
            overflowY: 'auto',
            background: 'var(--color-neutral-0)',
            border: '1px solid var(--color-neutral-200)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 1000,
          }}
        >
          <div style={{ padding: 12, borderBottom: '1px solid var(--color-neutral-100)', fontWeight: 700 }}>
            알림 {count > 0 ? `(${count})` : ''}
          </div>

          {channelKeys.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-neutral-500)' }}>
              확인할 알림이 없습니다
            </div>
          ) : (
            channelKeys.map((channel) => {
              const rows = grouped[channel]!
              const label = CHANNEL_LABEL[channel] ?? '알 수 없는 채널'
              return (
                <div key={channel} data-testid={`notification-section-${channel}`}>
                  <div
                    style={{
                      padding: '8px 12px',
                      background: 'var(--color-neutral-50)',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--color-neutral-700)',
                    }}
                  >
                    {label} ({rows.length})
                  </div>
                  {rows.slice(0, 5).map((n) => (
                    <button
                      type="button"
                      key={n.id}
                      data-testid={`notification-row-${n.id}`}
                      onClick={() => handleClickRow(n)}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '10px 12px',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--color-neutral-100)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{n.title}</div>
                      {n.body ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--color-neutral-500)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {n.body}
                        </div>
                      ) : null}
                    </button>
                  ))}
                  {rows.length > 5 ? (
                    <button
                      type="button"
                      onClick={() => {
                        navigate('/notifications')
                        setOpen(false)
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '8px 12px',
                        textAlign: 'right',
                        background: 'transparent',
                        border: 'none',
                        fontSize: 12,
                        color: 'var(--color-primary-600)',
                        cursor: 'pointer',
                      }}
                    >
                      {rows.length - 5}건 더 보기 →
                    </button>
                  ) : null}
                </div>
              )
            })
          )}

          <div style={{ padding: 12, borderTop: '1px solid var(--color-neutral-100)', textAlign: 'center' }}>
            <button
              type="button"
              data-testid="notification-history-link"
              onClick={() => {
                navigate('/notifications')
                setOpen(false)
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-primary-600)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              전체 알림 보기 →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function isSafeDeeplink(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//')
}

function alignDropdownPanelToViewport(el: HTMLElement): void {
  el.style.translate = ''
  const rect = el.getBoundingClientRect()
  const viewport = getViewportBounds()
  let offsetX = 0

  if (rect.left < viewport.left) {
    offsetX = viewport.left - rect.left
  }

  const shiftedRight = rect.right + offsetX
  if (shiftedRight > viewport.right) {
    offsetX += viewport.right - shiftedRight
  }

  const shiftedLeft = rect.left + offsetX
  if (shiftedLeft < viewport.left) {
    offsetX += viewport.left - shiftedLeft
  }

  const roundedOffsetX = roundCssPx(offsetX)
  el.style.translate = roundedOffsetX === 0 ? '' : `${roundedOffsetX}px 0`
}

function getViewportBounds(): { left: number; right: number } {
  const visualViewport = window.visualViewport
  const viewportLeft = (visualViewport?.offsetLeft ?? 0) + DROPDOWN_VIEWPORT_GUTTER_PX
  const viewportWidth = visualViewport?.width ?? window.innerWidth

  return {
    left: viewportLeft,
    right: viewportLeft + viewportWidth - (DROPDOWN_VIEWPORT_GUTTER_PX * 2),
  }
}

function roundCssPx(value: number): number {
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}
