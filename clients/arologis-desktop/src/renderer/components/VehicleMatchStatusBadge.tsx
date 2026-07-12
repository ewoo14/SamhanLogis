/**
 * VehicleMatchStatusBadge — 인성 퀵프로그램 vehicle 매칭 상태 뱃지.
 *
 * SP-10-2 FE-1. Designer wireframe (docs/design/sp-10-2-insung-quick-vendor/wireframe.md) 100% 인용.
 *
 * 상태 전이 (BE `VehicleStatus`(arologis domain) 6값 정합 — #785 fix):
 *   PENDING → MATCHING → ASSIGNED → DEPARTED → DELIVERED
 *   (임의 시점에 CANCELLED 분기 가능)
 *
 * 색상 토큰 (Designer tokens.md §5 CSS variable 직접 인용 + 기존 토큰 재사용):
 *   - PENDING  : --color-neutral-100 / --color-neutral-600
 *   - MATCHING : --color-brand-50 / --color-brand-700 (spinner: --color-brand-500)
 *   - ASSIGNED : --color-success-50 / --color-success-700
 *   - DEPARTED : --color-brand-50 / --color-brand-700 (MATCHING 계열 재사용 — 진행중 의미, 신규 토큰 없음)
 *   - DELIVERED: --color-neutral-50 / --color-neutral-500
 *   - CANCELLED: --color-danger-50 / --color-danger-700 (DISPATCH-DESIGN.md:71 "취소=danger" 선례 재사용)
 *   ※ DEPARTED/CANCELLED 색/아이콘 세부 시각 정교화는 Designer 후속 과제 — 현재는 crash-safe +
 *     한국어 라벨 + 기존 토큰 재사용까지만 반영 (#785 fix).
 *
 * 접근성:
 *   - 모든 상태에 aria-live="polite" 적용 (상태 전이 screen reader 자동 읽음)
 *   - 상태 전이 전체를 aria-live container 로 감쌈
 *
 * UUID 비공개 (feedback_uuid_no_user_visibility.md):
 *   - driverCode (INSUNG-{vendorDriverId}) 만 노출. 내부 UUID driverId 차단.
 *
 * Lucide 아이콘:
 *   - Clock (PENDING) / Spinner (MATCHING) / CheckCircle2 (ASSIGNED) / Truck (DEPARTED)
 *   / CheckCheck (DELIVERED) / XCircle (CANCELLED)
 *
 * degrade fallback (#785 fix):
 *   - 진짜 미지 상태값(향후 BE 확장분)은 raw 영문 노출 대신 고정 한국어
 *     "상태 확인 필요" 로 표시 (한국어 UI 컨벤션 — 과거 String(rawStatus) 영문 노출 버그 수정).
 */
import type { CSSProperties } from 'react'
import { Spinner } from '@samhan/design-system'
import { CheckCheck, CheckCircle2, Clock, Truck, XCircle } from 'lucide-react'

export type VehicleMatchStatus =
  | 'PENDING'
  | 'MATCHING'
  | 'ASSIGNED'
  | 'DEPARTED'
  | 'DELIVERED'
  | 'CANCELLED'

export interface VehicleMatchStatusBadgeProps {
  /** 현재 매칭 상태. */
  status: VehicleMatchStatus
  /**
   * 기사 코드 — ASSIGNED / DELIVERED 상태에서 표시.
   * 형식: "INSUNG-{vendorDriverId}". UUID driverId 는 전달 금지.
   */
  driverCode?: string
  /**
   * vendor 주문 ID (hover tooltip, FE-4 연계).
   * BE vehicle.vendor_order_id — UUID 아닌 vendor 측 주문 ID.
   */
  vendorOrderId?: string
}

// ---------------------------------------------------------------------------
// 스타일 상수 — Designer tokens.md §5 CSS variable 직접 인용
// ---------------------------------------------------------------------------

const STATUS_STYLE: Record<
  VehicleMatchStatus,
  {
    background: string
    border: string
    color: string
    fontWeight: number
  }
> = {
  PENDING: {
    background:  'var(--color-neutral-100)',
    border:      '1px solid var(--color-neutral-200)',
    color:       'var(--color-neutral-600)',
    fontWeight:  500, // --font-weight-medium
  },
  MATCHING: {
    background:  'var(--color-brand-50)',
    border:      '1px solid var(--color-brand-200)',
    color:       'var(--color-brand-700)',
    fontWeight:  600, // --font-weight-semibold
  },
  ASSIGNED: {
    background:  'var(--color-success-50)',
    border:      '1px solid var(--color-success-200)',
    color:       'var(--color-success-700)',
    fontWeight:  600,
  },
  // DEPARTED — MATCHING 과 동일 brand 계열 재사용(진행중 의미). 신규 디자인 토큰 없음.
  // 색/아이콘 세부 시각 정교화는 Designer 후속 과제 (#785 fix).
  DEPARTED: {
    background:  'var(--color-brand-50)',
    border:      '1px solid var(--color-brand-200)',
    color:       'var(--color-brand-700)',
    fontWeight:  600,
  },
  DELIVERED: {
    background:  'var(--color-neutral-50)',
    border:      '1px solid var(--color-neutral-200)',
    color:       'var(--color-neutral-500)',
    fontWeight:  500,
  },
  // CANCELLED — DISPATCH-DESIGN.md:71 "취소=danger" 선례 재사용. 신규 디자인 토큰 없음.
  // 색/아이콘 세부 시각 정교화는 Designer 후속 과제 (#785 fix).
  CANCELLED: {
    background:  'var(--color-danger-50)',
    border:      '1px solid var(--color-danger-200)',
    color:       'var(--color-danger-700)',
    fontWeight:  600,
  },
}

const STATUS_LABEL: Record<VehicleMatchStatus, string> = {
  PENDING:   '대기 중',
  MATCHING:  '매칭 중...',
  ASSIGNED:  '매칭 완료',
  DEPARTED:  '출발',
  DELIVERED: '배송 완료',
  CANCELLED: '취소됨',
}

const STATUS_SUBTEXT: Record<VehicleMatchStatus, string> = {
  PENDING:   '매칭이 시도되지 않았습니다',
  MATCHING:  '인성 퀵프로그램 기사 배정 중',
  ASSIGNED:  '', // driverCode 로 대체
  DEPARTED:  '차량이 출발했습니다',
  DELIVERED: '', // driverCode + "전자서명 수신" 으로 대체
  CANCELLED: '매칭이 취소되었습니다',
}

const STATUS_ARIA_LABEL: Record<VehicleMatchStatus, string> = {
  PENDING:   '매칭 대기 중',
  MATCHING:  '인성 기사 매칭 진행 중',
  ASSIGNED:  '인성 기사 매칭 완료',
  DEPARTED:  '차량 출발, 배송 진행 중',
  DELIVERED: '배송 완료, 전자서명 수신',
  CANCELLED: '매칭 취소됨',
}

/**
 * 진짜 미지 상태값(향후 BE VehicleStatus 확장분) degrade fallback 라벨.
 * raw 영문 값(String(rawStatus)) 노출 금지 — 고정 한국어 문구만 사용 (#785 fix).
 */
const UNKNOWN_STATUS_FALLBACK_LABEL = '상태 확인 필요'

// INSUNG 뱃지 — pill shape, vendor 뱃지 SP-09 패턴 일관
const INSUNG_BADGE_STYLE: CSSProperties = {
  background:   'var(--color-insung-50)',
  border:       '1px solid var(--color-insung-200)',
  color:        'var(--color-insung-text)',
  borderRadius: 'var(--radius-full)',
  padding:      '2px 8px',
  fontSize:     '11px',
  fontWeight:   700,
  flexShrink:   0,
}

// ---------------------------------------------------------------------------
// 아이콘 렌더 헬퍼
// ---------------------------------------------------------------------------

function isVehicleMatchStatus(status: unknown): status is VehicleMatchStatus {
  return typeof status === 'string' && Object.prototype.hasOwnProperty.call(STATUS_STYLE, status)
}

function StatusIcon({ status }: { status: VehicleMatchStatus }): JSX.Element {
  const size = 16

  switch (status) {
    case 'PENDING':
      return (
        <Clock
          size={size}
          color="var(--color-neutral-400)"
          aria-hidden="true"
        />
      )
    case 'MATCHING':
      // design-system Spinner 재사용 — 신규 컴포넌트 작성 금지
      return (
        <Spinner
          size="sm"
          tone="var(--color-brand-500)"
          label="매칭 중"
        />
      )
    case 'ASSIGNED':
      return (
        <CheckCircle2
          size={size}
          color="var(--color-success-500)"
          aria-hidden="true"
        />
      )
    case 'DEPARTED':
      // MATCHING 과 동일 brand 톤 재사용 — 세부 시각 정교화는 Designer 후속 (#785 fix)
      return (
        <Truck
          size={size}
          color="var(--color-brand-500)"
          aria-hidden="true"
        />
      )
    case 'DELIVERED':
      return (
        <CheckCheck
          size={size}
          color="var(--color-success-500)"
          aria-hidden="true"
        />
      )
    case 'CANCELLED':
      // NotifyStatusChip FAILED 케이스와 동일 danger 톤 재사용 (#785 fix)
      return (
        <XCircle
          size={size}
          color="var(--color-danger-500)"
          aria-hidden="true"
        />
      )
  }
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

/**
 * 인성 퀵프로그램 vehicle 매칭 상태 뱃지.
 *
 * @param status 현재 매칭 상태 (PENDING/MATCHING/ASSIGNED/DEPARTED/DELIVERED/CANCELLED)
 * @param driverCode 기사 코드 (INSUNG-{vendorDriverId} 형식, ASSIGNED/DELIVERED 시 표시)
 * @param vendorOrderId vendor 주문 ID (FE-4 hover tooltip 용, UUID 아님)
 */
export function VehicleMatchStatusBadge({
  status,
  driverCode,
  vendorOrderId,
}: VehicleMatchStatusBadgeProps): JSX.Element {
  const rawStatus: unknown = status
  const safeStatus = isVehicleMatchStatus(rawStatus) ? rawStatus : 'PENDING'
  const style = STATUS_STYLE[safeStatus]
  // #785 fix: 진짜 미지 값(향후 BE 확장분)은 raw 영문(String(rawStatus)) 대신
  // 고정 한국어 fallback 사용 — safeStatus 는 PENDING 유지(스타일/아이콘용).
  const label = isVehicleMatchStatus(rawStatus)
    ? STATUS_LABEL[rawStatus]
    : UNKNOWN_STATUS_FALLBACK_LABEL
  const subText = isVehicleMatchStatus(rawStatus) ? STATUS_SUBTEXT[rawStatus] : ''
  const ariaLabel =
    safeStatus === 'ASSIGNED' && driverCode
      ? `인성 기사 매칭 완료, 기사 코드 ${driverCode}`
      : isVehicleMatchStatus(rawStatus)
        ? STATUS_ARIA_LABEL[rawStatus]
        : UNKNOWN_STATUS_FALLBACK_LABEL
  const showInsungBadge = safeStatus === 'MATCHING' || safeStatus === 'ASSIGNED'
  const showDriverCode =
    (safeStatus === 'ASSIGNED' || safeStatus === 'DELIVERED') && Boolean(driverCode)

  // FE-4: vendorOrderId hover tooltip — UUID 아닌 vendor 주문 ID 만 노출
  const tooltipTitle = vendorOrderId
    ? `인성 주문 ID: ${vendorOrderId}`
    : undefined

  return (
    // aria-live container — 상태 전이 전체를 screen reader 가 읽음
    <div
      aria-live="polite"
      aria-label={ariaLabel}
      data-testid="vehicle-match-status-badge"
      title={tooltipTitle}
      style={{
        display:       'inline-flex',
        flexDirection: 'column',
        gap:           4,
        minWidth:      140,
        padding:       'var(--space-1) var(--space-2)', // 4px 8px
        borderRadius:  'var(--radius-md)',               // 4px
        fontSize:      'var(--font-size-sm)',             // 13px
        background:    style.background,
        border:        style.border,
        color:         style.color,
      }}
    >
      {/* 첫 번째 줄: 아이콘 + 라벨 + (INSUNG 뱃지) */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          gap:            'var(--space-1)',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <StatusIcon status={safeStatus} />
          <span style={{ fontWeight: style.fontWeight }}>{label}</span>
        </div>
        {showInsungBadge && (
          <span
            aria-label="인성데이타 퀵프로그램 vendor"
            data-testid="insung-vendor-badge"
            style={INSUNG_BADGE_STYLE}
          >
            INSUNG
          </span>
        )}
      </div>

      {/* 두 번째 줄: driverCode (ASSIGNED/DELIVERED) 또는 서브텍스트 */}
      {showDriverCode ? (
        <span
          data-testid="match-status-driver-code"
          style={{
            fontFamily: 'var(--font-family-mono)',
            fontSize:   'var(--font-size-xs)', // 12px
            color:
              safeStatus === 'ASSIGNED'
                ? 'var(--color-success-600)'
                : 'var(--color-neutral-400)',
            fontWeight: 400,
          }}
        >
          {safeStatus === 'DELIVERED'
            ? `${driverCode} · 전자서명 수신`
            : driverCode}
        </span>
      ) : subText ? (
        <span
          style={{
            fontSize: 'var(--font-size-xs)', // 12px
            color:
              safeStatus === 'MATCHING'
                ? 'var(--color-brand-500)'
                : 'var(--color-neutral-500)',
          }}
        >
          {subText}
        </span>
      ) : null}
    </div>
  )
}

export default VehicleMatchStatusBadge
