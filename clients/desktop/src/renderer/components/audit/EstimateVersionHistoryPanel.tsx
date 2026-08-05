/**
 * 견적서 버전이력 패널 + 복원 — Phase 2.2 Task 6 FE.
 *
 * <p>{@link ../../api/estimateRevision} 의 {@code listRevisions} 로 버전이력(최신 우선)을
 * 백필하고, 각 시점에 대해 "이 시점으로 복원" 액션을 제공한다. 복원은 DS Modal
 * confirm 후 {@code restoreRevision} mutation 으로 실행되며, 성공 시 견적 본체
 * (['estimate', estimateId]) + 버전이력 (['estimateRevisions', estimateId]) cache 를 무효화한다.
 *
 * <h2>편집 불가 상태 가드</h2>
 * <p>견적이 수주(QUOTE_ACCEPTED)/변환(QUOTE_CONVERTED)/거절(QUOTE_REJECTED) 상태면 BE 가
 * 409 로 복원을 거절한다. 따라서 본 패널은 해당 상태에서 복원 버튼을 비활성화하고
 * 안내 문구를 노출한다 (편집 가능 = QUOTE_DRAFT/QUOTE_SENT 만).
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>estimateId 는 prop/path 전용 — 화면 노출 X. 표시 텍스트는 actorName / estimateNo 만 사용한다
 * ([[uuid-no-user-visibility]]).
 *
 * <p>slip 동형 — {@link ./SlipVersionHistoryPanel} 미러.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Modal, Spinner } from '@samhan/design-system'
import {
  listRevisions,
  restoreRevision,
  type EstimateRevision,
  type EstimateRevisionType,
} from '../../api/estimateRevision'
import { type EstimateStatus } from '../../api/estimateApi'
import { markEstimateRestoreFence } from '../../utils/estimateRestoreFence'

export interface EstimateVersionHistoryPanelProps {
  /** 견적서 UUID — react-query 키 + API path 전용 (화면 노출 X). */
  estimateId: string
  /** 현재 견적 상태 — 편집 불가 상태(ACCEPTED/CONVERTED/REJECTED)면 복원 버튼 비활성. */
  status: EstimateStatus
  /** 협업 패널과 공유하는 선택 revision 번호. */
  activeRevisionNo?: number | null
  /**
   * 코멘트 anchor 와 공유하는 필드 경로.
   *
   * <p>현 API({@link EstimateRevision})는 revision 별 field-level 변경 목록을 제공하지
   * 않아 Slip 수준(field 단위 정확 매칭)의 하이라이트는 불가하다. 코멘트가 가리키는
   * 필드는 항상 "현재" 문서 상태에 대한 것이므로, 그 필드를 담고 있는 최신(현재)
   * revision 행만 근사적으로 하이라이트한다(row-level highlight) — 개발책임자 확인 시
   * revision DTO 에 fieldChanges 가 추가되면 Slip 과 동일한 field 단위 매칭으로 교체한다.
   */
  activeFieldPath?: string | null
  /** 버전 행 선택 시 협업 패널에 공유한다. */
  onRevisionSelect?: (revisionNo: number, fieldPaths?: string[], meta?: { isLatest?: boolean }) => void
}

/** revision 유형별 한국어 라벨 + Badge 톤. */
const REVISION_TYPE_META: Record<
  EstimateRevisionType,
  { label: string; variant: 'neutral' | 'brand' | 'warning' }
> = {
  CREATE: { label: '생성', variant: 'neutral' },
  EDIT: { label: '수정', variant: 'brand' },
  RESTORE: { label: '복원', variant: 'warning' },
}

/** 편집(=복원) 가능 상태 — DRAFT/SENT 만 복원 허용 (BE 계약). */
function isRestorableStatus(status: EstimateStatus): boolean {
  return status === 'QUOTE_DRAFT' || status === 'QUOTE_SENT'
}

/**
 * "2026-05-29T14:32:18" → "2026-05-29 14:32" — 로컬 표시 포맷.
 * (BE LocalDateTime 문자열을 추가 파싱 없이 안전 절단.)
 */
function formatLocalDateTime(iso: string): string {
  if (!iso) return '-'
  return iso.slice(0, 16).replace('T', ' ')
}

/**
 * 변경 요약 1줄 — "헤더 N · 라인 +a/-b/~c".
 * 전부 0 이면 "변경 없음" 으로 표시 (CREATE 등).
 */
function formatChangeSummary(rev: EstimateRevision): string {
  const { headerChanged, lineAdded, lineRemoved, lineModified } = rev.changeSummary
  if (
    headerChanged === 0
    && lineAdded === 0
    && lineRemoved === 0
    && lineModified === 0
  ) {
    return '변경 없음'
  }
  return `헤더 ${headerChanged} · 라인 +${lineAdded}/-${lineRemoved}/~${lineModified}`
}

/**
 * 견적서 상세 화면용 버전이력 패널. 합계 박스 하단에 배치한다.
 */
export function EstimateVersionHistoryPanel({
  estimateId,
  status,
  activeRevisionNo = null,
  activeFieldPath = null,
  onRevisionSelect,
}: EstimateVersionHistoryPanelProps) {
  const queryClient = useQueryClient()
  /** 복원 confirm modal 대상 revision (null = 미오픈). */
  const [restoreTarget, setRestoreTarget] = useState<EstimateRevision | null>(null)
  /** 복원 성공/실패 toast. */
  const [toast, setToast] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null)

  /** 편집 불가 상태면 복원 버튼 비활성 (BE 가 409 거절). */
  const restorable = isRestorableStatus(status)

  const revisionsQuery = useQuery({
    queryKey: ['estimateRevisions', estimateId],
    queryFn: () => listRevisions(estimateId),
    enabled: !!estimateId,
  })

  const restoreMutation = useMutation({
    mutationFn: (revisionNo: number) => restoreRevision(estimateId, revisionNo),
    onSuccess: (restored, revisionNo) => {
      markEstimateRestoreFence(estimateId, restored.version)
      setRestoreTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['estimate', estimateId] })
      void queryClient.invalidateQueries({ queryKey: ['estimateRevisions', estimateId] })
      setToast({
        kind: 'success',
        text: `버전 ${revisionNo} 시점으로 견적서를 복원했습니다.`,
      })
    },
    onError: () => {
      setRestoreTarget(null)
      setToast({ kind: 'danger', text: '견적서 복원에 실패했습니다. 다시 시도해 주세요.' })
    },
  })

  const revisions: EstimateRevision[] = Array.isArray(revisionsQuery.data)
    ? revisionsQuery.data
    : []

  return (
    <Card
      padding={4}
      shadow="sm"
      style={{ marginTop: 24 }}
      data-testid="estimate-version-history-panel"
    >
      <h4 style={{ marginTop: 0 }}>버전 이력</h4>

      {/* 편집 불가 상태 안내 — 수주/변환/거절 완료 견적은 복원 불가 */}
      {!restorable ? (
        <p
          data-testid="estimate-version-history-locked-note"
          style={{
            margin: '0 0 12px',
            fontSize: 13,
            color: 'var(--color-neutral-600)',
          }}
        >
          수주/변환 완료된 견적은 복원할 수 없습니다.
        </p>
      ) : null}

      {/* 복원 결과 toast — 사용자 닫기 가능 */}
      {toast ? (
        <div
          role="status"
          data-testid="estimate-version-history-toast"
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
                ? 'var(--color-success-200, #a7f3d0)'
                : 'var(--color-danger-300, #FCA5A5)',
            background:
              toast.kind === 'success'
                ? 'var(--color-success-50, #ECFDF5)'
                : 'var(--color-danger-50, #FEF2F2)',
            color:
              toast.kind === 'success'
                ? 'var(--color-success-700, #047857)'
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
            }}
          >
            ×
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
          data-testid="estimate-version-history-error"
          style={{ margin: 0, color: 'var(--color-danger-600)' }}
        >
          버전 이력을 불러오지 못했습니다.
        </p>
      ) : revisions.length === 0 ? (
        <p
          data-testid="estimate-version-history-empty"
          style={{ margin: 0, color: 'var(--color-neutral-500)' }}
        >
          아직 버전 이력이 없습니다.
        </p>
      ) : (
        <ul
          data-testid="estimate-version-history-list"
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {revisions.map((rev) => {
            const meta = REVISION_TYPE_META[rev.revisionType]
            // 가장 최근 revision(목록 첫 항목) 은 현재 상태이므로 복원 버튼을 노출하지 않는다.
            const isLatest = rev.revisionNo === revisions[0]?.revisionNo
            // field-level 변경 목록이 없어 activeFieldPath 는 "현재" 값을 담은 최신 행에만
            // row-level 로 근사 매칭한다(위 activeFieldPath prop 문서 참고).
            const isHighlighted = activeRevisionNo === rev.revisionNo
              || (!!activeFieldPath && isLatest)
            return (
              <li
                key={rev.revisionNo}
                data-testid={`estimate-version-history-row-${rev.revisionNo}`}
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
                    <strong style={{ fontSize: 14 }}>{rev.estimateNo}</strong>
                    <Badge variant={meta.variant}>
                      {meta.label}
                      {rev.revisionType === 'RESTORE' && rev.sourceRevisionNo != null
                        ? ` (버전 ${rev.sourceRevisionNo})`
                        : ''}
                    </Badge>
                    <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
                      {rev.actorName}
                    </span>
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
                    data-testid={`estimate-version-history-restore-button-${rev.revisionNo}`}
                    // 편집 불가 상태(ACCEPTED/CONVERTED/REJECTED)면 복원 버튼 비활성.
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

      {/* 복원 confirm modal — DS Modal */}
      <Modal
        open={restoreTarget !== null}
        onClose={() => {
          if (!restoreMutation.isPending) setRestoreTarget(null)
        }}
        title="견적서 복원"
        size="sm"
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
              data-testid="estimate-version-history-restore-confirm"
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
            ? `버전 ${restoreTarget.revisionNo} 시점으로 견적서를 복원합니다. 현재 내용은 새 버전으로 대체됩니다.`
            : ''}
        </p>
      </Modal>
    </Card>
  )
}

export default EstimateVersionHistoryPanel
