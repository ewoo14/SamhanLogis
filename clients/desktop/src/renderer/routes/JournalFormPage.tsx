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
  AsyncAutocomplete,
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
  searchJournalPartners,
  type CreateJournalRequest,
  type JournalPartnerOption,
} from '../api/accounting'
import { isPartnerLookupUnavailableError } from '../api/apiError'
import { PartnerLookupErrorBanner } from '../components/common/PartnerLookupErrorBanner'
import { useIsMobile } from '../hooks/useIsMobile'
import { usePageTitle } from '../hooks/usePageTitle'
import { buildRiskyPartnerLinesWarning, findRiskyPartnerLines } from './JournalFormPage.model'
import {
  appendBlankRowIfLastChanged,
  ensureTrailingBlankRow,
  filterMeaningfulRows,
  removeLinePreservingMinimum,
} from '../utils/autoBlankRow'

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
  partnerId: null,
  partnerName: '',
  note: '',
})

/** 삭제 후 trailing 입력행을 보장할 때 쓰는 분개 라인 확정 판정. */
const isJournalLineConfirmed = (line: DraftLine): boolean => Boolean(
  line.accountCode.trim()
  || line.debit > 0
  || line.credit > 0
  || line.partnerId
  || line.partnerName.trim()
  || line.note.trim(),
)

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

const JOURNAL_LINE_GRID_TEMPLATE = '40px 160px 260px 110px 110px minmax(180px, 1fr)'

interface MobileJournalLineCardProps {
  index: number
  line: DraftLine
  accounts: Account[]
  onChange: (patch: Partial<JournalLineDraft>) => void
  onRemove: () => void
}

interface JournalPartnerPickerProps {
  index: number
  line: DraftLine
  onChange: (patch: Partial<JournalLineDraft>) => void
}

function JournalPartnerPicker({ index, line, onChange }: JournalPartnerPickerProps) {
  const selected: JournalPartnerOption | null = line.partnerId || line.partnerName
    ? {
        partnerId: line.partnerId ?? `legacy-name:${line.partnerName}`,
        partnerCode: '',
        name: line.partnerName,
        bizNo: null,
      }
    : null

  return (
    <AsyncAutocomplete<JournalPartnerOption>
      value={selected}
      onChange={(partner) => onChange({
        partnerId: partner?.partnerId ?? null,
        partnerName: partner?.name ?? '',
      })}
      search={searchJournalPartners}
      getKey={(partner) => partner.partnerId}
      getInputLabel={(partner) => partner.name}
      matchExact={(partner, trimmed) =>
        partner.name.toLowerCase() === trimmed.toLowerCase()
          || partner.partnerCode.toLowerCase() === trimmed.toLowerCase()
          || (partner.bizNo ?? '').toLowerCase() === trimmed.toLowerCase()}
      renderOption={(partner) => (
        <>
          <span>{partner.name}</span>
          {partner.partnerCode ? <span> · {partner.partnerCode}</span> : null}
          {partner.bizNo ? <span> · {partner.bizNo}</span> : null}
        </>
      )}
      listboxLabel={`라인 ${index} 거래처 목록`}
      ariaLabel={`라인 ${index} 거래처`}
      placeholder="거래처명 또는 코드"
      minChars={1}
    />
  )
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
        <label className="mobile-line-field-label">거래처</label>
        <JournalPartnerPicker
          index={index}
          line={line}
          onChange={onChange}
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
        <label className="mobile-line-field-label">메모</label>
        <input
          type="text"
          className="mobile-line-text-input"
          value={line.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="메모"
          aria-label={`라인 ${index} 메모`}
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
  // #831 R-3/R-5 — 편집 hydrate 라인 중 지금도 partnerId 가 없는 라인을 무경고로 저장하지
  // 않기 위한 추적 상태. hydratedLineUids=서버가 채운 라인 uid(사용자가 이번 세션에 새로
  // 추가한 라인은 제외 — 의식적으로 비워둔 것이므로 위험 판정에서 뺀다).
  // partnerLookupSuspectedUnavailable=이번 세션에 거래처 조회 UNAVAILABLE 502 를 실제로
  // 관측했는지(정확한 안내 문구 선택에만 사용). pendingRiskyConfirm=경고를 이미 보여줘
  // 재확인 대기 중인지 — "그대로 저장" 재클릭으로만 진행한다(하드 블록 아님).
  const [hydratedLineUids, setHydratedLineUids] = useState<Set<string>>(new Set())
  const [partnerLookupSuspectedUnavailable, setPartnerLookupSuspectedUnavailable] = useState(false)
  const [pendingRiskyConfirm, setPendingRiskyConfirm] = useState(false)

  // #831-hydrate — journalQuery.data 하이드레이션을 useEffect 대신 렌더 중 파생으로 처리한다
  // (같은 계열, CashReceiptFormPage #831-hydrate 수단 1과 동일). useEffect 로 하면
  // "isLoading→false 렌더"(journalDate/lines 는 아직 오늘 날짜·빈 라인 2개인 초기값)와
  // "실제 분개 값으로 채워지는 렌더"(effect 실행 후) 사이에 실제로 커밋되는 프레임이
  // 존재한다. 그 프레임에서는 최소 2 라인 미달로 "최소 2 라인 (계정 + 금액) 을 입력하세요."
  // 같은 엉뚱한 topError 가 기존(실제로는 라인이 있는) 분개에 대해 뜰 수 있다. 렌더 중
  // setState 를 호출하면 React 는 이 프레임을 커밋하지 않고 새 state 로 즉시 재렌더하므로
  // (공식 패턴: "Adjusting state when a prop changes") 이 창 자체가 사라진다.
  //
  // 기존 useEffect 는 가드가 없어(ref 도 없음) journalQuery.data 참조가 바뀔 때마다 매번
  // 재하이드레이트했다(SSE·재조회 등으로 새 데이터가 오면 로컬 편집을 그대로 버린다) — 그
  // 시맨틱을 identical 하게 보존하기 위해 "직전에 하이드레이트한 데이터 참조"를 state 로
  // 추적해 매번 참조가 바뀔 때만 재실행되도록 한다(CashReceiptFormPage 의
  // hydratedFromReceipt 와 동일 패턴).
  const [hydratedFromJournal, setHydratedFromJournal] = useState<typeof journalQuery.data>(undefined)
  if (isEdit && journalQuery.data && journalQuery.data !== hydratedFromJournal) {
    setHydratedFromJournal(journalQuery.data)
    const j = journalQuery.data
    setJournalDate(j.journalDate)
    setDescription(j.description ?? '')
    const hydratedLines = j.lines.map((l) => ({
      uid: nextLineUid(),
      accountCode: l.accountCode,
      debit: Number.parseInt(l.debit, 10) || 0,
      credit: Number.parseInt(l.credit, 10) || 0,
      partnerId: null,
      partnerName: l.partnerName ?? '',
      note: l.memo ?? l.note ?? '',
    }))
    const linesWithTrailingBlank = ensureTrailingBlankRow(
      hydratedLines,
      emptyLine,
      (line) => Boolean(line.accountCode.trim()),
    )
    while (linesWithTrailingBlank.length < 2) linesWithTrailingBlank.push(emptyLine())
    setLines(linesWithTrailingBlank)
    setHydratedLineUids(new Set(hydratedLines.map((l) => l.uid)))
  }

  // 편집 응답은 UUID 비공개 정책상 partnerId 없이 partnerName 만 온다.
  // 저장 시 무경고로 거래처가 빠지지 않도록 이름 정확 검색으로 내부 partnerId 를 복원한다.
  useEffect(() => {
    if (!isEdit) return
    const unresolved = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => !line.partnerId && line.partnerName.trim())
    if (unresolved.length === 0) return

    let cancelled = false
    void Promise.all(
      unresolved.map(async ({ line, index }) => {
        const name = line.partnerName.trim()
        try {
          const matches = await searchJournalPartners(name)
          const exact = matches.find(
            (partner) => partner.name.trim().toLowerCase() === name.toLowerCase(),
          )
          return exact ? { index, name, partnerId: exact.partnerId, unavailable: false } : null
        } catch (err) {
          // 검색 자체가 partner-service UNAVAILABLE(502)로 실패한 경우를 "결과 없음"과
          // 구분해 기록한다 — 안내 문구에서 "다시 선택하세요"(정오 오인) 대신 "일시 장애"를
          // 정확히 말하기 위함이다(#831 R-3 G2).
          return { index, name, partnerId: null, unavailable: isPartnerLookupUnavailableError(err) }
        }
      }),
    ).then((resolved) => {
      if (cancelled) return
      const settled = resolved.filter(
        (item): item is { index: number; name: string; partnerId: string | null; unavailable: boolean } =>
          Boolean(item),
      )
      if (settled.some((item) => item.unavailable)) {
        setPartnerLookupSuspectedUnavailable(true)
      }
      const byIndex = new Map(
        settled
          .filter((item): item is { index: number; name: string; partnerId: string; unavailable: boolean } =>
            Boolean(item.partnerId))
          .map((item) => [item.index, item]),
      )
      if (byIndex.size === 0) return
      setLines((prev) =>
        prev.map((line, index) => {
          const resolvedLine = byIndex.get(index)
          if (!resolvedLine || line.partnerId || line.partnerName.trim() !== resolvedLine.name) {
            return line
          }
          return { ...line, partnerId: resolvedLine.partnerId }
        }),
      )
    })

    return () => {
      cancelled = true
    }
  }, [isEdit, lines])

  // 라인 내용이 바뀌면(사용자 수정 또는 위 resolve 효과의 partnerId 채움) 이전 재확인 상태를
  // 무효화한다 — 바뀐 내용을 다시 평가받지 않고 stale 재확인으로 통과되지 않도록 한다.
  useEffect(() => {
    setPendingRiskyConfirm(false)
  }, [lines])

  const totals = useMemo(() => {
    // 빈행은 debit=credit=0 이므로 합계에 영향을 주지 않는다. 계정 없는 금액행은 기존
    // 검증(최소 의미행)까지 도달시켜 사용자에게 정확한 오류를 보여주는 계약을 유지한다.
    const debit = lines.reduce((sum, l) => sum + l.debit, 0)
    const credit = lines.reduce((sum, l) => sum + l.credit, 0)
    return { debit, credit, diff: debit - credit }
  }, [lines])

  const isBalanced = totals.diff === 0 && totals.debit > 0

  const updateLine = (index: number, patch: Partial<JournalLineDraft>, fromUser = false) => {
    setLines((prev) =>
      fromUser && prev[index]
        ? appendBlankRowIfLastChanged(
          prev,
          prev[index],
          { ...prev[index], ...patch },
          (line) => line.uid,
          emptyLine,
          (a, b) => a.accountCode === b.accountCode && a.debit === b.debit && a.credit === b.credit
            && a.partnerId === b.partnerId && a.partnerName === b.partnerName && a.note === b.note,
        )
        : prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    )
  }
  const removeLine = (index: number) => {
    setLines((prev) => {
      const target = prev[index]
      return target
        ? removeLinePreservingMinimum(
          prev,
          target.uid,
          (line) => line.uid,
          emptyLine,
          2,
          isJournalLineConfirmed,
        )
        : prev
    })
  }
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
    const meaningfulLines = filterMeaningfulRows(
      lines,
      (l) => Boolean(l.accountCode) && (l.debit > 0 || l.credit > 0),
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

    // #831 R-3/R-5 — 편집 hydrate 라인 중 지금도 partnerId 가 없는 라인은 원래 거래처가
    // 없었는지 조회 실패로 비어 보이는지 폼이 구분할 수 없다. 재확인 없이 조용히 저장하지
    // 않는다 — "그대로 저장" 재클릭으로만 진행한다(하드 블록이 아니라 경고 후 확인).
    const riskyLines = findRiskyPartnerLines(lines, hydratedLineUids)
    if (riskyLines.length > 0 && !pendingRiskyConfirm) {
      setTopError(buildRiskyPartnerLinesWarning(riskyLines, partnerLookupSuspectedUnavailable))
      setPendingRiskyConfirm(true)
      return
    }
    setPendingRiskyConfirm(false)

    const body: CreateJournalRequest = {
      journalDate,
      description: description.trim() || undefined,
      lines: meaningfulLines.map((l) => ({
        accountCode: l.accountCode,
        debitAmount: String(l.debit),
        creditAmount: String(l.credit),
        partnerId: l.partnerId ?? null,
        memo: l.note.trim() || undefined,
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

  if (isEdit && journalQuery.isError) {
    // #831 신규 발견 — 이전에는 이 가드가 아예 없어 편집 대상 fetch 가 실패(502/타임아웃)해도
    // hydrate effect 가 그냥 스킵되고 아래 폼이 "라인 2개짜리 빈 새 분개"로 렌더됐다. 사용자는
    // 다른 분개를 편집 중인 줄 알고 저장하면 무관한 새 분개가 생성된다 — 폼 대신 장애 안내를
    // 렌더한다.
    return (
      <PartnerLookupErrorBanner
        error={journalQuery.error}
        onRetry={() => journalQuery.refetch()}
        subject="분개"
        testId="journal-form-error"
      />
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
                onChange={(patch) => updateLine(i, patch, true)}
                onRemove={() => removeLine(i)}
              />
            ))}
          </div>
        ) : (
          <>
            <div className="journal-line-grid-scroll">
              {/* 라인 헤더 */}
              <div
                className="journal-line-grid-header"
                style={{
                  display: 'grid',
                  gridTemplateColumns: JOURNAL_LINE_GRID_TEMPLATE,
                  minWidth: 900,
                  gap: 8,
                  padding: '8px 0',
                  borderBottom: '2px solid var(--color-border)',
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                  fontWeight: 600,
                }}
              >
                <div style={{ textAlign: 'center' }}>#</div>
                <div>계정과목</div>
                <div>거래처</div>
                <div style={{ textAlign: 'right' }}>차변</div>
                <div style={{ textAlign: 'right' }}>대변</div>
                <div>메모</div>
              </div>

              {lines.map((line, i) => (
                <JournalLineRow
                  key={line.uid}
                  index={i + 1}
                  line={line}
                  accounts={accounts}
                  onChange={(patch) => updateLine(i, patch, true)}
                  onRemove={() => removeLine(i)}
                  renderPartnerField={() => (
                    <JournalPartnerPicker
                      index={i + 1}
                      line={line}
                    onChange={(patch) => updateLine(i, patch, true)}
                    />
                  )}
                />
              ))}

              <div
                className="journal-line-grid-total"
                style={{
                  marginTop: 16,
                  padding: '12px 0',
                  background: 'var(--color-bg-subtle)',
                  borderRadius: 6,
                  display: 'grid',
                  gridTemplateColumns: JOURNAL_LINE_GRID_TEMPLATE,
                  minWidth: 900,
                  gap: 8,
                  fontSize: 14,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <div />
                <div style={{ fontWeight: 600 }}>합계</div>
                <div />
                <div data-align="right" style={{ textAlign: 'right', fontWeight: 600 }}>
                  {fmt(totals.debit)}
                </div>
                <div data-align="right" style={{ textAlign: 'right', fontWeight: 600 }}>
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
            </div>
          </>
        )}

        {/* 합계 표시 */}
        {isMobile ? (
          <div
            style={{
              marginTop: 16,
              padding: '12px 16px',
              background: '#F9FAFB',
              borderRadius: 6,
              display: 'grid',
              gap: 8,
              fontSize: 14,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <div style={{ fontWeight: 700 }}>합계</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: '#6B7280' }}>차변합</span>
              <strong>{fmt(totals.debit)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: '#6B7280' }}>대변합</span>
              <strong>{fmt(totals.credit)}</strong>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                color: isBalanced ? '#059669' : '#DC2626',
                fontWeight: 700,
              }}
            >
              <span>차이</span>
              <span>
                {isBalanced ? '차/대변 일치 ✓' : `${fmt(totals.diff)} 원`}
              </span>
            </div>
          </div>
        ) : null}
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
          {createMutation.isPending ? '저장 중...' : pendingRiskyConfirm ? '그대로 저장' : '저장'}
        </Button>
      </div>
    </>
  )
}
