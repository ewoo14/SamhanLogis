/**
 * 분개 상세 화면 (`/accounting/journals/:id`).
 *
 * - 헤더: 분개번호 + 일자 + 상태 + 적요 + 작성자
 * - 라인 표 (read-only)
 * - 합계: 차변 / 대변
 * - 액션:
 *   * DRAFT  → "확정" (POSTED 로 전환), "편집" (FormPage edit), "취소"
 *   * POSTED → "역분개" (사유 입력 후 REVERSED 전환)
 *   * POSTED + CASH_RECEIPT → 원장 직접 역분개 차단, 입금보고서 취소/수정 경유 안내
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
  safeActorName,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  getJournal,
  postJournal,
  reverseJournal,
  type JournalLine,
} from '../api/accounting'
import { JournalCollaborationPanel } from '../components/collab/JournalCollaborationPanel'
import { MobileActionSheet } from '../components/common/MobileActionSheet'
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

/** 합계 행 sentinel id — 실 라인 UUID 와 충돌하지 않는 로컬 표식(화면 미노출). */
const TOTAL_ROW_ID = '__journal_total__'

const JOURNAL_STATUS_LABEL: Record<string, string> = {
  DRAFT: '임시저장',
  POSTED: '확정',
  REVERSED: '역분개',
}

const CASH_RECEIPT_REVERSE_NOTICE =
  '이 분개는 입금보고서에서 자동 생성되었습니다. 원천 입금보고서 상세에서 취소/수정하면 역분개가 자동 게시됩니다.'

const CASH_RECEIPT_REVERSE_CAPTION =
  '입금보고서 자동 분개는 원천 입금보고서 취소/수정 시 역분개가 자동 게시됩니다.'

const CASH_RECEIPT_MANAGEMENT_NOTICE =
  `${CASH_RECEIPT_REVERSE_NOTICE} 원장 응답에 원천 입금보고서 식별자가 없어 상세 직접 이동은 제공하지 않습니다.`

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

function JournalCellEllipsis({ value }: { value: string }) {
  const hasTitle = value !== '—' && value !== ''
  return (
    <span className="journal-cell-ellipsis" title={hasTitle ? value : undefined}>
      {value}
    </span>
  )
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
  const isCashReceiptJournal = journal.sourceType === 'CASH_RECEIPT'
  const canReversePostedJournal = isPosted && !isCashReceiptJournal
  const showCashReceiptReverseNotice = isPosted && isCashReceiptJournal
  const cashReceiptDetailPath = isCashReceiptJournal && journal.cashReceiptId && journal.cashReceiptSlipNo
    ? `/accounting/admin/cash-receipts/${journal.cashReceiptId}`
    : null
  const cashReceiptActionLabel = cashReceiptDetailPath
    ? `입금보고서 ${journal.cashReceiptSlipNo} 보기`
    : '현금 입금 관리 메뉴에서 조회'
  const cashReceiptActionTitle = cashReceiptDetailPath
    ? `${CASH_RECEIPT_REVERSE_NOTICE} 원천 입금보고서 ${journal.cashReceiptSlipNo} 상세로 이동합니다.`
    : CASH_RECEIPT_MANAGEMENT_NOTICE
  // `/accounting/journals/:id/edit` 는 DRAFT 를 hydrate 하지만 저장은 현재도 POST /accounting/journals(CREATE) 를 호출한다.
  const canOpenDraftCreateShell = canAccess('accounting.journals', 'create')
  const canUpdateJournal = canAccess('accounting.journals', 'update')
  const canViewCashReceipt = canAccess('accounting.cash-receipts', 'view')
  const canOpenCashReceiptDetail = cashReceiptDetailPath != null && canViewCashReceipt
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

  // 합계는 별도 div-grid 근사가 아니라 테이블 마지막 행으로 편입한다 — table-layout 과 무관하게
  // 열 정렬을 테이블 자체가 구조적으로 보장(개발책임자 "합계열이 위 열과 안 맞음" 재지적 해소).
  const isTotalRow = (l: JournalLine) => l.id === TOTAL_ROW_ID
  const tableRows: JournalLine[] = journal.lines.length === 0
    ? []
    : [
        ...journal.lines,
        {
          id: TOTAL_ROW_ID,
          lineNo: 0,
          accountCode: '',
          accountName: null,
          debit: journal.totalDebit,
          credit: journal.totalCredit,
          partnerName: null,
          note: null,
          memo: null,
        },
      ]

  // 열 순서 — 개발책임자 지시: 거래처를 차변 왼쪽으로 이동(+너비 확대). 금액(차/대)은 우측 블록.
  const columns: DataTableColumn<JournalLine>[] = [
    {
      key: 'lineNo',
      header: '#',
      width: '40px',
      align: 'center',
      // lineNo 는 BE 1-based(JournalService lineNo=1..) — 협업 패널 라인 라벨과 일관되게 그대로 표기.
      render: (l) => (isTotalRow(l) ? '' : l.lineNo),
    },
    {
      key: 'accountCode',
      header: '계정과목',
      width: '160px',
      render: (l) =>
        isTotalRow(l) ? (
          <span style={{ fontWeight: 600 }}>합계</span>
        ) : (
          <span className="journal-account-cell">
            <span className="journal-account-code">
              {l.accountCode}
            </span>
            <JournalCellEllipsis value={l.accountName ?? '—'} />
          </span>
        ),
    },
    {
      key: 'partnerName',
      header: '거래처',
      width: '260px',
      render: (l) => (isTotalRow(l) ? '' : <JournalCellEllipsis value={l.partnerName ?? '—'} />),
    },
    {
      key: 'debit',
      header: '차변',
      width: '110px',
      align: 'right',
      render: (l) => (isTotalRow(l) ? <strong>{fmtKrw(l.debit)}</strong> : fmtKrw(l.debit)),
    },
    {
      key: 'credit',
      header: '대변',
      width: '110px',
      align: 'right',
      render: (l) => (isTotalRow(l) ? <strong>{fmtKrw(l.credit)}</strong> : fmtKrw(l.credit)),
    },
    {
      key: 'note',
      header: '메모',
      width: '180px',
      render: (l) => (isTotalRow(l) ? '' : <JournalCellEllipsis value={l.memo ?? l.note ?? '—'} />),
    },
  ]

  const mobilePrimaryAction = isDraft && canUpdateJournal
    ? {
        label: postMutation.isPending ? '확정 중...' : '확정',
        onClick: handlePost,
        disabled: postMutation.isPending,
      }
    : canReversePostedJournal && canUpdateJournal
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
            {showCashReceiptReverseNotice ? (
              <div style={{ marginTop: 10, fontSize: 12, color: '#92400E' }}>
                {CASH_RECEIPT_REVERSE_CAPTION}
              </div>
            ) : null}
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
            <MobileActionSheet open={mobileMoreOpen} onClose={() => setMobileMoreOpen(false)}>
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
                  {canOpenCashReceiptDetail ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item"
                      title={cashReceiptActionTitle}
                      onClick={() => {
                        setMobileMoreOpen(false)
                        navigate(cashReceiptDetailPath)
                      }}
                    >
                      {cashReceiptActionLabel}
                    </button>
                  ) : null}
            </MobileActionSheet>
          </div>

          <MobileCollapsible title="분개 상세 정보" className="mobile-section-card">
            {[
              { label: '일자', value: journal.journalDate },
              { label: '작성자', value: safeActorName(journal.createdByName) ?? '변경자 미상' },
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
              {journal.createdByName ? ` · 작성자: ${safeActorName(journal.createdByName) ?? '변경자 미상'}` : ''}
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
            {showCashReceiptReverseNotice ? (
              <div style={{ marginTop: 8, fontSize: 13, color: '#92400E' }}>
                {CASH_RECEIPT_REVERSE_CAPTION}
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
            {canReversePostedJournal && canUpdateJournal ? (
              <Button
                variant="ghost"
                onClick={handleReverse}
                disabled={reverseMutation.isPending}
              >
                {reverseMutation.isPending ? '역분개 중...' : '역분개'}
              </Button>
            ) : null}
            {canOpenCashReceiptDetail ? (
              <Button
                variant="ghost"
                onClick={() => navigate(cashReceiptDetailPath)}
                title={cashReceiptActionTitle}
              >
                {cashReceiptActionLabel}
              </Button>
            ) : null}
          </div>
        </div>
        ) : null}

        <div className="detail-mobile-hide journal-detail-table-scroll">
          <DataTable
            className="journal-detail-line-table"
            columns={columns}
            rows={tableRows}
            rowKey={(l) => l.id}
            rowClassName={(l) => (isTotalRow(l) ? 'journal-total-row' : undefined)}
            tableLayout="fixed"
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
                    {line.accountName ?? '—'}
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

        {/* 합계는 라인 테이블 마지막 행(journal-total-row)으로 렌더 — 모바일 카드 합계는 별도 표기.
            차변/대변을 결합 문자열("X / Y")로 렌더하면 10자리 금액에서 개행/절단 위험(Opus 재검 HIGH) —
            라인 카드가 쓰는 2열 grid(mobile-item-metrics) 패턴을 그대로 재사용해 분리 렌더한다. */}
        {journal.lines.length > 0 ? (
          <div className="mobile-item-list" data-testid="journal-mobile-total">
            <div className="mobile-item-card">
              <div className="mobile-item-card-header">
                <div className="mobile-item-name">합계</div>
              </div>
              <div className="mobile-item-divider" />
              <div className="mobile-item-metrics">
                <div className="mobile-item-metric">
                  <span className="mobile-item-metric-label">차변</span>
                  <span className="mobile-item-metric-value">{fmtKrw(journal.totalDebit)}</span>
                </div>
                <div className="mobile-item-metric">
                  <span className="mobile-item-metric-label">대변</span>
                  <span className="mobile-item-metric-value">{fmtKrw(journal.totalCredit)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      {isMobile ? (
        <MobileCollapsible title="코멘트" defaultOpen className="mobile-section-card">
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
