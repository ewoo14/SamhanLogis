import type React from 'react'

/**
 * DispatchDetailPage — 배차 상세 조회 페이지.
 *
 * SP-10-2 FE-3 / FE-4 산출 파일. `/dispatches/detail/:dispatchCode` (임시 경로).
 *
 * <h2>SP-10-2 신규 섹션</h2>
 * <ul>
 *   <li>FE-1: VehicleMatchStatusBadge — 4단계 매칭 상태 (PENDING/MATCHING/ASSIGNED/DELIVERED)</li>
 *   <li>FE-2: InsungLbsPanel — GPS 위치 소스 우선순위 패널 (ASSIGNED/DELIVERED 상태에서만 표시)</li>
 *   <li>FE-3: 알림톡 발송 결과 row — 인성 알림톡 / Aligo SMS 채널 분리</li>
 *   <li>FE-4: vendorOrderId hover tooltip — vehicle row hover 시 인성 주문 ID 표시 (UUID 아님)</li>
 * </ul>
 *
 * <h2>UUID 비공개 (feedback_uuid_no_user_visibility.md)</h2>
 * <ul>
 *   <li>dispatchId UUID — 사용자 노출 X, path 라우팅만 사용</li>
 *   <li>vehicleId UUID — 사용자 노출 X, vehicle row 식별 = sequence</li>
 *   <li>driverId UUID — 사용자 노출 X, 기사 표시 = driverCode (INSUNG-xxx)</li>
 *   <li>vendorOrderId — vendor 측 주문 ID (UUID 아님), hover tooltip 에만 노출</li>
 * </ul>
 *
 * <h2>알림 채널 정책</h2>
 * <ul>
 *   <li>배차 단계: "Aligo SMS" (notify.dispatch-channel=aligo)</li>
 *   <li>인성 알림톡: 향후 인성 알림톡 vendor 연동 예약 채널</li>
 * </ul>
 *
 * <h2>data-testid</h2>
 * <ul>
 *   <li>dispatch-detail-page</li>
 *   <li>insung-sandbox-banner (sandboxMode=true 시)</li>
 *   <li>vehicle-row-{sequence}</li>
 *   <li>notification-result-section</li>
 *   <li>notify-row-{channel}</li>
 *   <li>channel-badge-insung-talk / channel-badge-aligo (채널 뱃지)</li>
 *   <li>notification-status-chip-success / -failed / -delayed</li>
 *   <li>notification-masked-phone (마스킹 번호)</li>
 *   <li>notification-fail-reason (FAILED 상태 사유)</li>
 * </ul>
 */
import { CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'
import {
  VehicleMatchStatusBadge,
  type VehicleMatchStatus,
} from '../../components/VehicleMatchStatusBadge'
import {
  InsungLbsPanel,
  type GpsSource,
} from '../../components/InsungLbsPanel'
import { ManualLocationForm } from '../../components/ManualLocationForm'
import { maskPhone } from '../../utils/maskPhone'
import { usePageTitle } from '../../hooks/usePageTitle'

// ---------------------------------------------------------------------------
// API 타입 정의 (BE SP-10-2 contract 준수)
// ---------------------------------------------------------------------------

export type NotifyChannel = 'insung-talk' | 'aligo'
export type NotifyStatus  = 'SUCCESS' | 'FAILED' | 'DELAYED'

/** BE 알림 발송 결과 DTO */
export interface NotifyResult {
  /** 발송 채널 */
  channel: NotifyChannel
  /** 발송 상태 */
  status: NotifyStatus
  /** 발송 시각 (ISO 8601) */
  sentAt: string | null
  /** 수신자 번호 (FE 에서 maskPhone() 적용) */
  recipientPhone: string | null
  /** 실패 사유 (FAILED 시 표시) */
  errorCode: string | null
}

/** 배차 상세 화면 vehicle 뷰모델 (BE vehicleId UUID 비공개) */
export interface VehicleDetail {
  /** 차량 순번 (사용자 노출) */
  sequence: number
  /** 톤수 라벨 */
  tonnageLabel: string
  /** 출발지 → 목적지 텍스트 */
  routeLabel: string
  /** 정차 수 */
  stopCount: number
  /** 매칭 상태 */
  matchStatus: VehicleMatchStatus
  /** 매칭 소스 — EXTERNAL_INSUNG_QUICK 일 때만 인성 vendor UI 를 표시한다. */
  matchSource: string | null
  /**
   * 기사 코드 — INSUNG-{vendorDriverId} 형식.
   * UUID driverId 는 노출 금지.
   */
  driverCode: string | null
  /**
   * vendor 주문 ID (BE vendor_order_id 컬럼).
   * UUID 아님 — hover tooltip 에만 표시.
   */
  vendorOrderId: string | null
  /** 알림 발송 결과 목록 */
  notifyResults?: NotifyResult[]
  /**
   * GPS 소스 목록.
   * BE 필드 누락 가능 — optional. notifyResults 와 동일 방어 패턴 (#785 family sweep).
   */
  gpsSources?: GpsSource[]
}

/** BE dispatch 상세 DTO */
export interface DispatchDetail {
  /** 내부 UUID — 사용자 노출 X */
  id: string
  /** 배차 일자 (YYYY-MM-DD) */
  dispatchDate: string
  /** 배차 유형 라벨 */
  dispatchTypeLabel: string
  /** sandbox 모드 여부 (BE ArologisMatcherProperties.sandboxMode) */
  sandboxMode: boolean
  /** 차량 목록 */
  vehicles: VehicleDetail[]
}

// ---------------------------------------------------------------------------
// 알림 채널 표기
// ---------------------------------------------------------------------------

const CHANNEL_LABEL: Record<NotifyChannel, string> = {
  'insung-talk': '인성 알림톡',
  'aligo':       'Aligo SMS',
}

/** 채널별 뱃지 스타일 */
const CHANNEL_BADGE_STYLE: Record<NotifyChannel, React.CSSProperties> = {
  'insung-talk': {
    background:   'var(--color-insung-50)',
    border:       '1px solid var(--color-insung-200)',
    color:        'var(--color-insung-text)',
  },
  'aligo': {
    background:   'var(--color-aligo-50)',
    border:       '1px solid var(--color-aligo-200)',
    color:        'var(--color-aligo-text)',
  },
}

// ---------------------------------------------------------------------------
// 알림 발송 실패 사유 한국어화 (#816 BE NotificationClient 실 에러코드)
// ---------------------------------------------------------------------------

/**
 * 고정 실패 사유 코드 → 한국어 메시지.
 * HTTP_{status} 코드는 접두사 매칭으로 동적 처리 (toKoreanErrorMessage 참고).
 */
const NOTIFY_ERROR_CODE_KO: Record<string, string> = {
  TOKEN_MISSING:    '설정 오류 — 관리자 문의',
  PHONE_MISSING:    '수신 번호 없음',
  CLIENT_EXCEPTION: '발송 서버 연결 오류',
  SEND_FAILED:      '발송 실패 — 잠시 후 재시도',
  INVALID_RESPONSE: '발송 응답 오류',
}

/**
 * 알림 발송 실패 errorCode → 한국어 사용자 메시지 변환.
 * 원본 코드는 화면에 그대로 노출하지 않는다 (title tooltip 전용 — ops 디버깅 목적).
 */
function toKoreanErrorMessage(errorCode: string): string {
  if (errorCode.includes('NOT_CONFIGURED') || errorCode.includes('API_KEY')) {
    return '설정 오류 — 관리자 문의'
  }
  if (errorCode.startsWith('HTTP_')) {
    return `발송 서버 오류 (${errorCode})`
  }
  return NOTIFY_ERROR_CODE_KO[errorCode] ?? '알 수 없는 오류'
}

// ---------------------------------------------------------------------------
// 알림 발송 상태 chip
// ---------------------------------------------------------------------------

interface NotifyStatusChipProps {
  status: NotifyStatus
  errorCode: string | null
}

function NotifyStatusChip({ status, errorCode }: NotifyStatusChipProps): JSX.Element {
  if (status === 'SUCCESS') {
    return (
      <span
        data-testid="notification-status-chip-success"
        style={{
          display:    'inline-flex',
          alignItems: 'center',
          gap:        4,
          background: 'var(--color-success-50)',
          color:      'var(--color-success-700)',
          fontSize:   'var(--font-size-sm)',
          padding:    '2px 8px',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <CheckCircle2 size={13} color="var(--color-success-500)" aria-hidden="true" />
        발송 성공
      </span>
    )
  }
  if (status === 'FAILED') {
    // BE 실 에러코드(TOKEN_MISSING/PHONE_MISSING/HTTP_*/CLIENT_EXCEPTION/SEND_FAILED/
    // INVALID_RESPONSE 등) → 한국어 사용자 메시지로 치환. 원본 코드는 title tooltip 전용.
    const safeErrorCode = errorCode ? toKoreanErrorMessage(errorCode) : '알 수 없는 오류'

    return (
      <span
        data-testid="notification-status-chip-failed"
        style={{
          display:      'inline-flex',
          alignItems:   'center',
          gap:          4,
          background:   'var(--color-danger-50)',
          color:        'var(--color-danger-700)',
          fontSize:     'var(--font-size-sm)',
          padding:      '2px 8px',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <XCircle size={13} color="var(--color-danger-500)" aria-hidden="true" />
        발송 실패
        {errorCode && (
          <span
            data-testid="notification-fail-reason"
            title={errorCode}
            style={{
              fontSize:     'var(--font-size-xs)',
              color:        'var(--color-danger-700)',
              marginLeft:   4,
              maxWidth:     180,
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
            }}
          >
            ({safeErrorCode})
          </span>
        )}
      </span>
    )
  }
  // DELAYED
  return (
    <span
      data-testid="notification-status-chip-delayed"
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          4,
        background:   'var(--color-warning-50)',
        color:        'var(--color-warning-800, #8C5C13)',
        fontSize:     'var(--font-size-sm)',
        padding:      '2px 8px',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <Clock size={13} color="var(--color-warning-500)" aria-hidden="true" />
      발송 지연
    </span>
  )
}

// ---------------------------------------------------------------------------
// 발송 시각 포맷 헬퍼
// ---------------------------------------------------------------------------

function formatSentAt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const today = new Date()
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (isToday) return `${hh}:${mm}`
  const yyyy = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mo}-${dd} ${hh}:${mm}`
}

// ---------------------------------------------------------------------------
// 알림 발송 결과 section (FE-3)
// ---------------------------------------------------------------------------

interface NotifyResultSectionProps {
  notifyResults?: NotifyResult[]
}

function NotifyResultSection({ notifyResults }: NotifyResultSectionProps): JSX.Element | null {
  const rows = notifyResults ?? []

  if (rows.length === 0) return null

  return (
    <div
      data-testid="notification-result-section"
      style={{
        paddingLeft: 24, // Designer spec: 정차 list 와 동일 시각 계층
        marginTop:   4,
      }}
    >
      <div
        style={{
          fontSize:     'var(--font-size-xs)', // 12px
          color:        'var(--color-neutral-500)',
          fontWeight:   500,
          marginBottom: 4,
        }}
      >
        알림 발송 결과
      </div>
      {rows.map((result) => {
        const rowBg =
          result.status === 'FAILED'
            ? 'var(--color-danger-50)'
            : result.status === 'DELAYED'
              ? 'var(--color-warning-50)'
              : 'var(--color-neutral-0)'

        return (
          <div
            key={result.channel}
            data-testid={`notify-row-${result.channel}`}
            style={{
              display:       'flex',
              alignItems:    'center',
              gap:           'var(--space-2)', // 8px
              padding:       'var(--space-1) var(--space-2)', // 4px 8px
              minHeight:     'var(--row-h)',   // 40px
              borderBottom:  '1px solid var(--color-neutral-100)',
              background:    rowBg,
              borderRadius:  'var(--radius-sm)',
            }}
          >
            {/* 채널 뱃지 */}
            <span
              data-testid={`channel-badge-${result.channel}`}
              style={{
                ...CHANNEL_BADGE_STYLE[result.channel],
                borderRadius: 'var(--radius-full)', // pill
                padding:      '2px 8px',
                fontSize:     '11px',
                fontWeight:   700,
                flexShrink:   0,
              }}
            >
              {CHANNEL_LABEL[result.channel]}
            </span>

            {/* 발송 상태 chip */}
            <NotifyStatusChip
              status={result.status}
              errorCode={result.errorCode}
            />

            {/* 발송 시각 */}
            <span
              style={{
                fontSize:   'var(--font-size-xs)',
                color:      'var(--color-neutral-500)',
                flexShrink: 0,
              }}
            >
              {formatSentAt(result.sentAt)}
            </span>

            {/* 수신자 마스킹 번호 */}
            <span
              data-testid="notification-masked-phone"
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize:   'var(--font-size-xs)',
                color:      'var(--color-neutral-600)',
              }}
            >
              {maskPhone(result.recipientPhone)}
            </span>

            {/* 지연 서브텍스트 */}
            {result.status === 'DELAYED' && (
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color:    'var(--color-warning-800, #8C5C13)',
                  marginLeft: 4,
                }}
              >
                응답 대기 중
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// sandbox 배너 (BE sandboxMode=true 연동)
// ---------------------------------------------------------------------------

function SandboxBanner(): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="insung-sandbox-banner"
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        background:   'var(--color-warning-50)',
        borderLeft:   '4px solid var(--color-warning-500)',
        padding:      '8px 12px',
        marginBottom: 16,
        borderRadius: 'var(--radius-sm)',
        fontSize:     'var(--font-size-sm)',
        color:        'var(--color-warning-800, #8C5C13)',
      }}
    >
      <AlertTriangle
        size={16}
        color="var(--color-warning-500)"
        aria-hidden="true"
      />
      인성 퀵프로그램 sandbox 모드 — 실 기사 배정 없음
    </div>
  )
}

// ---------------------------------------------------------------------------
// vehicle row (FE-1 / FE-2 / FE-3 / FE-4)
// ---------------------------------------------------------------------------

interface VehicleRowProps {
  vehicle: VehicleDetail
  dispatchCode: string
  onSaved: () => void
}

function VehicleRow({ vehicle, dispatchCode, onSaved }: VehicleRowProps): JSX.Element {
  const showGpsPanel =
    (vehicle.matchStatus === 'ASSIGNED' || vehicle.matchStatus === 'DELIVERED') &&
    Boolean(vehicle.driverCode)

  return (
    <div
      data-testid={`vehicle-row-${vehicle.sequence}`}
      style={{
        padding:      12,
        borderRadius: 'var(--radius-lg)',
        border:       '1px solid var(--color-neutral-200)',
        marginBottom: 8,
        background:   'var(--color-neutral-0)',
      }}
    >
      {/* vehicle header row: 톤수/경로 + VehicleMatchStatusBadge (FE-1/FE-4) */}
      <div
        style={{
          display:    'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap:        12,
        }}
      >
        <div>
          <strong style={{ fontSize: 'var(--font-size-base)' }}>
            차량 {vehicle.sequence}
          </strong>
          <span
            style={{
              marginLeft: 8,
              fontSize:   'var(--font-size-sm)',
              color:      'var(--color-neutral-500)',
            }}
          >
            {vehicle.routeLabel
              ? `${vehicle.tonnageLabel} · ${vehicle.routeLabel} (정차 ${vehicle.stopCount})`
              : `${vehicle.tonnageLabel} (정차 ${vehicle.stopCount})`}
          </span>
        </div>

        {/* FE-1 + FE-4: VehicleMatchStatusBadge with vendorOrderId tooltip */}
        <VehicleMatchStatusBadge
          status={vehicle.matchStatus}
          matchSource={vehicle.matchSource ?? undefined}
          driverCode={vehicle.driverCode ?? undefined}
          vendorOrderId={vehicle.vendorOrderId ?? undefined}
        />
      </div>

      {/* FE-2: InsungLbsPanel (ASSIGNED/DELIVERED 상태에서만 표시) */}
      {showGpsPanel && vehicle.driverCode && (
        <>
          <InsungLbsPanel
            driverCode={vehicle.driverCode}
            gpsSources={vehicle.gpsSources}
          />
          <ManualLocationForm
            dispatchCode={dispatchCode}
            sequence={vehicle.sequence}
            driverCode={vehicle.driverCode}
            onSaved={onSaved}
          />
        </>
      )}

      {/* FE-3: 알림톡 발송 결과 row */}
      <NotifyResultSection notifyResults={vehicle.notifyResults} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 페이지 컴포넌트
// ---------------------------------------------------------------------------

interface DispatchDetailPageProps {
  /** 배차 상세 데이터. null + loadError=false 이면 로딩 상태 표시. */
  dispatch: DispatchDetail | null
  /**
   * 상세 조회 실패 여부 (SP-10-2 cycle 3 fix — FE-C2-1 P1).
   * true 시 에러 UI (재시도 가이드 + 사용자 메시지) 렌더, false/undefined 시 로딩 표시.
   */
  loadError?: boolean
  /** 상세 데이터가 변경된 뒤 상위 라우트가 재조회할 callback. */
  onDataChanged?: () => void
}

/**
 * 배차 상세 페이지.
 *
 * SP-10-2 FE-3/FE-4: vehicle row 알림톡 발송 결과 + vendorOrderId hover tooltip 추가.
 * SP-10-2 cycle 3 FE-C2-1 fix: loadError 분기 → 영구 로딩 갇힘 회귀 방지.
 * 실제 데이터 로딩은 상위 라우트에서 React Query 로 처리, props 로 전달.
 */
export function DispatchDetailPage({
  dispatch,
  loadError = false,
  onDataChanged,
}: DispatchDetailPageProps): JSX.Element {
  usePageTitle(dispatch ? `배차 상세 — ${dispatch.dispatchDate}` : '배차 상세')

  if (!dispatch && loadError) {
    return (
      <div
        data-testid="dispatch-detail-load-error"
        role="alert"
        style={{
          padding: 24,
          color:   'var(--color-danger-700, #B91C1C)',
          background: 'var(--color-danger-50, #FEF2F2)',
          border: '1px solid var(--color-danger-200, #FECACA)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--font-size-base)',
          maxWidth: 520,
          margin: '24px auto',
        }}
      >
        <strong style={{ display: 'block', marginBottom: 8 }}>
          배차 정보를 불러오지 못했습니다
        </strong>
        <span style={{ color: 'var(--color-neutral-600)', fontSize: 'var(--font-size-sm)' }}>
          네트워크 상태를 확인한 뒤 페이지를 새로고침해주세요. 문제가 지속되면 관리자에게
          문의해주세요.
        </span>
      </div>
    )
  }

  if (!dispatch) {
    return (
      <div
        data-testid="dispatch-detail-loading"
        style={{
          padding: 24,
          color:   'var(--color-neutral-500)',
          fontSize: 'var(--font-size-base)',
        }}
      >
        배차 정보를 불러오는 중...
      </div>
    )
  }

  // BE 필드 누락 방어 — notifyResults/gpsSources 와 동일 패턴 (#785 family sweep).
  // DispatchDetail.vehicles 는 타입상 required 이나 런타임 누락 대비 가드.
  const vehicles = dispatch.vehicles ?? []

  return (
    <div
      data-testid="dispatch-detail-page"
      style={{ padding: 16 }}
    >
      {/* sandbox 모드 경고 배너 (BE sandboxMode=true 연동) */}
      {dispatch.sandboxMode && <SandboxBanner />}

      {/* 배차 메타 정보 */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 4px' }}>
          배차 상세
        </h3>
        <p
          style={{
            margin:   0,
            fontSize: 'var(--font-size-sm)',
            color:    'var(--color-neutral-500)',
          }}
        >
          {dispatch.dispatchDate} · {dispatch.dispatchTypeLabel} · 차량{' '}
          {vehicles.length}대
        </p>
      </div>

      {/* 차량 목록 */}
      <div>
        {vehicles.map((vehicle) => (
          <VehicleRow
            key={vehicle.sequence}
            vehicle={vehicle}
            dispatchCode={dispatch.id}
            onSaved={onDataChanged ?? (() => undefined)}
          />
        ))}
      </div>
    </div>
  )
}

export default DispatchDetailPage
