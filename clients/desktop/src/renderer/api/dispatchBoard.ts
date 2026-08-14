/**
 * 배차 메뉴 (Samhan Public Phase A) — 미배차 출고전표 조회 API 클라이언트.
 *
 * <p>spec: docs/superpowers/specs/2026-05-14-samhan-dispatch-board-design.md § 6
 *
 * BE 출처 (Phase A BE Team):
 * - `slip-service` `GET /admin/dispatch-board/undispatched-slips?from=&to=&statuses=&page=&size=`
 *   → `Page<SlipBoardResponse>`
 *
 * 노출 endpoint:
 * <ul>
 *   <li>{@link listUnDispatchedSlips} — 일자 범위 + 상태 + 페이지네이션 (50/page default).</li>
 *   <li>{@link getDispatchBoardSlipDetail} — 배차보드 전표확인용 출고전표 상세.</li>
 * </ul>
 *
 * UUID 비공개 가드 (feedback_uuid_no_user_visibility.md):
 * - 응답 객체의 {@code id} (slip UUID) 는 drag payload / API path 에만 사용.
 * - 화면 노출 식별자 = {@code slipNo} / {@code partnerCode} / {@code partnerName}.
 *
 * 한국어 timezone (Asia/Seoul) — 일자 default 는 화면 컴포넌트에서 ±1일 계산하여 전달한다.
 *
 * @see DispatchBoardPage
 * @see UnDispatchedSlipList
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'
import type { SlipDetail } from './slip'

/**
 * 미배차 슬립 dispatchStatus 3 값 — BE {@code SlipDispatchStatus} enum 과 1:1.
 *
 * <p>spec § 4.2:
 * - {@code UNDISPATCHED} (default) — 배차 메뉴 "미배차" source.
 * - {@code DISPATCHING} — 배차 완료 후 매칭 대기.
 * - {@code DISPATCHED} — 매칭 완료 회신 후.
 */
export type SlipDispatchStatus = 'UNDISPATCHED' | 'DISPATCHING' | 'DISPATCHED'

/**
 * dispatchStatus 한국어 라벨 — 상태 select / 배지 노출용.
 */
export const SLIP_DISPATCH_STATUS_LABEL: Record<SlipDispatchStatus, string> = {
  UNDISPATCHED: '미배차',
  DISPATCHING: '발송 완료, 매칭 대기',
  DISPATCHED: '배차 완료',
}

/**
 * 모든 SlipDispatchStatus 옵션 — 필터 multi-select 용.
 */
export const SLIP_DISPATCH_STATUS_OPTIONS: SlipDispatchStatus[] = [
  'UNDISPATCHED',
  'DISPATCHING',
  'DISPATCHED',
]

/**
 * 배차 보드 미배차 슬립 응답 — BE {@code SlipBoardResponse} 와 1:1.
 *
 * <p>spec § 4.2 + § 5.1 + Phase A plan F2.1 (개발책임자 확정 schema).
 *
 * @property id 슬립 UUID — drag payload / API path 에만 사용 (UUID 비공개).
 * @property slipNo 전표번호 (사용자 노출 식별자, 예: "2026/05/14-1").
 * @property slipDate 영업일 (yyyy-MM-dd).
 * @property partnerCode 거래처 코드 (사용자 노출, 예: "P-1234").
 * @property partnerName 거래처명 (사용자 노출, 예: "대구공조").
 * @property deliveryAddress 인수자 주소 (모달 상세 + arologis 발송 payload).
 * @property recipientPhone 인수자 휴대폰 (010-XXXX-XXXX, 모달 상세).
 * @property inspectorName 검수자명. resolve 실패 시 null.
 * @property inspectorSignedAt 검수 완료 시각 (ISO datetime). 미검수/resolve 불가 시 null.
 * @property dispatchStatus 현재 dispatchStatus (필터 + 상태 배지 노출).
 */
export interface SlipBoardResponse {
  id: string
  slipNo: string
  slipDate: string
  partnerCode: string
  partnerName: string
  deliveryAddress: string | null
  recipientPhone: string | null
  inspectorName: string | null
  inspectorSignedAt: string | null
  dispatchStatus: SlipDispatchStatus | null
}

/**
 * 미배차 슬립 조회 요청 파라미터.
 *
 * @property from 조회 시작일 (ISO YYYY-MM-DD, default today-1).
 * @property to 조회 종료일 (ISO YYYY-MM-DD, default today+1).
 * @property statuses 필터 대상 dispatchStatus 리스트 (default `['UNDISPATCHED']`).
 * @property page 0-base 페이지 (default 0).
 * @property size 페이지 크기 (default 50).
 */
export interface ListUnDispatchedSlipsParams {
  from?: string
  to?: string
  statuses?: SlipDispatchStatus[]
  page?: number
  size?: number
}

/**
 * 미배차 출고전표 페이지네이션 조회.
 *
 * @param params 일자/상태/페이지 파라미터.
 * @return BE Page&lt;SlipBoardResponse&gt; envelope.
 */
export async function listUnDispatchedSlips(
  params: ListUnDispatchedSlipsParams,
): Promise<PageResponse<SlipBoardResponse>> {
  const queryParams: Record<string, string | number> = {}
  if (params.from) queryParams['from'] = params.from
  if (params.to) queryParams['to'] = params.to
  if (params.statuses && params.statuses.length > 0) {
    queryParams['statuses'] = params.statuses.join(',')
  }
  queryParams['page'] = params.page ?? 0
  queryParams['size'] = params.size ?? 50
  const res = await apiClient.get<ApiEnvelope<PageResponse<SlipBoardResponse>>>(
    '/admin/dispatch-board/undispatched-slips',
    { params: queryParams },
  )
  return res.data.data
}

/**
 * 배차보드 전표확인용 출고전표 상세 조회.
 *
 * <p>일반 {@code GET /slips/{id}} 는 sales.slip 권한을 따르므로 DISPATCH 역할에서는
 * 배차보드 미리보기 전용 endpoint 를 사용한다. UUID 는 path param 전용으로만 사용한다.
 *
 * @param id 전표 UUID
 * @return 출고전표 미리보기용 상세 응답
 */
export async function getDispatchBoardSlipDetail(id: string): Promise<SlipDetail> {
  const res = await apiClient.get<ApiEnvelope<SlipDetail>>(
    `/admin/dispatch-board/slips/${encodeURIComponent(id)}`,
  )
  return res.data.data
}

/**
 * `Asia/Seoul` today (yyyy-MM-dd). new Date 는 client local timezone 기준이지만
 * 사내 운영 PC 는 Seoul 고정이므로 단순 fallback 으로 충분 (TZ 미일치 시점 backlog).
 */
export function todayIsoSeoul(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * `todayIso` 기준 ±day 만큼 offset 한 yyyy-MM-dd.
 */
export function offsetIsoSeoul(baseIso: string, offsetDays: number): string {
  const d = new Date(baseIso + 'T00:00:00')
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
