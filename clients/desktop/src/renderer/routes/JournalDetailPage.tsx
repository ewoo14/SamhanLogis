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
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

const fmtKrw = (raw: string): string => {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return raw
  if (n === 0) return '—'
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function JournalDetailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams<{ id: string }>()
  const journalId = params['id']!
  const { canAccess } = usePermissions()

  const query = useQuery({
    queryKey: ['accounting', 'journal', journalId],
    queryFn: () => getJournal(journalId),
  })

  // 헤더 화면명 (분개번호 bracket)
  usePageTitle('분개 상세', query.data?.journalNo)

  const [topError, setTopError] = useState('')
  const [collabEditMode, setCollabEditMode] = useState(false)

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

  return (
    <>
      <Card>
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

          <div style={{ display: 'flex', gap: 8 }}>
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

        <DataTable
          columns={columns}
          rows={journal.lines}
          rowKey={(l) => l.id}
          emptyMessage="라인이 없습니다."
        />

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
