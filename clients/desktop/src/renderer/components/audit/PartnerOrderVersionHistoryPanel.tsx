/**
 * 거래처 주문 버전이력 패널 + 복원 — Phase 2.4 Task 9 FE.
 *
 * <p>{@link ../../api/partnerOrderRevision} 의 {@code listPartnerOrderRevisions} 로
 * 버전이력(최신 우선)을 표시하고, 각 시점에 대해 "이 시점으로 복원" 액션을 제공한다.
 * 복원은 DS Modal confirm 후 {@code restorePartnerOrderRevision} mutation 으로 실행되며,
 * 성공 시 주문 상세 (['partner-orders', orderId]) + 버전이력
 * (['partner-order-revisions', orderId]) cache 를 무효화한다 (F5 stale 회귀 차단).
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
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Modal, Spinner } from '@samhan/design-system'
import {
  listPartnerOrderRevisions,
  restorePartnerOrderRevision,
  type PartnerOrderRevision,
  type PartnerOrderRevisionType,
} from '../../api/partnerOrderRevision'
import { type PartnerOrderStatus } from '../../api/sales'

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
}

/** revision 유형별 한국어 라벨 + Badge 변형. */
const REVISION_TYPE_META: Record<
  PartnerOrderRevisionType,
  { label: string; variant: 'neutral' | 'brand' | 'warning' | 'success' | 'danger' | 'nts' }
> = {
  CREATE: { label: '생성', variant: 'neutral' },
  EDIT: { label: '수정', variant: 'brand' },
  STATUS: { label: '상태변경', variant: 'success' },
  RESTORE: { label: '복원', variant: 'warning' },
}

/**
 * 복원 허용 상태 판정 — 제외목록 방식.
 * CONFIRMING(발행 중 transient) / CANCELED(취소) 는 복원 불가.
 * DRAFT / CONFIRMED 및 추후 추가될 상태는 허용.
 */
function isRestorableStatus(status: PartnerOrderStatus): boolean {
  return status !== 'CONFIRMING' && status !== 'CANCELED'
}

/** UUID 형태 문자열 판별 — actorName 에 계정 UUID 가 섞여 들어와도 화면 노출을 차단(방어). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuidLike(v: string | null | undefined): boolean {
  return !!v && UUID_RE.test(v.trim())
}

/**
 * actorName 을 화면 표시용으로 정제 — UUID 형태면 노출하지 않는다 ([[uuid-no-user-visibility]]).
 * BE 가 표시명을 채우지 못해 UUID 가 들어오는 경우의 방어선 (주 수정은 BE actorName=null 처리).
 */
function displayActor(actorName: string | null | undefined): string | null {
  if (!actorName || isUuidLike(actorName)) return null
  return actorName
}

/**
 * "2026-05-29T14:32:18" → "2026-05-29 14:32" — 로컬 표시 포맷.
 * BE LocalDateTime 문자열을 추가 파싱 없이 안전 절단.
 */
function formatLocalDateTime(iso: string): string {
  if (!iso) return '-'
  return iso.slice(0, 16).replace('T', ' ')
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
}: PartnerOrderVersionHistoryPanelProps) {
  const queryClient = useQueryClient()

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
    enabled: !!orderId,
  })

  const restoreMutation = useMutation({
    mutationFn: (revisionNo: number) => restorePartnerOrderRevision(orderId, revisionNo),
    onSuccess: (result, revisionNo) => {
      setRestoreTarget(null)
      // F5 stale 회귀 차단 — 상세 + 목록 + 버전이력 전부 무효화 (Phase 2.3 F5 회귀 교훈).
      void queryClient.invalidateQueries({ queryKey: ['partner-order', orderId] })
      void queryClient.invalidateQueries({ queryKey: ['partner-orders', orderId] })
      void queryClient.invalidateQueries({ queryKey: ['partner-order-revisions', orderId] })

      if (result.slipResyncRequired) {
        // CONFIRMED 복원 — slip 재발행 필요 경고 우선 노출.
        setToast({
          kind: 'warning',
          text: `rev ${revisionNo} 시점으로 주문을 복원했습니다. 이 주문은 완료(출고전표 발행됨) 상태입니다. 연결된 출고전표 재발행이 필요할 수 있습니다.`,
        })
      } else {
        setToast({
          kind: 'success',
          text: `rev ${revisionNo} 시점으로 주문을 복원했습니다.`,
        })
      }
    },
    onError: () => {
      setRestoreTarget(null)
      setToast({ kind: 'danger', text: '주문 복원에 실패했습니다. 다시 시도해 주세요.' })
    },
  })

  const revisions: PartnerOrderRevision[] = Array.isArray(revisionsQuery.data)
    ? revisionsQuery.data
    : []

  return (
    <Card
      padding={4}
      shadow="sm"
      style={{ marginTop: 24 }}
      data-testid="partner-order-version-history-panel"
    >
      <h4 style={{ marginTop: 0 }}>버전 이력</h4>

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

      {/* 복원 결과 토스트 — 사용자 닫기 가능 */}
      {toast ? (
        <div
          role="status"
          data-testid="partner-order-version-history-toast"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 12px',
            marginBottom: 12,
            borderRadius: 6,
            border: '1px solid',
            borderColor:
              toast.kind === 'success'
                ? 'var(--color-success-300, #6EE7B7)'
                : toast.kind === 'warning'
                  ? 'var(--color-warning-300, #FCD34D)'
                  : 'var(--color-danger-300, #FCA5A5)',
            background:
              toast.kind === 'success'
                ? 'var(--color-success-50, #ECFDF5)'
                : toast.kind === 'warning'
                  ? 'var(--color-warning-50, #FFFBEB)'
                  : 'var(--color-danger-50, #FEF2F2)',
            color:
              toast.kind === 'success'
                ? 'var(--color-success-800, #065F46)'
                : toast.kind === 'warning'
                  ? 'var(--color-warning-800, #92400E)'
                  : 'var(--color-danger-800, #991B1B)',
            fontSize: 13,
          }}
        >
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="알림 닫기"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              color: 'inherit',
              marginLeft: 8,
              flexShrink: 0,
            }}
          >
            x
          </button>
        </div>
      ) : null}

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
            return (
              <li
                key={rev.revisionNo}
                data-testid={`partner-order-version-history-row-${rev.revisionNo}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--color-neutral-200)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {/* 주문번호는 표시 식별자 (UUID 아님). */}
                    <strong style={{ fontSize: 14 }}>{rev.orderNo}</strong>
                    <Badge variant={meta.variant}>
                      {meta.label}
                      {rev.revisionType === 'RESTORE' && rev.sourceRevisionNo != null
                        ? ` (rev ${rev.sourceRevisionNo})`
                        : ''}
                    </Badge>
                    {actor ? (
                      <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
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
                    onClick={() => setRestoreTarget(rev)}
                  >
                    이 시점으로 복원
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

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
            ? `rev ${restoreTarget.revisionNo} 시점으로 주문을 복원합니다. 현재 내용은 새 버전으로 대체됩니다.`
            : ''}
        </p>
      </Modal>
    </Card>
  )
}

export default PartnerOrderVersionHistoryPanel
