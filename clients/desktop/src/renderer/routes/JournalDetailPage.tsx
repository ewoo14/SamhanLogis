/**
 * 분개 상세 화면 (`/accounting/journals/:id`).
 *
 * - 헤더: 분개번호 + 일자 + 상태 + 적요 + 작성자
 * - 라인 표 (read-only)
 * - 합계: 차변 / 대변
 * - 액션:
 *   * DRAFT  → "확정" (POSTED 로 전환), "편집" (FormPage edit), "취소"
 *   * POSTED → "역분개" (사유 입력 후 REVERSED 전환)
 *   * REVERSED → 액션 없음 (읽기 전용)
 *
 * 권한:
 * - 진입: ACCOUNTANT / MASTER (RouteGuard)
 * - "확정" / "역분개": accounting.journals UPDATE 권한
 * - "편집": accounting.journals CREATE 권한 (DRAFT 만, 신규작성 폼 재사용)
 *
 * UUID 비공개 가드: 사용자 노출 식별자는 journalNo 와 accountCode 만. line.id /
 * journal.id 는 화면 표시 X.
 */
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  DataTable,
  JournalStatusBadge,
  Spinner,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  getJournal,
  postJournal,
  reverseJournal,
  type JournalLine,
} from '../api/accounting'
import { JournalCollaborationPanel } from '../components/collab/JournalCollaborationPanel'
import { MobileCollapsible } from '../components/common/MobileCollapsible'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { useIsMobile } from '../hooks/useIsMobile'

const fmtKrw = (raw: string): string => {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return raw
  if (n === 0) return '—'
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const JOURNAL_STATUS_LABEL: Record<string, string> = {
  DRAFT: '작성중',
  POSTED: '확정',
  REVERSED: '역분개',
}

function journalStatusBadgeStyle(status: string) {
  switch (status) {
    case 'POSTED':
      return { background: '#D1FAE5', color: '#065F46' }
    case 'REVERSED':
      return { background: '#FEE2E2', color: '#991B1B' }
    case 'DRAFT':
    default:
      return { background: '#F3F4F6', color: '#4B5563' }
  }
}

export function JournalDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams<{ id: string }>()
  const journalId = params['id']!
  const { canAccess } = usePermissions()
  const isMobile = useIsMobile()

  const query = useQuery({
    queryKey: ['accounting', 'journal', journalId],
    queryFn: () => getJournal(journalId),
  })

  // 헤더 화면명 (분개번호 bracket)
  usePageTitle('분개 상세', query.data?.journalNo)

  const [topError, setTopError] = useState('')
  const [collabEditMode, setCollabEditMode] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)

  const postMutation = useMutation({
    mutationFn: () => postJournal(journalId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['accounting', 'journal', journalId],
      })
      queryClient.invalidateQueries({ queryKey: ['accounting', 'journals'] })
    },
    onError: (err: Error) => setTopError(`확정 실패: ${err.message}`),
  })

  const reverseMutation = useMutation({
    mutationFn: (reason: string) => reverseJournal(journalId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['accounting', 'journal', journalId],
      })
      queryClient.invalidateQueries({ queryKey: ['accounting', 'journals'] })
    },
    onError: (err: Error) => setTopError(`역분개 실패: ${err.message}`),
  })

  const handlePost = () => {
    setTopError('')
    if (!confirm('이 분개를 확정하시겠습니까? 확정 후 수정할 수 없습니다.')) {
      return
    }
    postMutation.mutate()
  }

  const handleReverse = () => {
    setTopError('')
    const reason = prompt('역분개 사유를 입력하세요 (필수):')
    if (!reason || reason.trim().length < 2) {
      setTopError('역분개 사유는 2자 이상이어야 합니다.')
      return
    }
    reverseMutation.mutate(reason.trim())
  }

  if (query.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="분개 불러오는 중" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="error-banner" role="alert">
        분개 상세를 불러오지 못했습니다.
      </div>
    )
  }

  const journal = query.data
  const isDraft = journal.status === 'DRAFT'
  const isPosted = journal.status === 'POSTED'
  // `/accounting/journals/:id/edit` 는 DRAFT 를 hydrate 하지만 저장은 현재도 POST /accounting/journals(CREATE) 를 호출한다.
  const canOpenDraftCreateShell = canAccess('accounting.journals', 'create')
  const canUpdateJournal = canAccess('accounting.journals', 'update')
  const canCollabEdit = canUpdateJournal && journal.status !== 'REVERSED'
  const collabCurrentValues = {
    description: journal.description,
    lines: journal.lines.map((line) => ({
      lineNo: line.lineNo,
      accountCode: line.accountCode,
      accountName: line.accountName,
      debit: line.debit,
      credit: line.credit,
      memo: line.memo ?? line.note,
    })),
  }

  const columns: DataTableColumn<JournalLine>[] = [
    {
      key: 'lineNo',
      header: '#',
      width: '40px',
      align: 'center',
      // lineNo 는 BE 1-based(JournalService lineNo=1..) — 협업 패널 라인 라벨과 일관되게 그대로 표기.
      render: (l) => l.lineNo,
    },
    {
      key: 'accountCode',
      header: '계정과목',
      width: '220px',
      render: (l) => (
        <span>
          <span style={{ color: '#6B7280', marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>
            {l.accountCode}
          </span>
          {l.accountName ?? ''}
        </span>
      ),
    },
    {
      key: 'debit',
      header: '차변',
      width: '140px',
      align: 'right',
      render: (l) => fmtKrw(l.debit),
    },
    {
      key: 'credit',
      header: '대변',
      width: '140px',
      align: 'right',
      render: (l) => fmtKrw(l.credit),
    },
    {
      key: 'partnerName',
      header: '거래처',
      width: '180px',
      render: (l) => l.partnerName ?? '—',
    },
    {
      key: 'note',
      header: '메모',
      render: (l) => l.memo ?? l.note ?? '—',
    },
  ]

  const mobilePrimaryAction = isDraft && canUpdateJournal
    ? {
        label: postMutation.isPending ? '확정 중...' : '확정',
        onClick: handlePost,
        disabled: postMutation.isPending,
      }
    : isPosted && canUpdateJournal
      ? {
          label: reverseMutation.isPending ? '역분개 중...' : '역분개',
          onClick: handleReverse,
          disabled: reverseMutation.isPending,
        }
      : null

  return (
    <>
      {isMobile ? (
        <>
          <div className="mobile-summary-card" data-testid="journal-mobile-summary">
            <div className="mobile-summary-card-header">
              <span className="mobile-summary-doc-no">{journal.journalNo}</span>
              <span className="mobile-status-badge" style={journalStatusBadgeStyle(journal.status)}>
                {JOURNAL_STATUS_LABEL[journal.status] ?? journal.status}
              </span>
            </div>
            <div className="mobile-summary-partner">{journal.description ?? '분개'}</div>
            <div className="mobile-summary-divider" />
            <div className="mobile-summary-total-row">
              <span className="mobile-summary-total-amount">{fmtKrw(journal.totalDebit)}원</span>
              <span className="mobile-summary-date">일자 {journal.journalDate}</span>
            </div>
          </div>

          <div className="mobile-action-bar" role="toolbar" aria-label="분개 액션">
            {mobilePrimaryAction ? (
              <button
                type="button"
                className="mobile-action-primary"
                disabled={mobilePrimaryAction.disabled}
                onClick={mobilePrimaryAction.onClick}
              >
                {mobilePrimaryAction.label}
              </button>
            ) : null}
            <button
              type="button"
              className="mobile-action-icon"
              aria-label="더보기"
              onClick={() => setMobileMoreOpen(true)}
            >
              ···
            </button>
            {mobileMoreOpen ? (
              <>
                <div className="mobile-more-overlay" role="presentation" onClick={() => setMobileMoreOpen(false)} />
                <div className="mobile-more-sheet" role="dialog" aria-label="추가 액션">
                  <div className="mobile-more-sheet-handle" />
                  {canCollabEdit && !collabEditMode ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item"
                      onClick={() => {
                        setMobileMoreOpen(false)
                        setCollabEditMode(true)
                      }}
                    >
                      수정
                    </button>
                  ) : null}
                  {isDraft && canOpenDraftCreateShell ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item"
                      onClick={() => {
                        setMobileMoreOpen(false)
                        navigate(`/accounting/journals/${journal.id}/edit`)
                      }}
                    >
                      편집
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          <MobileCollapsible title="분개 상세 정보" className="mobile-section-card">
            {[
              { label: '일자', value: journal.journalDate },
              { label: '작성자', value: journal.createdByName },
              { label: '적요', value: journal.description },
              { label: '역분개 사유', value: journal.reverseReason },
            ].map(({ label, value }) => {
              const displayValue = value == null || value === '' ? '-' : String(value)
              return (
                <div key={label} className="mobile-field-row">
                  <span className="mobile-field-label">{label}</span>
                  <span className={`mobile-field-value${displayValue === '-' ? ' mobile-field-value-empty' : ''}`}>
                    {displayValue}
                  </span>
                </div>
              )
            })}
          </MobileCollapsible>
        </>
      ) : null}

      <Card>
        {!isMobile ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                {journal.journalNo}
              </h3>
              <JournalStatusBadge status={journal.status} />
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: '#6B7280' }}>
              일자: {journal.journalDate}
              {journal.createdByName ? ` · 작성자: ${journal.createdByName}` : ''}
              {journal.postedAt
                ? ` · 확정: ${new Date(journal.postedAt).toLocaleString('ko-KR')}`
                : ''}
              {journal.reversedAt
                ? ` · 역분개: ${new Date(journal.reversedAt).toLocaleString('ko-KR')}`
                : ''}
            </div>
            {journal.description ? (
              <div style={{ marginTop: 8, fontSize: 14 }}>
                <strong>적요</strong>: {journal.description}
              </div>
            ) : null}
            {journal.reverseReason ? (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  color: '#DC2626',
                }}
              >
                <strong>역분개 사유</strong>: {journal.reverseReason}
              </div>
            ) : null}
          </div>

          <div className="detail-action-bar" style={{ display: 'flex', gap: 8 }}>
            {canCollabEdit && !collabEditMode ? (
              <Button
                variant="primary"
                data-testid="journal-collab-edit-open"
                onClick={() => setCollabEditMode(true)}
              >
                수정
              </Button>
            ) : null}
            {isDraft && canOpenDraftCreateShell ? (
              <Button
                variant="ghost"
                onClick={() =>
                  navigate(`/accounting/journals/${journal.id}/edit`)
                }
              >
                편집
              </Button>
            ) : null}
            {isDraft && canUpdateJournal ? (
              <Button
                variant="primary"
                onClick={handlePost}
                disabled={postMutation.isPending}
              >
                {postMutation.isPending ? '확정 중...' : '확정'}
              </Button>
            ) : null}
            {isPosted && canUpdateJournal ? (
              <Button
                variant="ghost"
                onClick={handleReverse}
                disabled={reverseMutation.isPending}
              >
                {reverseMutation.isPending ? '역분개 중...' : '역분개'}
              </Button>
            ) : null}
          </div>
        </div>
        ) : null}

        <div className="detail-mobile-hide">
          <DataTable
            columns={columns}
            rows={journal.lines}
            rowKey={(l) => l.id}
            emptyMessage="라인이 없습니다."
          />
        </div>

        <div className="mobile-item-list" data-testid="journal-mobile-lines">
          {journal.lines.length === 0 ? (
            <div className="mobile-item-card">
              <div className="mobile-item-total-row">
                <span className="mobile-item-total-label">라인</span>
                <span className="mobile-item-total-value">라인이 없습니다.</span>
              </div>
            </div>
          ) : (
            journal.lines.map((line) => (
              <div key={line.id} className="mobile-item-card">
                <div className="mobile-item-card-header">
                  <div className="mobile-item-name">
                    {line.accountName ?? '계정과목'}
                  </div>
                </div>
                <div className="mobile-item-model">{line.accountCode}</div>
                <div className="mobile-item-divider" />
                <div className="mobile-item-metrics">
                  <div className="mobile-item-metric">
                    <span className="mobile-item-metric-label">차변</span>
                    <span className="mobile-item-metric-value">{fmtKrw(line.debit)}</span>
                  </div>
                  <div className="mobile-item-metric">
                    <span className="mobile-item-metric-label">대변</span>
                    <span className="mobile-item-metric-value">{fmtKrw(line.credit)}</span>
                  </div>
                </div>
                <div className="mobile-item-chips">
                  {line.partnerName ? <span className="mobile-item-chip">{line.partnerName}</span> : null}
                  {line.memo ?? line.note ? <span className="mobile-item-chip">{line.memo ?? line.note}</span> : null}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 합계 */}
        <div
          className="journal-totals"
          style={{
            marginTop: 16,
            padding: '12px 16px',
            background: '#F9FAFB',
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          <div />
          <div style={{ fontWeight: 600 }}>합계</div>
          <div style={{ textAlign: 'right', fontWeight: 600 }}>
            {fmtKrw(journal.totalDebit)}
          </div>
          <div style={{ textAlign: 'right', fontWeight: 600 }}>
            {fmtKrw(journal.totalCredit)}
          </div>
          <div />
        </div>
      </Card>

      {isMobile ? (
        <MobileCollapsible title="협업 · 코멘트" defaultOpen className="mobile-section-card">
          <JournalCollaborationPanel
            journalId={journalId}
            currentValues={collabCurrentValues}
            editMode={collabEditMode}
            onEditModeChange={setCollabEditMode}
            onCommitted={() => {
              void queryClient.invalidateQueries({
                queryKey: ['accounting', 'journal', journalId],
              })
              void queryClient.invalidateQueries({ queryKey: ['accounting', 'journals'] })
            }}
          />
        </MobileCollapsible>
      ) : (
        <JournalCollaborationPanel
          journalId={journalId}
          currentValues={collabCurrentValues}
          editMode={collabEditMode}
          onEditModeChange={setCollabEditMode}
          onCommitted={() => {
            void queryClient.invalidateQueries({
              queryKey: ['accounting', 'journal', journalId],
            })
            void queryClient.invalidateQueries({ queryKey: ['accounting', 'journals'] })
          }}
        />
      )}

      {topError ? (
        <div
          className="error-banner"
          role="alert"
          style={{ marginTop: 16, padding: 12, color: '#DC2626' }}
        >
          {topError}
        </div>
      ) : null}
    </>
  )
}
