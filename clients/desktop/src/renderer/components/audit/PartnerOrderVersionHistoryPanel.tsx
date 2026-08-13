/**
 * 거래처 주문 버전이력 패널 + 복원 — Phase 2.4 Task 9 FE.
 *
 * <p>{@link ../../api/partnerOrderRevision} 의 {@code listPartnerOrderRevisions} 로
 * 버전이력(최신 우선)을 표시하고, 각 시점에 대해 "이 시점으로 복원" 액션을 제공한다.
 * 복원은 DS Modal confirm 후 {@code restorePartnerOrderRevision} mutation 으로 실행되며,
 * 성공 시 주문 상세 (['partner-order', orderId]) + 목록 prefix (['partner-orders']) +
 * 버전이력 (['partner-order-revisions', orderId]) cache 를 무효화한다 (F5 stale 회귀 차단).
 *
 * <h2>복원 가드 (설계서 §3.5, 개발책임자 결정 2026-05-30)</h2>
 * <p>제외목록 방식: {@code CONFIRMING} / {@code CANCELED} 상태면 복원 버튼을 비활성화하고
 * 안내 문구를 노출한다. DRAFT / CONFIRMED 는 활성 (CONFIRMED 복원 후 slipResyncRequired 경고).
 *
 * <h2>slipResyncRequired 경고</h2>
 * <p>CONFIRMED 주문을 복원하면 BE 응답 {@code slipResyncRequired=true}. 이 경우
 * "연결된 출고전표 재발행이 필요할 수 있습니다." 경고 배너를 추가 노출한다.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>본 패널은 UUID 를 화면에 노출하지 않는다 — path 전용으로만 orderId 를 사용하고,
 * 표시 텍스트는 actorName / orderNo 만 노출한다 ([[uuid-no-user-visibility]]).
 * actorName 이 UUID 패턴이면 방어적으로 마스킹한다 (게이트웨이 X-User-Name 미전파 방어선).
 *
 * <p>{@link ./PartnerVersionHistoryPanel} 미러 (partner-service → partner-order-service 이식).
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Badge, Button, Card, Modal, Spinner, safeActorName } from '@samhan/design-system'
import {
  listPartnerOrderRevisions,
  restorePartnerOrderRevision,
  type PartnerOrderRevision,
  type PartnerOrderRevisionType,
} from '../../api/partnerOrderRevision'
import { type PartnerOrderStatus } from '../../api/sales'
import { presenceColorToHex } from '../../utils/presenceColor'

export interface PartnerOrderVersionHistoryPanelProps {
  /**
   * 주문 UUID — react-query 키 + API path 전용.
   * UUID 는 화면 표시에 사용하지 않는다 ([[uuid-no-user-visibility]]).
   */
  orderId: string
  /**
   * 현재 주문 상태 — 복원 버튼 활성/비활성 판정.
   * CONFIRMING / CANCELED 면 비활성 (설계서 §3.5 제외목록 방식).
   */
  status: PartnerOrderStatus
  /** 협업 패널과 공유하는 선택 revision 번호. */
  activeRevisionNo?: number | null
  /**
   * 코멘트 anchor 와 공유하는 필드 경로.
   *
   * <p>현 API({@link PartnerOrderRevision})는 revision 별 field-level 변경 목록을 제공하지
   * 않아 Slip 수준(field 단위 정확 매칭)의 하이라이트는 불가하다. 코멘트가 가리키는
   * 필드는 항상 "현재" 문서 상태에 대한 것이므로, 그 필드를 담고 있는 최신(현재)
   * revision 행만 근사적으로 하이라이트한다(row-level highlight) — 개발책임자 확인 시
   * revision DTO 에 fieldChanges 가 추가되면 Slip 과 동일한 field 단위 매칭으로 교체한다.
   */
  activeFieldPath?: string | null
  /** 버전 행 선택 시 협업 패널에 공유한다. */
  onRevisionSelect?: (revisionNo: number, fieldPaths?: string[], meta?: { isLatest?: boolean }) => void
}

/**
 * revision 유형별 한국어 라벨 + Badge 변형.
 * STATUS 는 긍정/부정 혼재 이벤트이므로 neutral 사용 — EDIT(brand) 색 중복 방지 (cycle2 비차단-2).
 * CREATE 도 neutral 이나 라벨('생성' vs '상태변경')로 시각 구분됨.
 */
const REVISION_TYPE_META: Record<
  PartnerOrderRevisionType,
  { label: string; variant: 'neutral' | 'brand' | 'warning' | 'success' | 'danger' | 'nts' }
> = {
  CREATE: { label: '생성', variant: 'neutral' },
  EDIT: { label: '수정', variant: 'brand' },
  STATUS: { label: '상태변경', variant: 'neutral' },
  RESTORE: { label: '복원', variant: 'warning' },
  DELETE: { label: '삭제', variant: 'danger' },
}

/**
 * 복원 허용 상태 판정 — 제외목록 방식.
 * CONFIRMING(발행 중 transient) / CANCELED(취소) 는 복원 불가.
 * DRAFT / CONFIRMED 및 추후 추가될 상태는 허용.
 */
function isRestorableStatus(status: PartnerOrderStatus): boolean {
  return status !== 'CONFIRMING' && status !== 'CANCELED'
}

/**
 * 복원 endpoint 상태 코드별 사용자 안내.
 *
 * <p>업무 충돌(409)만 서버 메시지를 표시하고, 권한/인증/자원 부재는 사용자가
 * 취할 조치를 안내한다. 그 외 상태 코드는 내부 사정이 새지 않도록 일반 문구로 감춘다.
 */
export function partnerOrderRestoreErrorMessage(error: unknown): string {
  const fallback = '주문 복원에 실패했습니다. 다시 시도해 주세요.'
  if (!isAxiosError(error)) return fallback

  // 401은 공통 apiClient 인터셉터가 먼저 세션 정리·로그인 이동 처리하므로 이 함수에 도달하지 않는다.
  switch (error.response?.status) {
    case 403:
      return '주문 복원 권한이 없습니다. MASTER, MANAGER 또는 SALES 권한이 있는 담당자에게 요청해 주세요.'
    case 404:
      return '복원할 주문 또는 버전을 찾을 수 없습니다. 최신 주문 정보를 확인해 주세요.'
    case 409: {
      const message = (error.response.data as { message?: unknown } | undefined)?.message
      return typeof message === 'string' && message.trim() ? message.trim() : fallback
    }
    default:
      return fallback
  }
}

/** UUID 형태 문자열 판별 — actorName 에 계정 UUID 가 섞여 들어와도 화면 노출을 차단(방어). */
/**
 * actorName 을 화면 표시용으로 정제 — UUID 형태면 노출하지 않는다 ([[uuid-no-user-visibility]]).
 * BE 가 표시명을 채우지 못해 UUID 가 들어오는 경우의 방어선 (주 수정은 BE actorName=null 처리).
 */
function displayActor(actorName: string | null | undefined): string | null {
  return safeActorName(actorName)
}

/**
 * LocalDateTime 문자열 → "YYYY-MM-DD HH:mm" 표시.
 * 방어적 파싱: ISO 문자열(정상), 배열 직렬화 잔존, 기타 포맷 모두 처리.
 * BE write-dates-as-timestamps=false 설정이 없을 때도 깨지지 않게 Date 파싱으로 fallback.
 */
function formatLocalDateTime(iso: string | unknown): string {
  if (!iso) return '-'
  // 정상 경로: ISO 8601 문자열 "2026-05-29T14:32:18" — slice 로 빠르게 처리.
  if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) {
    return iso.slice(0, 16).replace('T', ' ')
  }
  // 방어 경로: BE 가 timestamp 배열([2026,5,29,14,32,18]) 이나 다른 포맷을 내보낸 경우.
  const d = new Date(Array.isArray(iso) ? (iso as number[]).join('/') : String(iso))
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(/\.\s*/g, '-').replace(',', '').slice(0, 16)
}

/**
 * 변경 요약 1줄 — "헤더 N · 라인 +a/-b/~c".
 * 전부 0 이면 "변경 없음" (CREATE 등).
 */
function formatChangeSummary(rev: PartnerOrderRevision): string {
  const { headerChanged, lineAdded, lineRemoved, lineModified } = rev.changeSummary
  if (headerChanged === 0 && lineAdded === 0 && lineRemoved === 0 && lineModified === 0) {
    return '변경 없음'
  }
  return `헤더 ${headerChanged} · 라인 +${lineAdded}/-${lineRemoved}/~${lineModified}`
}

/**
 * 거래처 주문 상세 화면용 버전이력 패널.
 * 주문 라인 하단에 배치한다.
 */
export function PartnerOrderVersionHistoryPanel({
  orderId,
  status,
  activeRevisionNo = null,
  activeFieldPath = null,
  onRevisionSelect,
}: PartnerOrderVersionHistoryPanelProps) {
  const queryClient = useQueryClient()
  const [historyOpen, setHistoryOpen] = useState(false)

  /** 복원 confirm modal 대상 revision (null = 미오픈). */
  const [restoreTarget, setRestoreTarget] = useState<PartnerOrderRevision | null>(null)

  /** 복원 성공/실패 + slipResyncRequired 토스트. */
  const [toast, setToast] = useState<{
    kind: 'success' | 'danger' | 'warning'
    text: string
  } | null>(null)

  /** CONFIRMING / CANCELED 상태면 복원 버튼 비활성. */
  const restorable = isRestorableStatus(status)

  const revisionsQuery = useQuery({
    queryKey: ['partner-order-revisions', orderId],
    queryFn: () => listPartnerOrderRevisions(orderId),
    enabled: !!orderId && historyOpen,
  })

  const restoreMutation = useMutation({
    mutationFn: (revisionNo: number) => restorePartnerOrderRevision(orderId, revisionNo),
    onSuccess: (result, revisionNo) => {
      setRestoreTarget(null)
      // F5 stale 회귀 차단 — 상세 단건 + 목록(prefix) + 버전이력 전부 무효화.
      // ['partner-orders'] prefix 무효화 → 목록 queryKey(['partner-orders', dateFrom, ...]) 전부 적중.
      // ['partner-orders', orderId] 는 목록 queryKey prefix 와 불일치하므로 사용 금지.
      void queryClient.invalidateQueries({ queryKey: ['partner-order', orderId] })
      void queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
      void queryClient.invalidateQueries({ queryKey: ['partner-order-revisions', orderId] })

      if (result.slipResyncRequired) {
        // CONFIRMED 복원 — slip 재발행 필요 경고 우선 노출.
        setToast({
          kind: 'warning',
          text: `버전 ${revisionNo} 시점으로 주문을 복원했습니다.\n⚠ 판매전표가 발행된 주문입니다. 연결 전표 재발행을 확인하세요.`,
        })
      } else {
        setToast({
          kind: 'success',
          text: `버전 ${revisionNo} 시점으로 주문을 복원했습니다.`,
        })
      }
    },
    onError: (error) => {
      setRestoreTarget(null)
      setToast({ kind: 'danger', text: partnerOrderRestoreErrorMessage(error) })
    },
  })

  const revisions: PartnerOrderRevision[] = Array.isArray(revisionsQuery.data)
    ? revisionsQuery.data
    : []

  useEffect(() => {
    if (activeRevisionNo !== null || activeFieldPath) setHistoryOpen(true)
  }, [activeFieldPath, activeRevisionNo])

  return (
    <Card
      padding={4}
      shadow="sm"
      style={{ marginTop: 24 }}
      data-testid="partner-order-version-history-panel"
    >
      <Button
        variant="secondary"
        type="button"
        data-testid="partner-order-version-history-open"
        onClick={() => setHistoryOpen(true)}
      >
        버전이력
      </Button>

      {/* 복원 불가 상태 안내 — CONFIRMING / CANCELED 는 복원 불가 */}
      {!restorable ? (
        <p
          data-testid="partner-order-version-history-locked-note"
          style={{
            margin: '0 0 12px',
            fontSize: 13,
            color: 'var(--color-neutral-600)',
          }}
        >
          {status === 'CANCELED'
            ? '취소된 주문은 복원할 수 없습니다.'
            : '확정 처리 중인 주문은 복원할 수 없습니다.'}
        </p>
      ) : null}

      {/* 복원 결과 토스트 — 사용자 닫기 가능.
          role 분기: success=status(polite), warning/danger=alert(즉시 인터럽트, 설계서 §3 기준). */}
      {toast ? (
        <div
          role={toast.kind === 'success' ? 'status' : 'alert'}
          data-testid="partner-order-version-history-toast"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            padding: '10px 12px',
            marginBottom: 12,
            borderRadius: 6,
            border: '1px solid',
            borderColor:
              toast.kind === 'success'
                ? 'var(--color-success-200, #a7f3d0)'
                : toast.kind === 'warning'
                  ? 'var(--color-warning-300, #F1C268)'
                  : 'var(--color-danger-300, #FCA5A5)',
            background:
              toast.kind === 'success'
                ? 'var(--color-success-50, #ecfdf5)'
                : toast.kind === 'warning'
                  ? 'var(--color-warning-50, #FEF6E7)'
                  : 'var(--color-danger-50, #FFF1F1)',
            color:
              toast.kind === 'success'
                ? 'var(--color-success-700, #047857)'
                : toast.kind === 'warning'
                  ? 'var(--color-warning-800, #8C5C13)'
                  : 'var(--color-danger-800, #7F1D1D)',
            fontSize: 13,
          }}
        >
          <span style={{ whiteSpace: 'pre-line' }}>{toast.text}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setToast(null)}
            aria-label="알림 닫기"
            style={{ marginLeft: 'var(--space-2)', flexShrink: 0 }}
          >
            &times;
          </Button>
        </div>
      ) : null}

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="버전 이력"
        size="xl"
      >
      {revisionsQuery.isLoading ? (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}
          role="status"
        >
          <Spinner size="sm" label="버전 이력 불러오는 중" />
          <span style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
            버전 이력을 불러오는 중...
          </span>
        </div>
      ) : revisionsQuery.isError ? (
        <p
          role="alert"
          data-testid="partner-order-version-history-error"
          style={{ margin: 0, color: 'var(--color-danger-600)' }}
        >
          버전 이력을 불러오지 못했습니다.
        </p>
      ) : revisions.length === 0 ? (
        <p
          data-testid="partner-order-version-history-empty"
          style={{ margin: 0, color: 'var(--color-neutral-500)' }}
        >
          아직 버전 이력이 없습니다.
        </p>
      ) : (
        <ul
          data-testid="partner-order-version-history-list"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {revisions.map((rev) => {
            const meta = REVISION_TYPE_META[rev.revisionType]
            // 가장 최근 revision(목록 첫 항목)은 현재 상태이므로 복원 버튼을 노출하지 않는다.
            const isLatest = rev.revisionNo === revisions[0]?.revisionNo
            const actor = displayActor(rev.actorName)
            // field-level 변경 목록이 없어 activeFieldPath 는 "현재" 값을 담은 최신 행에만
            // row-level 로 근사 매칭한다(위 activeFieldPath prop 문서 참고).
            const isHighlighted = activeRevisionNo === rev.revisionNo
              || (!!activeFieldPath && isLatest)
            return (
              <li
                key={rev.revisionNo}
                data-testid={`partner-order-version-history-row-${rev.revisionNo}`}
                data-active={isHighlighted ? 'true' : undefined}
                aria-current={isHighlighted ? 'true' : undefined}
                tabIndex={onRevisionSelect ? 0 : undefined}
                onClick={() => onRevisionSelect?.(rev.revisionNo, [], { isLatest })}
                onKeyDown={(event) => {
                  if (!onRevisionSelect) return
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  onRevisionSelect(rev.revisionNo, [], { isLatest })
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px',
                  borderBottom: '1px solid var(--color-neutral-200)',
                  flexWrap: 'wrap',
                  borderRadius: 6,
                  background: isHighlighted ? 'var(--color-warning-50, #FEF6E7)' : 'transparent',
                  boxShadow: isHighlighted ? 'inset 3px 0 0 var(--color-warning-500, #E9A53D)' : undefined,
                  cursor: onRevisionSelect ? 'pointer' : undefined,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {/* 주문번호는 표시 식별자 (UUID 아님). */}
                    <strong style={{ fontSize: 14 }}>{rev.orderNo}</strong>
                    <Badge variant={meta.variant}>
                      {meta.label}
                      {rev.revisionType === 'RESTORE' && rev.sourceRevisionNo != null
                        ? ` (버전 ${rev.sourceRevisionNo})`
                        : ''}
                    </Badge>
                    {actor ? (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: rev.actorColor ? presenceColorToHex(rev.actorColor) : 'var(--color-neutral-600)',
                        }}
                      >
                        {actor}
                      </span>
                    ) : null}
                    <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                      {formatLocalDateTime(rev.createdAt)}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
                    {formatChangeSummary(rev)}
                  </span>
                </div>
                {!isLatest ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid={`partner-order-version-history-restore-button-${rev.revisionNo}`}
                    disabled={!restorable || restoreMutation.isPending}
                    onClick={(event) => {
                      event.stopPropagation()
                      setRestoreTarget(rev)
                    }}
                  >
                    이 시점으로 복원
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      </Modal>

      {/* 복원 confirm modal — DS Modal (native confirm 금지, PR #320 교훈). */}
      <Modal
        open={restoreTarget !== null}
        onClose={() => {
          if (!restoreMutation.isPending) setRestoreTarget(null)
        }}
        title="주문 복원"
        size="sm"
        data-testid="partner-order-version-history-restore-modal"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setRestoreTarget(null)}
              disabled={restoreMutation.isPending}
            >
              취소
            </Button>
            <Button
              variant="primary"
              loading={restoreMutation.isPending}
              data-testid="partner-order-version-history-restore-confirm"
              onClick={() => {
                if (restoreTarget) restoreMutation.mutate(restoreTarget.revisionNo)
              }}
            >
              복원
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          {restoreTarget
            ? `버전 ${restoreTarget.revisionNo} 시점으로 주문을 복원합니다. 현재 내용은 새 버전으로 대체됩니다.`
            : ''}
        </p>
      </Modal>
    </Card>
  )
}

export default PartnerOrderVersionHistoryPanel
