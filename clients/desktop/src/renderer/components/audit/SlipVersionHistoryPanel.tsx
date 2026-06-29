/**
 * 전표 버전이력 패널 + 복원 — Phase 2.1 Task 6 FE.
 *
 * <p>{@link ../../api/slipRevision} 의 {@code listRevisions} 로 버전이력(최신 우선)을
 * 백필하고, 각 시점에 대해 "이 시점으로 복원" 액션을 제공한다. 복원은 DS Modal
 * confirm 후 {@code restoreRevision} mutation 으로 실행되며, 성공 시 전표 본체
 * (['slip', slipId]) + 버전이력 (['slipRevisions', slipId]) cache 를 무효화한다.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>slipId 는 prop/path 전용 — 화면 노출 X. 표시 텍스트는 actorName / slipNo 만 사용한다
 * ([[uuid-no-user-visibility]]).
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Modal, Spinner } from '@samhan/design-system'
import {
  listRevisions,
  restoreRevision,
  type SlipRevision,
  type SlipRevisionFieldChange,
  type SlipRevisionType,
} from '../../api/slipRevision'
import { presenceColorToHex } from '../../utils/presenceColor'

export interface SlipVersionHistoryPanelProps {
  /** 전표 UUID — react-query 키 + API path 전용 (화면 노출 X). */
  slipId: string
}

/** revision 유형별 한국어 라벨 + Badge 톤. */
const REVISION_TYPE_META: Record<
  SlipRevisionType,
  { label: string; variant: 'neutral' | 'brand' | 'warning' }
> = {
  CREATE: { label: '생성', variant: 'neutral' },
  EDIT: { label: '수정', variant: 'brand' },
  RESTORE: { label: '복원', variant: 'warning' },
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
function formatChangeSummary(rev: SlipRevision): string {
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

function formatDiffValue(value: string | null | undefined): string {
  if (value == null || value === '') return '비움'
  return value
}

function fieldPathTestId(fieldPath: string): string {
  return fieldPath.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function renderFieldChange(change: SlipRevisionFieldChange) {
  const actorColor = presenceColorToHex(change.actorColor)
  return (
    <div
      key={change.fieldPath}
      data-testid={`slip-version-history-change-${fieldPathTestId(change.fieldPath)}`}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        columnGap: 8,
        rowGap: 2,
        alignItems: 'start',
        fontSize: 12,
        color: 'var(--color-neutral-700)',
      }}
    >
      <span
        data-testid="slip-version-history-change-color"
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          marginTop: 5,
          background: actorColor,
          boxShadow: `0 0 0 2px ${actorColor}22`,
        }}
      />
      <span style={{ minWidth: 0 }}>
        {change.actorName ? (
          <strong style={{ color: actorColor, marginRight: 6 }}>{change.actorName}</strong>
        ) : null}
        <strong>{change.label}</strong>
        <span
          style={{
            marginLeft: 8,
            color: 'var(--color-neutral-500)',
            textDecoration: 'line-through',
            overflowWrap: 'anywhere',
          }}
        >
          {formatDiffValue(change.beforeValue)}
        </span>
        <span aria-hidden="true" style={{ margin: '0 6px', color: 'var(--color-neutral-400)' }}>
          →
        </span>
        <span style={{ color: actorColor, fontWeight: 700, overflowWrap: 'anywhere' }}>
          {formatDiffValue(change.afterValue)}
        </span>
      </span>
    </div>
  )
}

/**
 * 전표 상세 화면용 버전이력 패널. AuditOverlay 인접에 배치한다.
 */
export function SlipVersionHistoryPanel({ slipId }: SlipVersionHistoryPanelProps) {
  const queryClient = useQueryClient()
  /** 복원 confirm modal 대상 revision (null = 미오픈). */
  const [restoreTarget, setRestoreTarget] = useState<SlipRevision | null>(null)
  /** 복원 성공/실패 toast. */
  const [toast, setToast] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null)

  const revisionsQuery = useQuery({
    queryKey: ['slipRevisions', slipId],
    queryFn: () => listRevisions(slipId),
    enabled: !!slipId,
  })

  const restoreMutation = useMutation({
    mutationFn: (revisionNo: number) => restoreRevision(slipId, revisionNo),
    onSuccess: (_restored, revisionNo) => {
      setRestoreTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['slip', slipId] })
      void queryClient.invalidateQueries({ queryKey: ['slipRevisions', slipId] })
      setToast({
        kind: 'success',
        text: `rev ${revisionNo} 시점으로 전표를 복원했습니다.`,
      })
    },
    onError: () => {
      setRestoreTarget(null)
      setToast({ kind: 'danger', text: '전표 복원에 실패했습니다. 다시 시도해 주세요.' })
    },
  })

  const revisions: SlipRevision[] = Array.isArray(revisionsQuery.data)
    ? revisionsQuery.data
    : []

  return (
    <Card
      padding={4}
      shadow="sm"
      style={{ marginTop: 24 }}
      data-testid="slip-version-history-panel"
    >
      <h4 style={{ marginTop: 0 }}>버전 이력</h4>

      {/* 복원 결과 toast — 사용자 닫기 가능 */}
      {toast ? (
        <div
          role="status"
          data-testid="slip-version-history-toast"
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
          data-testid="slip-version-history-error"
          style={{ margin: 0, color: 'var(--color-danger-600)' }}
        >
          버전 이력을 불러오지 못했습니다.
        </p>
      ) : revisions.length === 0 ? (
        <p
          data-testid="slip-version-history-empty"
          style={{ margin: 0, color: 'var(--color-neutral-500)' }}
        >
          아직 버전 이력이 없습니다.
        </p>
      ) : (
        <ul
          data-testid="slip-version-history-list"
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {revisions.map((rev) => {
            const meta = REVISION_TYPE_META[rev.revisionType]
            // 가장 최근 revision(목록 첫 항목) 은 현재 상태이므로 복원 버튼을 노출하지 않는다.
            const isLatest = rev.revisionNo === revisions[0]?.revisionNo
            const fieldChanges = Array.isArray(rev.fieldChanges) ? rev.fieldChanges : []
            return (
              <li
                key={rev.revisionNo}
                data-testid={`slip-version-history-row-${rev.revisionNo}`}
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
                    <strong style={{ fontSize: 14 }}>{rev.slipNo}</strong>
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
                  {fieldChanges.length > 0 ? (
                    <div
                      data-testid={`slip-version-history-changes-${rev.revisionNo}`}
                      style={{
                        display: 'grid',
                        gap: 4,
                        marginTop: 4,
                        paddingLeft: 2,
                      }}
                    >
                      {fieldChanges.map(renderFieldChange)}
                    </div>
                  ) : null}
                </div>
                {!isLatest ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid={`slip-version-history-restore-button-${rev.revisionNo}`}
                    disabled={restoreMutation.isPending}
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
        title="전표 복원"
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
              data-testid="slip-version-history-restore-confirm"
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
            ? `rev ${restoreTarget.revisionNo} 시점으로 전표를 복원합니다. 현재 내용은 새 버전으로 대체됩니다.`
            : ''}
        </p>
      </Modal>
    </Card>
  )
}

export default SlipVersionHistoryPanel
