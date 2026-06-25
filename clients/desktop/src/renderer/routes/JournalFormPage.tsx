/**
 * 분개 작성/편집 화면.
 *
 * 라우트:
 * - `/accounting/journals/new`        — 신규 작성 (mode=create)
 * - `/accounting/journals/:id/edit`   — DRAFT 분개 편집 (mode=edit)
 *
 * 본 슬라이스에서는 mode=create 만 BE 호출. mode=edit 은 라우팅 path 만 받아두고
 * 실제 PATCH endpoint 가 BE 에 도입될 때 함께 enable. 따라서 edit 모드 진입 시
 * 기존 분개를 fetch 해 폼에 채우되, "저장" 버튼이 신규 분개를 생성한다 (덮어쓰기 X).
 *
 * UX:
 * - 헤더: 일자 + 적요
 * - 라인: JournalLineRow 다중 (최소 2 라인 강제)
 * - 합계 표시: 차변 / 대변 / 차이 (불일치 시 빨간색)
 * - 액션: [저장] [취소]
 *
 * UUID 비공개 가드: 사용자에게는 journalNo / accountCode 만 노출. line.id /
 * journal.id 는 화면 표시 X.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AccountCodeSelect,
  Button,
  Card,
  Input,
  JournalLineRow,
  MoneyInput,
  Spinner,
  type Account,
  type JournalLineDraft,
} from '@samhan/design-system'
import {
  createJournal,
  getJournal,
  listAccounts,
  type CreateJournalRequest,
} from '../api/accounting'
import { useIsMobile } from '../hooks/useIsMobile'
import { usePageTitle } from '../hooks/usePageTitle'

/** 라인 번호 안정성을 위한 row uid (React key — index 사용 시 사라지면 input remount). */
let __lineUidCounter = 0
const nextLineUid = (): string => `line-${++__lineUidCounter}`

interface DraftLine extends JournalLineDraft {
  /** React key 안정성 보장을 위한 클라이언트 임시 uid. BE 전송 시 제거. */
  uid: string
}

const emptyLine = (): DraftLine => ({
  uid: nextLineUid(),
  accountCode: '',
  debit: 0,
  credit: 0,
  partnerName: '',
  note: '',
})

/** YYYY-MM-DD 오늘 날짜 (한국 시간 기준 클라이언트 local). */
const today = (): string => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** 정수 → 천단위 콤마 표시. */
const fmt = (n: number): string =>
  n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

interface MobileJournalLineCardProps {
  index: number
  line: DraftLine
  accounts: Account[]
  onChange: (patch: Partial<JournalLineDraft>) => void
  onRemove: () => void
}

function MobileJournalLineCard({
  index,
  line,
  accounts,
  onChange,
  onRemove,
}: MobileJournalLineCardProps) {
  return (
    <div className="mobile-line-card" data-line-index={index}>
      <div className="mobile-line-card-header">
        <span className="mobile-line-card-index">{index}</span>
        <button
          type="button"
          className="mobile-line-remove-button"
          onClick={onRemove}
          aria-label={`라인 ${index} 삭제`}
        >
          삭제
        </button>
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">계정과목</label>
        <AccountCodeSelect
          value={line.accountCode}
          onChange={(code) => onChange({ accountCode: code })}
          accounts={accounts}
          required
          ariaLabel={`라인 ${index} 계정과목`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">차변</label>
        <MoneyInput
          value={line.debit}
          onChange={(n) => onChange({ debit: n })}
          ariaLabel={`라인 ${index} 차변`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">대변</label>
        <MoneyInput
          value={line.credit}
          onChange={(n) => onChange({ credit: n })}
          ariaLabel={`라인 ${index} 대변`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">거래처</label>
        <input
          type="text"
          className="mobile-line-text-input"
          value={line.partnerName}
          onChange={(e) => onChange({ partnerName: e.target.value })}
          placeholder="거래처"
          aria-label={`라인 ${index} 거래처`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">적요</label>
        <input
          type="text"
          className="mobile-line-text-input"
          value={line.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="적요"
          aria-label={`라인 ${index} 적요`}
        />
      </div>
    </div>
  )
}

export function JournalFormPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams<{ id?: string }>()
  const editId = params['id']
  const isEdit = Boolean(editId)
  const isMobile = useIsMobile()

  usePageTitle(isEdit ? '분개 편집' : '분개 작성')

  // 마스터 계정 — 라인 select 에 주입
  const accountsQuery = useQuery({
    queryKey: ['accounting', 'accounts'],
    queryFn: listAccounts,
  })

  // 편집 모드: 기존 분개 fetch 후 폼에 채움
  const journalQuery = useQuery({
    queryKey: ['accounting', 'journal', editId],
    queryFn: () => getJournal(editId!),
    enabled: isEdit,
  })

  const [journalDate, setJournalDate] = useState<string>(today())
  const [description, setDescription] = useState<string>('')
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()])
  const [topError, setTopError] = useState<string>('')

  // 편집 모드: 데이터 도착 시 한 번 폼에 hydrate
  useEffect(() => {
    if (!isEdit) return
    const j = journalQuery.data
    if (!j) return
    setJournalDate(j.journalDate)
    setDescription(j.description ?? '')
    setLines(
      j.lines.map((l) => ({
        uid: nextLineUid(),
        accountCode: l.accountCode,
        debit: Number.parseInt(l.debit, 10) || 0,
        credit: Number.parseInt(l.credit, 10) || 0,
        partnerName: l.partnerName ?? '',
        note: l.memo ?? l.note ?? '',
      })),
    )
  }, [isEdit, journalQuery.data])

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, l) => sum + l.debit, 0)
    const credit = lines.reduce((sum, l) => sum + l.credit, 0)
    return { debit, credit, diff: debit - credit }
  }, [lines])

  const isBalanced = totals.diff === 0 && totals.debit > 0

  const updateLine = (index: number, patch: Partial<JournalLineDraft>) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    )
  }
  const removeLine = (index: number) => {
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== index)
      // 최소 2 라인 보장
      while (next.length < 2) next.push(emptyLine())
      return next
    })
  }
  const addLine = () => setLines((prev) => [...prev, emptyLine()])

  const createMutation = useMutation({
    mutationFn: (body: CreateJournalRequest) => createJournal(body),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['accounting', 'journals'] })
      navigate(`/accounting/journals/${created.id}`, { replace: true })
    },
    onError: (err: Error) => {
      setTopError(`저장 실패: ${err.message}`)
    },
  })

  const handleSave = () => {
    setTopError('')

    // 클라이언트 검증
    if (!journalDate) {
      setTopError('일자를 입력하세요.')
      return
    }
    const meaningfulLines = lines.filter(
      (l) => l.accountCode && (l.debit > 0 || l.credit > 0),
    )
    if (meaningfulLines.length < 2) {
      setTopError('최소 2 라인 (계정 + 금액) 을 입력하세요.')
      return
    }
    for (const l of meaningfulLines) {
      if (l.debit > 0 && l.credit > 0) {
        setTopError(
          `라인 "${l.accountCode}" 는 차변/대변 중 한 쪽만 입력 가능합니다.`,
        )
        return
      }
    }
    if (totals.diff !== 0) {
      setTopError(
        `차변/대변 합계가 일치하지 않습니다 (차이: ${fmt(totals.diff)} 원).`,
      )
      return
    }

    const body: CreateJournalRequest = {
      journalDate,
      description: description.trim() || undefined,
      lines: meaningfulLines.map((l) => ({
        accountCode: l.accountCode,
        debit: String(l.debit),
        credit: String(l.credit),
        partnerName: l.partnerName.trim() || undefined,
        note: l.note.trim() || undefined,
      })),
    }
    createMutation.mutate(body)
  }

  if (isEdit && journalQuery.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="분개 불러오는 중" />
      </div>
    )
  }

  if (accountsQuery.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="계정과목 불러오는 중" />
      </div>
    )
  }

  const accounts = Array.isArray(accountsQuery.data) ? accountsQuery.data : []

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{isEdit ? '분개 편집' : '분개 작성'}</h3>
        <p style={{ marginTop: 4, fontSize: 13, color: '#6B7280' }}>
          최소 2 라인 + 차변/대변 합계 일치가 필요합니다.
        </p>
      </div>

      <Card>
        <div
          className="mobile-form-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '180px 1fr',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <Input
            label="일자"
            type="date"
            value={journalDate}
            onChange={(e) => setJournalDate(e.target.value)}
            required
          />
          <Input
            label="적요"
            placeholder="예: 5월 1주차 매출 입금"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {isMobile ? (
          <div className="mobile-line-card-list">
            {lines.map((line, i) => (
              <MobileJournalLineCard
                key={line.uid}
                index={i + 1}
                line={line}
                accounts={accounts}
                onChange={(patch) => updateLine(i, patch)}
                onRemove={() => removeLine(i)}
              />
            ))}
          </div>
        ) : (
          <>
            {/* 라인 헤더 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 220px 140px 140px 160px 1fr',
                gap: 8,
                padding: '8px 0',
                borderBottom: '2px solid #E5E7EB',
                fontSize: 12,
                color: '#6B7280',
                fontWeight: 600,
              }}
            >
              <div style={{ textAlign: 'center' }}>#</div>
              <div>계정과목</div>
              <div style={{ textAlign: 'right' }}>차변</div>
              <div style={{ textAlign: 'right' }}>대변</div>
              <div>거래처</div>
              <div>메모</div>
            </div>

            {lines.map((line, i) => (
              <JournalLineRow
                key={line.uid}
                index={i + 1}
                line={line}
                accounts={accounts}
                onChange={(patch) => updateLine(i, patch)}
                onRemove={() => removeLine(i)}
              />
            ))}
          </>
        )}

        <div style={{ marginTop: 12 }}>
          <Button variant="ghost" size="sm" onClick={addLine}>
            + 라인 추가
          </Button>
        </div>

        {/* 합계 표시 */}
        <div
          style={{
            marginTop: 16,
            padding: '12px 16px',
            background: '#F9FAFB',
            borderRadius: 6,
            display: 'grid',
            gridTemplateColumns: '36px 220px 140px 140px 1fr',
            gap: 8,
            fontSize: 14,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <div />
          <div style={{ fontWeight: 600 }}>합계</div>
          <div style={{ textAlign: 'right', fontWeight: 600 }}>
            {fmt(totals.debit)}
          </div>
          <div style={{ textAlign: 'right', fontWeight: 600 }}>
            {fmt(totals.credit)}
          </div>
          <div
            style={{
              fontSize: 13,
              color: isBalanced ? '#059669' : '#DC2626',
              fontWeight: 600,
            }}
          >
            {isBalanced
              ? '차/대변 일치 ✓'
              : `차이: ${fmt(totals.diff)} 원`}
          </div>
        </div>
      </Card>

      {topError ? (
        <div
          className="error-banner"
          role="alert"
          style={{ marginTop: 16, padding: 12, color: '#DC2626' }}
        >
          {topError}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 16,
        }}
      >
        <Button variant="ghost" onClick={() => navigate(-1)}>
          취소
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={createMutation.isPending || !isBalanced}
        >
          {createMutation.isPending ? '저장 중...' : '저장'}
        </Button>
      </div>
    </>
  )
}
