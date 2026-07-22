/**
 * 통합 알림 센터 API client — Issue 4 Slice 2.
 *
 * BE (notification-service) 정합:
 * - GET  /api/notifications/my                   → 미확인 알림 list (최신순)
 * - GET  /api/notifications/history?size&page    → 전체 history (Pageable)
 * - POST /api/notifications/{id}/acknowledge     → read_at 설정 (idempotent)
 *
 * UUID 비공개 가드: id, deeplink, 비즈니스 라벨 (title/body/channel) 만 화면 노출.
 */
import { apiClient, type ApiEnvelope } from './client'

/** BE NotificationSeverity enum 정합. */
export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

/** BE NotificationCenterResponse record 와 1:1. */
export interface NotificationCenter {
  id: string
  channel: string
  severity: NotificationSeverity
  title: string
  body: string | null
  deeplink: string | null
  createdAt: string  // ISO LocalDateTime
  readAt: string | null
  /** source 식별자(예: messageId) — 채널 소비처가 원본 레코드와 상관시킬 때 사용. */
  refId: string | null
}

/** BE NotificationCenterPage record 와 1:1. */
export interface NotificationCenterPage {
  content: NotificationCenter[]
  number: number
  size: number
  totalElements: number
  totalPages: number
}

export async function fetchMyUnread(): Promise<NotificationCenter[]> {
  const res = await apiClient.get<ApiEnvelope<NotificationCenter[]>>('/api/notifications/my')
  return res.data.data
}

export async function fetchHistory(page = 0, size = 50): Promise<NotificationCenterPage> {
  const res = await apiClient.get<ApiEnvelope<NotificationCenterPage>>(
    '/api/notifications/history',
    { params: { page, size } },
  )
  return res.data.data
}

export async function acknowledgeNotification(id: string): Promise<void> {
  await apiClient.post(`/api/notifications/${encodeURIComponent(id)}/acknowledge`)
}

/**
 * 메신저 수신함 열람과 통합 알림 배지를 함께 확인 처리한다.
 *
 * @param messageIds 방금 markRead에 성공한 messageId 집합. 지정하면 그 알림만 확인 처리한다.
 *   생략(undefined)하면 미열람 MESSENGER 알림 전체를 확인 처리한다(레거시 호출부 호환).
 *   지정 시, 화면에 아직 보이지 않은(예: 다음 페이지) 쪽지의 알림까지 앞서 확인 처리되어
 *   배지가 실제보다 먼저 0이 되는 것을 막는다.
 */
export async function acknowledgeMessengerNotifications(messageIds?: string[]): Promise<void> {
  const notifications = await fetchMyUnread()
  const scope = messageIds ? new Set(messageIds) : null
  await Promise.all(
    notifications
      .filter((notification) => notification.channel === 'MESSENGER')
      .filter((notification) => !scope || (notification.refId !== null && scope.has(notification.refId)))
      .map((notification) => acknowledgeNotification(notification.id)),
  )
}

/** 채널별 그룹핑 헬퍼 — dropdown panel section 렌더용. */
export function groupByChannel(
  notifications: NotificationCenter[],
): Record<string, NotificationCenter[]> {
  const out: Record<string, NotificationCenter[]> = {}
  for (const n of notifications) {
    const key = n.channel
    if (!out[key]) out[key] = []
    out[key].push(n)
  }
  return out
}

/** 채널 키 → 사용자 노출 라벨. */
export const CHANNEL_LABEL: Record<string, string> = {
  SAFETY_STOCK: '안전재고',
  MESSENGER: '메신저',
  APPROVAL: '결재',
  ECOUNT_IMPORT: '이카운트 이관',
}
