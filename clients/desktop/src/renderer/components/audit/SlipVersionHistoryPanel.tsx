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
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Modal, Spinner, safeActorName } from '@samhan/design-system'
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
  /** 협업 패널과 공유하는 선택 revision 번호. */
  activeRevisionNo?: number | null
  /**
   * 코멘트 anchor 와 연결할 필드 경로 목록 — anchor 원형(접두사 없음, 예: {@code "memo"})으로
   * 전달한다. 리비전 1건이 헤더 필드 여러 개를 동시에 바꿀 수 있어 배열로 받는다(PR #747 재수렴
   * MEDIUM fix — 단일 문자열이면 리비전 행 클릭 시 첫 필드에 anchor 된 코멘트만 하이라이트되고
   * 2번째 이후 필드의 코멘트는 역방향 하이라이트가 누락된다). 내부 비교는 {@link normalizeFieldPath}
   * 로 BE fieldPath 의 {@code "header."} 접두사를 제거해 맞춘다(PR #747 재수렴 HIGH fix).
   */
  activeFieldPaths?: string[] | null
  /** 버전 행/변경 항목 선택 시 협업 패널에 공유한다 — 행 선택 시 해당 리비전의 fieldPaths 전체. */
  onRevisionSelect?: (revisionNo: number, fieldPaths?: string[]) => void
}

/** {@link SlipVersionHistoryPanelProps.activeFieldPaths} 미전달 시 기본값 — 매 렌더 재생성 방지. */
const EMPTY_ACTIVE_FIELD_PATHS: string[] = []

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

/**
 * 코멘트 anchor ↔ 버전이력 fieldPath 비교용 정규화 (PR #747 재수렴 HIGH fix, 근본원인).
 *
 * <p>BE {@code SlipRevisionService.HEADER_FIELDS} 는 헤더 필드 fieldPath 를 전부
 * {@code "header."} 접두사로 내려준다(예: {@code "header.memo"}). 반면 FE 코멘트 anchor(
 * {@link SlipCollaborationPanel} 의 {@code OVERLAY_FIELD_OPTIONS}) 는 접두사 없이 저장/전송된다
 * (예: {@code "memo"}) — BE 요청 anchor 계약은 자유 문자열이라 접두사를 붙이지 않는 편이 기존
 * 저장 anchor 값(및 향후 다른 anchor 소비처)에 영향이 없다. 라인 fieldPath({@code "lines[0]..."})
 * 는 애초 접두사가 없어 이 strip 이 영향을 주지 않는다.
 *
 * <p>양방향 매칭이 성립하려면 두 표현을 같은 canonical 형태로 합쳐야 한다 — 본 함수가
 * {@code "header."} 접두사를 제거해 fieldPath 쪽을 anchor 쪽 형태로 맞춘다. 이 함수는
 * fieldPath 목록 생성(this file) 과 activeFieldPaths 정규화(comment anchor 유래 값 포함, 배열 전
 * 원소에 element-wise 적용) 양쪽에 동일하게 쓰이므로, 한 번의 수정으로 코멘트→버전이력·
 * 버전이력→코멘트 양방향이 (다중필드 포함) 모두 정합된다.
 */
function normalizeFieldPath(path: string | null | undefined): string {
  return (path ?? '').replace(/^\/+/, '').replace(/\//g, '.').replace(/^header\./, '')
}

function renderFieldChange(
  change: SlipRevisionFieldChange,
  options: {
    active: boolean
    onSelect?: () => void
  },
) {
  const actorColor = presenceColorToHex(change.actorColor)
  const actorName = safeActorName(change.actorName)
  return (
    <div
      key={change.fieldPath}
      data-testid={`slip-version-history-change-${fieldPathTestId(change.fieldPath)}`}
      data-active={options.active ? 'true' : undefined}
      role={options.onSelect ? 'button' : undefined}
      tabIndex={options.onSelect ? 0 : undefined}
      onClick={(event) => {
        if (!options.onSelect) return
        event.stopPropagation()
        options.onSelect()
      }}
      onKeyDown={(event) => {
        if (!options.onSelect) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        options.onSelect()
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        columnGap: 8,
        rowGap: 2,
        alignItems: 'start',
        fontSize: 12,
        color: 'var(--color-neutral-700)',
        padding: options.active ? '4px 6px' : 0,
        borderRadius: 4,
        background: options.active ? 'var(--color-warning-50, #FEF6E7)' : 'transparent',
        cursor: options.onSelect ? 'pointer' : undefined,
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
        {actorName ? (
          <strong style={{ color: actorColor, marginRight: 6 }}>{actorName}</strong>
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
export function SlipVersionHistoryPanel({
  slipId,
  activeRevisionNo = null,
  activeFieldPaths = EMPTY_ACTIVE_FIELD_PATHS,
  onRevisionSelect,
}: SlipVersionHistoryPanelProps) {
  const queryClient = useQueryClient()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [expandedRevisionNos, setExpandedRevisionNos] = useState<Set<number>>(() => new Set())
  /** 복원 confirm modal 대상 revision (null = 미오픈). */
  const [restoreTarget, setRestoreTarget] = useState<SlipRevision | null>(null)
  /** 복원 성공/실패 toast. */
  const [toast, setToast] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null)

  const revisionsQuery = useQuery({
    queryKey: ['slipRevisions', slipId],
    queryFn: () => listRevisions(slipId),
    enabled: !!slipId && historyOpen,
  })

  const restoreMutation = useMutation({
    mutationFn: (revisionNo: number) => restoreRevision(slipId, revisionNo),
    onSuccess: (_restored, revisionNo) => {
      setRestoreTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['slip', slipId] })
      void queryClient.invalidateQueries({ queryKey: ['slipRevisions', slipId] })
      void queryClient.invalidateQueries({ queryKey: ['slipAuditLogs', slipId] })
      setToast({
        kind: 'success',
        text: `버전 ${revisionNo} 시점으로 전표를 복원했습니다.`,
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

  /**
   * 코멘트 anchor 유래 활성 필드 목록을 canonical 형태(Set)로 정규화한다 — 리비전 행 전체 배열과의
   * 교집합 판정(다중필드) 및 개별 필드변경과의 포함 판정에 재사용한다(PR #747 재수렴 MEDIUM fix).
   */
  const normalizedActiveFieldPaths = useMemo(
    () => new Set(
      (activeFieldPaths ?? EMPTY_ACTIVE_FIELD_PATHS)
        .map((path) => normalizeFieldPath(path))
        .filter((path) => path.length > 0),
    ),
    [activeFieldPaths],
  )

  const hasActiveHistoryTarget = activeRevisionNo !== null || normalizedActiveFieldPaths.size > 0

  useEffect(() => {
    if (hasActiveHistoryTarget) setHistoryOpen(true)
  }, [activeRevisionNo, hasActiveHistoryTarget, normalizedActiveFieldPaths])

  useEffect(() => {
    if (!hasActiveHistoryTarget || revisions.length === 0) return
    const matchingRevisionNos = revisions
      .filter((revision) => {
        if (activeRevisionNo === revision.revisionNo) return true
        return revision.fieldChanges?.some((change) => (
          normalizedActiveFieldPaths.has(normalizeFieldPath(change.fieldPath))
        )) ?? false
      })
      .map((revision) => revision.revisionNo)
    if (matchingRevisionNos.length === 0) return
    setExpandedRevisionNos((previous) => {
      const next = new Set(previous)
      matchingRevisionNos.forEach((revisionNo) => next.add(revisionNo))
      return next.size === previous.size ? previous : next
    })
  }, [activeRevisionNo, hasActiveHistoryTarget, normalizedActiveFieldPaths, revisions])

  return (
    <Card
      padding={4}
      shadow="sm"
      style={{ marginTop: 24 }}
      data-testid="slip-version-history-panel"
    >
      <Button
        variant="secondary"
        type="button"
        data-testid="slip-version-history-open"
        onClick={() => setHistoryOpen(true)}
      >
        버전이력
      </Button>

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
            const fieldPaths = fieldChanges.map((change) => normalizeFieldPath(change.fieldPath))
            // 다중필드 리비전: fieldPaths 중 하나라도 활성 목록에 있으면 행 전체를 하이라이트한다
            // (PR #747 재수렴 MEDIUM fix — 이전엔 단일 activeFieldPath 비교라 첫 필드만 매칭됐다).
            const isHighlighted = activeRevisionNo === rev.revisionNo
              || fieldPaths.some((path) => normalizedActiveFieldPaths.has(path))
            // 활성 필드가 매칭된 첫 렌더부터 변경 항목을 펼친다. effect가 expandedRevisionNos를
            // 채우기 전에도 하이라이트와 details.open이 서로 다른 렌더를 보이지 않게 한다.
            const isExpanded = expandedRevisionNos.has(rev.revisionNo) || isHighlighted
            return (
              <li
                key={rev.revisionNo}
                data-testid={`slip-version-history-row-${rev.revisionNo}`}
                data-active={isHighlighted ? 'true' : undefined}
                aria-current={isHighlighted ? 'true' : undefined}
                tabIndex={onRevisionSelect ? 0 : undefined}
                onClick={() => onRevisionSelect?.(rev.revisionNo, fieldPaths)}
                onKeyDown={(event) => {
                  if (!onRevisionSelect) return
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  onRevisionSelect(rev.revisionNo, fieldPaths)
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
                    <strong style={{ fontSize: 14 }}>{rev.slipNo}</strong>
                    <Badge variant={meta.variant}>
                      {meta.label}
                      {rev.revisionType === 'RESTORE' && rev.sourceRevisionNo != null
                        ? ` (버전 ${rev.sourceRevisionNo})`
                        : ''}
                    </Badge>
                    {safeActorName(rev.actorName) ? (
                      <span style={{ fontSize: 12, fontWeight: 600, color: rev.actorColor ? presenceColorToHex(rev.actorColor) : 'var(--color-neutral-600)' }}>
                        {safeActorName(rev.actorName)}
                      </span>
                    ) : null}
                    <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                      {formatLocalDateTime(rev.createdAt)}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
                    {formatChangeSummary(rev)}
                  </span>
                  {fieldChanges.length > 0 ? (
                    <details
                      data-testid={`slip-version-history-changes-${rev.revisionNo}`}
                      open={isExpanded}
                      onToggle={(event) => {
                        const open = event.currentTarget.open
                        setExpandedRevisionNos((previous) => {
                          const next = new Set(previous)
                          if (open) next.add(rev.revisionNo)
                          else next.delete(rev.revisionNo)
                          return next
                        })
                      }}
                      style={{
                        marginTop: 4,
                      }}
                    >
                      <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--color-neutral-600)' }}>
                        변경 항목 {fieldChanges.length}개
                      </summary>
                      <div style={{ display: 'grid', gap: 4, marginTop: 4, paddingLeft: 2 }}>
                        {fieldChanges.map((change) => {
                          const normalized = normalizeFieldPath(change.fieldPath)
                          return renderFieldChange(change, {
                            active: activeRevisionNo === rev.revisionNo
                              || normalizedActiveFieldPaths.has(normalized),
                            onSelect: onRevisionSelect
                              ? () => onRevisionSelect(rev.revisionNo, [normalized])
                              : undefined,
                          })
                        })}
                      </div>
                    </details>
                  ) : null}
                </div>
                {!isLatest ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid={`slip-version-history-restore-button-${rev.revisionNo}`}
                    disabled={restoreMutation.isPending}
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
            ? `버전 ${restoreTarget.revisionNo} 시점으로 전표를 복원합니다. 현재 내용은 새 버전으로 대체됩니다.`
            : ''}
        </p>
      </Modal>
    </Card>
  )
}

export default SlipVersionHistoryPanel
