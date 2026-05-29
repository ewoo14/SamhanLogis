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

export interface EstimateVersionHistoryPanelProps {
  /** 견적서 UUID — react-query 키 + API path 전용 (화면 노출 X). */
  estimateId: string
  /** 현재 견적 상태 — 편집 불가 상태(ACCEPTED/CONVERTED/REJECTED)면 복원 버튼 비활성. */
  status: EstimateStatus
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
    onSuccess: (_restored, revisionNo) => {
      setRestoreTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['estimate', estimateId] })
      void queryClient.invalidateQueries({ queryKey: ['estimateRevisions', estimateId] })
      setToast({
        kind: 'success',
        text: `rev ${revisionNo} 시점으로 견적서를 복원했습니다.`,
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
                ? 'var(--color-success-300, #6EE7B7)'
                : 'var(--color-danger-300, #FCA5A5)',
            background:
              toast.kind === 'success'
                ? 'var(--color-success-50, #ECFDF5)'
                : 'var(--color-danger-50, #FEF2F2)',
            color:
              toast.kind === 'success'
                ? 'var(--color-success-800, #065F46)'
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
            return (
              <li
                key={rev.revisionNo}
                data-testid={`estimate-version-history-row-${rev.revisionNo}`}
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
                    <strong style={{ fontSize: 14 }}>{rev.estimateNo}</strong>
                    <Badge variant={meta.variant}>
                      {meta.label}
                      {rev.revisionType === 'RESTORE' && rev.sourceRevisionNo != null
                        ? ` (rev ${rev.sourceRevisionNo})`
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
            ? `rev ${restoreTarget.revisionNo} 시점으로 견적서를 복원합니다. 현재 내용은 새 버전으로 대체됩니다.`
            : ''}
        </p>
      </Modal>
    </Card>
  )
}

export default EstimateVersionHistoryPanel
