/**
 * 거래처 버전이력 패널 + 복원 — Phase 2.3 Task 6 FE.
 *
 * <p>{@link ../../api/partnerRevision} 의 {@code listRevisions} 로 버전이력(최신 우선)을
 * 백필하고, 각 시점에 대해 "이 시점으로 복원" 액션을 제공한다. 복원은 DS Modal
 * confirm 후 {@code restoreRevision} mutation 으로 실행되며, 성공 시 거래처 상세
 * (['partner', 'full', partnerCode]) + 거래처 목록 (['admin', 'partners']) +
 * 버전이력 (['partnerRevisions', partnerCode]) cache 를 무효화한다.
 *
 * <h2>거래종료 상태 가드</h2>
 * <p>거래처가 거래종료(TERMINATED) 상태면 BE 가 409 로 복원을 거절한다. 따라서 본 패널은
 * 해당 상태에서 복원 버튼을 비활성화하고 안내 문구를 노출한다 (복원 가능 = ACTIVE/SUSPENDED).
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>본 패널은 UUID 를 다루지 않는다 — path/표시 모두 partnerCode 만 사용하고, 표시 텍스트는
 * actorName / partnerCode 만 노출한다 ([[uuid-no-user-visibility]]).
 *
 * <p>estimate 동형 — {@link ./EstimateVersionHistoryPanel} 미러.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Modal, Spinner } from '@samhan/design-system'
import {
  listRevisions,
  restoreRevision,
  type PartnerRevision,
  type PartnerRevisionType,
} from '../../api/partnerRevision'
import { type PartnerStatus } from '../../api/adminApi'
import { usePermissions } from '../../hooks/usePermissions'

export interface PartnerVersionHistoryPanelProps {
  /** 거래처 코드 — react-query 키 + API path 전용 (UUID 아님, 화면 표시 식별자). */
  partnerCode: string
  /** 현재 거래처 상태 — 거래종료(TERMINATED)면 복원 버튼 비활성. */
  status: PartnerStatus
}

/** revision 유형별 한국어 라벨 + Badge 톤. */
const REVISION_TYPE_META: Record<
  PartnerRevisionType,
  { label: string; variant: 'neutral' | 'brand' | 'warning' }
> = {
  CREATE: { label: '생성', variant: 'neutral' },
  EDIT: { label: '수정', variant: 'brand' },
  RESTORE: { label: '복원', variant: 'warning' },
}

/** 복원 가능 상태 — ACTIVE/SUSPENDED 만 복원 허용 (BE 계약, TERMINATED 는 409). */
function isRestorableStatus(status: PartnerStatus): boolean {
  return status === 'ACTIVE' || status === 'SUSPENDED'
}

/** UUID 형태 문자열 판별 — actorName 에 계정 UUID 가 섞여 들어와도 화면 노출을 차단(방어). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuidLike(v: string | null | undefined): boolean {
  return !!v && UUID_RE.test(v.trim())
}

/**
 * actorName 을 화면 표시용으로 정제 — UUID 형태면 노출하지 않는다([[uuid-no-user-visibility]]).
 * BE 가 표시명을 채우지 못해 UUID 가 들어오는 경우의 방어선(주 수정은 BE actorName=null).
 */
function displayActor(actorName: string | null | undefined): string | null {
  if (!actorName || isUuidLike(actorName)) return null
  return actorName
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
 * 변경 요약 1줄 — "헤더 N · 자식 +a/-b/~c".
 * 전부 0 이면 "변경 없음" 으로 표시 (CREATE 등).
 */
function formatChangeSummary(rev: PartnerRevision): string {
  const { headerChanged, childAdded, childRemoved, childModified } = rev.changeSummary
  if (
    headerChanged === 0
    && childAdded === 0
    && childRemoved === 0
    && childModified === 0
  ) {
    return '변경 없음'
  }
  return `헤더 ${headerChanged} · 자식 +${childAdded}/-${childRemoved}/~${childModified}`
}

/**
 * 거래처 상세 화면용 버전이력 패널. 4탭 다이얼로그 하단에 배치한다.
 */
export function PartnerVersionHistoryPanel({
  partnerCode,
  status,
}: PartnerVersionHistoryPanelProps) {
  const queryClient = useQueryClient()
  const [historyOpen, setHistoryOpen] = useState(false)
  const { canAccess } = usePermissions()
  /** 복원 confirm modal 대상 revision (null = 미오픈). */
  const [restoreTarget, setRestoreTarget] = useState<PartnerRevision | null>(null)
  /** 복원 성공/실패 toast. */
  const [toast, setToast] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null)

  /** 거래종료 상태면 복원 버튼 비활성 (BE 가 409 거절). */
  const restorable = isRestorableStatus(status)
  const canRestore = canAccess('partners.4tab.edit', 'restore')

  const revisionsQuery = useQuery({
    queryKey: ['partnerRevisions', partnerCode],
    queryFn: () => listRevisions(partnerCode),
    enabled: !!partnerCode && historyOpen,
  })

  const restoreMutation = useMutation({
    mutationFn: (revisionNo: number) => restoreRevision(partnerCode, revisionNo),
    onSuccess: (_restored, revisionNo) => {
      setRestoreTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['partner', 'full', partnerCode] })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] })
      void queryClient.invalidateQueries({ queryKey: ['partnerRevisions', partnerCode] })
      setToast({
        kind: 'success',
        text: `rev ${revisionNo} 시점으로 거래처를 복원했습니다.`,
      })
    },
    onError: () => {
      setRestoreTarget(null)
      setToast({ kind: 'danger', text: '거래처 복원에 실패했습니다. 다시 시도해 주세요.' })
    },
  })

  const revisions: PartnerRevision[] = Array.isArray(revisionsQuery.data)
    ? revisionsQuery.data
    : []

  return (
    <Card
      padding={4}
      shadow="sm"
      style={{ marginTop: 24 }}
      data-testid="partner-version-history-panel"
    >
      <Button
        variant="secondary"
        type="button"
        data-testid="partner-version-history-open"
        onClick={() => setHistoryOpen(true)}
      >
        버전이력
      </Button>

      {/* 거래종료 상태 안내 — 거래종료된 거래처는 복원 불가 */}
      {!restorable ? (
        <p
          data-testid="partner-version-history-locked-note"
          style={{
            margin: '0 0 12px',
            fontSize: 13,
            color: 'var(--color-neutral-600)',
          }}
        >
          거래종료된 거래처는 복원할 수 없습니다.
        </p>
      ) : null}

      {/* 복원 결과 toast — 사용자 닫기 가능 */}
      {toast ? (
        <div
          role="status"
          data-testid="partner-version-history-toast"
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
          data-testid="partner-version-history-error"
          style={{ margin: 0, color: 'var(--color-danger-600)' }}
        >
          버전 이력을 불러오지 못했습니다.
        </p>
      ) : revisions.length === 0 ? (
        <p
          data-testid="partner-version-history-empty"
          style={{ margin: 0, color: 'var(--color-neutral-500)' }}
        >
          아직 버전 이력이 없습니다.
        </p>
      ) : (
        <ul
          data-testid="partner-version-history-list"
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {revisions.map((rev) => {
            const meta = REVISION_TYPE_META[rev.revisionType]
            // 가장 최근 revision(목록 첫 항목) 은 현재 상태이므로 복원 버튼을 노출하지 않는다.
            const isLatest = rev.revisionNo === revisions[0]?.revisionNo
            return (
              <li
                key={rev.revisionNo}
                data-testid={`partner-version-history-row-${rev.revisionNo}`}
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
                    <strong style={{ fontSize: 14 }}>{rev.partnerCode}</strong>
                    <Badge variant={meta.variant}>
                      {meta.label}
                      {rev.revisionType === 'RESTORE' && rev.sourceRevisionNo != null
                        ? ` (rev ${rev.sourceRevisionNo})`
                        : ''}
                    </Badge>
                    {displayActor(rev.actorName) ? (
                      <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
                        {displayActor(rev.actorName)}
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
                {!isLatest && canRestore ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid={`partner-version-history-restore-button-${rev.revisionNo}`}
                    // 거래종료(TERMINATED) 상태면 복원 버튼 비활성.
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

      </Modal>

      {/* 복원 confirm modal — DS Modal */}
      <Modal
        open={restoreTarget !== null}
        onClose={() => {
          if (!restoreMutation.isPending) setRestoreTarget(null)
        }}
        title="거래처 복원"
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
              data-testid="partner-version-history-restore-confirm"
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
            ? `rev ${restoreTarget.revisionNo} 시점으로 거래처를 복원합니다. 현재 내용은 새 버전으로 대체됩니다.`
            : ''}
        </p>
      </Modal>
    </Card>
  )
}

export default PartnerVersionHistoryPanel
