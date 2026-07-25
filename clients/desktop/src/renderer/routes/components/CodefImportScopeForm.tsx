import { useEffect, useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Input,
  Select,
  Spinner,
  TagChip,
} from '@samhan/design-system'
import {
  importScopedCodef,
  listCodefBankAccounts,
  listCodefCards,
  listCodefLoans,
  loadCodefImportScope,
  saveCodefImportScope,
  type CodefBankAccountItem,
  type CodefCardItem,
  type CodefImportResponse,
  type CodefImportScope,
  type CodefScopeMode,
  type CodefImportType,
  type CodefLoanItem,
  type CodefScopedImportRequest,
} from '../../api/codef'

type CodefScopeCategory = 'BANK' | 'CARD' | 'LOAN'

type SelectionState = {
  accountRefs: string[]
  cardRefs: string[]
  loanRefs: string[]
}

type Toast = { type: 'error' | 'success'; message: string }

interface CodefImportScopeFormProps {
  canCreate: boolean
  canUpdate: boolean
  initialFrom: string
  initialTo: string
  onToast: (toast: Toast) => void
  onImported: () => Promise<void>
}

const DEFAULT_CONNECTED_ID = 'connected-main'
/** 범위 미선택 안내 문구 id — 잠긴 버튼/칩에서 aria-describedby 로 사유를 연결한다(#825 슬5 R1 item4). */
const SCOPE_HINT_ID = 'codef-scope-hint-text'
const SCOPE_ALL_LOCK_HINT_ID = 'codef-scope-all-lock-hint-text'
const SCOPE_CONFLICT_CODE = 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT'

const CATEGORY_LABEL: Record<CodefScopeCategory, string> = {
  BANK: '계좌',
  CARD: '카드',
  LOAN: '대출',
}

const IMPORT_TYPE_LABEL: Record<CodefImportType, string> = {
  ALL: '전체',
  BANK: '계좌',
  CARD: '카드',
  LOAN: '대출',
}

const EMPTY_SELECTION: SelectionState = {
  accountRefs: [],
  cardRefs: [],
  loanRefs: [],
}

function refsKey(category: CodefScopeCategory): keyof SelectionState {
  switch (category) {
    case 'BANK':
      return 'accountRefs'
    case 'CARD':
      return 'cardRefs'
    case 'LOAN':
      return 'loanRefs'
  }
}

function selectedCount(selection: SelectionState): number {
  return selection.accountRefs.length + selection.cardRefs.length + selection.loanRefs.length
}

function normalizeRefs(refs: string[]): string[] {
  return Array.from(new Set(refs.map((ref) => ref.trim()).filter(Boolean)))
}

function errorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { code?: unknown; message?: unknown } | undefined
    const message = typeof data?.message === 'string' && data.message.trim()
      ? data.message.trim()
      : null
    if (data?.code === 'NOT_FOUND') {
      return message ?? '저장된 선택이 없습니다. 먼저 선택 항목을 저장하세요.'
    }
    if (data?.code === 'DEPOSIT_DATE_RANGE_INVALID') {
      return message ?? '날짜 범위를 확인하세요. 시작일은 종료일보다 이전이어야 합니다.'
    }
    if (message) return message
  }
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

function isScopeConflict(error: unknown): boolean {
  if (!isAxiosError(error) || error.response?.status !== 409) return false
  const data = error.response.data as { code?: unknown } | undefined
  return data?.code === SCOPE_CONFLICT_CODE
}

function bankLabel(item: CodefBankAccountItem): string {
  return `${item.bankName} · ${item.name} · ${item.accountNumber}`
}

function cardLabel(item: CodefCardItem): string {
  return `${item.issuerName} · ${item.name} · ${item.cardNumber}`
}

function loanLabel(item: CodefLoanItem): string {
  return `${item.lenderName} · ${item.name} · ${item.loanType}`
}

function categoryItemLabel(
  category: CodefScopeCategory,
  item: CodefBankAccountItem | CodefCardItem | CodefLoanItem,
): string {
  switch (category) {
    case 'BANK':
      return bankLabel(item as CodefBankAccountItem)
    case 'CARD':
      return cardLabel(item as CodefCardItem)
    case 'LOAN':
      return loanLabel(item as CodefLoanItem)
  }
}

export function CodefImportScopeForm({
  canCreate,
  canUpdate,
  initialFrom,
  initialTo,
  onToast,
  onImported,
}: CodefImportScopeFormProps) {
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [type, setType] = useState<CodefImportType>('ALL')
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION)
  const [scopeMode, setScopeMode] = useState<CodefScopeMode | null>(null)
  const [restoredScope, setRestoredScope] = useState<CodefImportScope | null>(null)
  const [restoredApplied, setRestoredApplied] = useState(false)
  const [selectionDirty, setSelectionDirty] = useState(false)
  const [conflictScope, setConflictScope] = useState<CodefImportScope | null>(null)
  const [result, setResult] = useState<CodefImportResponse | null>(null)
  const allScopeChipRef = useRef<HTMLSpanElement | null>(null)
  const queryClient = useQueryClient()

  const accountsQuery = useQuery({
    queryKey: ['accounting', 'codef', 'bank-accounts', DEFAULT_CONNECTED_ID],
    queryFn: () => listCodefBankAccounts(DEFAULT_CONNECTED_ID),
  })
  const cardsQuery = useQuery({
    queryKey: ['accounting', 'codef', 'cards', DEFAULT_CONNECTED_ID],
    queryFn: () => listCodefCards(DEFAULT_CONNECTED_ID),
  })
  const loansQuery = useQuery({
    queryKey: ['accounting', 'codef', 'loans', DEFAULT_CONNECTED_ID],
    queryFn: () => listCodefLoans(DEFAULT_CONNECTED_ID),
  })
  const scopeQuery = useQuery({
    queryKey: ['accounting', 'codef', 'scope', DEFAULT_CONNECTED_ID],
    queryFn: () => loadCodefImportScope(DEFAULT_CONNECTED_ID),
    retry: false,
  })

  const accounts = accountsQuery.data ?? []
  const cards = cardsQuery.data ?? []
  const loans = loansQuery.data ?? []
  const loadedScopeSelection = useMemo<SelectionState | null>(() => {
    if (!scopeQuery.data) return null
    return {
      accountRefs: normalizeRefs(scopeQuery.data.accountRefs),
      cardRefs: normalizeRefs(scopeQuery.data.cardRefs),
      loanRefs: normalizeRefs(scopeQuery.data.loanRefs),
    }
  }, [scopeQuery.data])

  useEffect(() => {
    if (!scopeQuery.data || !loadedScopeSelection || restoredApplied) return
    // #825 슬5 R1(H-4) — refs 배열의 비어있음이 아니라 scopeMode 3-상태(null=미저장·ALL·
    // SELECTED)로 복원을 분기한다. refs=[] 는 ALL 저장에서도 나타나는 정상 표현이라(D-S5-02),
    // 종전처럼 refs 비어있음만으로 '미저장'을 추정하면 ALL 로 저장한 뒤 재방문 시 '미선택'으로
    // 잘못 되돌아가는 결함이 있었다(라이브 QA d3-s2c 로 실증됨).
    const savedMode = scopeQuery.data.scopeMode
    if (savedMode === null) {
      setRestoredScope(null)
      setSelection(EMPTY_SELECTION)
      setScopeMode(null)
      setSelectionDirty(false)
      setRestoredApplied(true)
      return
    }
    setRestoredScope(scopeQuery.data)
    setScopeMode(savedMode)
    setType(scopeQuery.data.defaultImportType)
    setSelection(savedMode === 'SELECTED' ? loadedScopeSelection : EMPTY_SELECTION)
    setSelectionDirty(false)
    setRestoredApplied(true)
  }, [loadedScopeSelection, restoredApplied, scopeQuery.data])

  const categories = useMemo(() => ([
    {
      key: 'BANK' as const,
      title: CATEGORY_LABEL.BANK,
      items: accounts,
      isLoading: accountsQuery.isLoading,
      isError: accountsQuery.isError,
      testId: 'codef-bank-account',
    },
    {
      key: 'CARD' as const,
      title: CATEGORY_LABEL.CARD,
      items: cards,
      isLoading: cardsQuery.isLoading,
      isError: cardsQuery.isError,
      testId: 'codef-card',
    },
    {
      key: 'LOAN' as const,
      title: CATEGORY_LABEL.LOAN,
      items: loans,
      isLoading: loansQuery.isLoading,
      isError: loansQuery.isError,
      testId: 'codef-loan',
    },
  ]), [
    accounts,
    accountsQuery.isError,
    accountsQuery.isLoading,
    cards,
    cardsQuery.isError,
    cardsQuery.isLoading,
    loans,
    loansQuery.isError,
    loansQuery.isLoading,
  ])

  const visibleCategories = categories.filter((category) => type === 'ALL' || type === category.key)

  const itemLabelByRef = useMemo(() => {
    const map = new Map<string, { category: CodefScopeCategory; label: string }>()
    accounts.forEach((item) => map.set(item.ref, { category: 'BANK', label: item.name }))
    cards.forEach((item) => map.set(item.ref, { category: 'CARD', label: item.name }))
    loans.forEach((item) => map.set(item.ref, { category: 'LOAN', label: item.name }))
    return map
  }, [accounts, cards, loans])

  function setCategoryRefs(category: CodefScopeCategory, refs: string[]) {
    const nextSelection = {
      ...selection,
      [refsKey(category)]: normalizeRefs(refs),
    }
    setSelection(nextSelection)
    const hasSelection = selectedCount(nextSelection) > 0
    setScopeMode(hasSelection ? 'SELECTED' : null)
    setSelectionDirty(true)
  }

  function selectAllScope() {
    setSelection(EMPTY_SELECTION)
    setScopeMode('ALL')
    setSelectionDirty(true)
  }

  function clearScope() {
    setSelection(EMPTY_SELECTION)
    setScopeMode(null)
    setSelectionDirty(true)
  }

  function focusAllScopeChip() {
    setTimeout(() => {
      allScopeChipRef.current?.querySelector<HTMLElement>('[role="button"]')?.focus()
    }, 0)
  }

  function toggleRef(category: CodefScopeCategory, ref: string, checked: boolean) {
    const key = refsKey(category)
    const current = selection[key]
    const next = checked
      ? [...current, ref]
      : current.filter((item) => item !== ref)
    setCategoryRefs(category, next)
  }

  function effectiveSelection(fillEmptyVisibleWithAll: boolean): SelectionState {
    const next: SelectionState = {
      accountRefs: type === 'ALL' || type === 'BANK' ? selection.accountRefs : [],
      cardRefs: type === 'ALL' || type === 'CARD' ? selection.cardRefs : [],
      loanRefs: type === 'ALL' || type === 'LOAN' ? selection.loanRefs : [],
    }
    if (!fillEmptyVisibleWithAll) return next

    if ((type === 'ALL' || type === 'BANK') && next.accountRefs.length === 0) {
      next.accountRefs = accounts.map((item) => item.ref)
    }
    if ((type === 'ALL' || type === 'CARD') && next.cardRefs.length === 0) {
      next.cardRefs = cards.map((item) => item.ref)
    }
    if ((type === 'ALL' || type === 'LOAN') && next.loanRefs.length === 0) {
      next.loanRefs = loans.map((item) => item.ref)
    }
    return next
  }

  function buildScopePayload(): CodefImportScope {
    if (scopeMode === null) {
      // 방어적 가드 — canSave 가 이미 scopeMode!==null 을 강제하므로 정상 경로로는 도달하지
      // 않는다. 도달 시에도 '전체'로 무음 폴백하지 않고 명시적으로 거부한다(#825 슬5 R1 item10
      // — 방어 방향은 reject 여야 한다).
      throw new Error('범위를 선택하지 않아 저장할 수 없습니다. 전체 또는 개별 항목을 선택하세요.')
    }
    const refs = scopeMode === 'SELECTED' ? selection : EMPTY_SELECTION
    return {
      connectedId: DEFAULT_CONNECTED_ID,
      ...refs,
      defaultImportType: type,
      scopeMode,
      version: restoredScope?.version ?? null,
    }
  }

  function buildImportPayload(): CodefScopedImportRequest {
    if (restoredScope && !selectionDirty && restoredScope.scopeMode === 'ALL') {
      // 저장된 ALL은 defaultImportType이 실제 실행 범위다. type=ALL을 고정하면
      // CARD/BANK/LOAN 저장 직후 다른 두 카테고리까지 조용히 열거한다(#825 슬5 R2
      // BLOCKING-1). refs 필드를 생략해 BE의 진짜 전체(null) 경로로 보내되, 저장된
      // 기본 유형을 그대로 전달해 한 카테고리 범위를 보존한다.
      return {
        connectedId: DEFAULT_CONNECTED_ID,
        from,
        to,
        type: restoredScope.defaultImportType,
        scopeMode: 'ALL',
      }
    }

    if (scopeMode === 'SELECTED') {
      // #825 슬5 R1 item5(type seam) — SELECTED 는 화면에 실제로 보이는(현재 type 필터를
      // 통과한) 선택만 explicit 배열로 보낸다. type 드롭다운 전환으로 현재 보이는 카테고리의
      // 유효 선택이 0건이 되어도 refs 키를 생략하지 않는다 — 생략(undefined)하면 BE 가
      // '전체 미지정'으로 해석해 서버 전수 열거로 새어(화면=SELECTED·0개 vs 실행=전체),
      // 이 슬라이스가 없애려던 바로 그 null-semantics 모호성이 재발했다.
      //
      // #877 SONNET5 R1 — 저장 직후 재방문·미더티(restoredScope 존재)라도 예외를 두지
      // 않는다. 종전에는 이 경우 restoredScope 의 원본 세 배열을 type 필터 없이 그대로
      // 보내는 별도 분기가 있었는데(저장은 필터 밖 카테고리를 보존하므로), 그 결과 동일한
      // 화면 상태(범위=카드·계좌 미표시)에서도 "저장을 눌렀는지"에 따라 실행 범위가
      // 계좌+카드/카드만으로 갈렸다(PM 실서버 재현: 카드로 저장 직후 가져오기 시 화면에
      // 없는 계좌 거래 15건이 입출금 내역에 적재). 저장(PUT)과 실행(POST)의 책임을
      // 분리한다 — 저장은 무음 유실 방지를 위해 필터 밖 refs 를 보존하지만, 실행은
      // effectiveSelection(false)(=현재 type 이 걸러낸 selection, canImport 게이트가 이미
      // 쓰던 것과 동일한 값)만 사용해 화면에 보이지 않는 카테고리는 저장 여부와 무관하게
      // 실행에 참여하지 않는다.
      const refs = effectiveSelection(false)
      return {
        connectedId: DEFAULT_CONNECTED_ID,
        from,
        to,
        type,
        scopeMode: 'SELECTED',
        ...refs,
      }
    }

    // scopeMode === 'ALL' (미저장 상태에서 '전체' 칩만 선택한 우회 경로) — refs 를 생략해
    // 서버 목록 전체 열거(진짜 전체)로 처리한다.
    return {
      connectedId: DEFAULT_CONNECTED_ID,
      from,
      to,
      type,
      scopeMode: 'ALL',
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => saveCodefImportScope(buildScopePayload()),
    onSuccess: (saved) => {
      queryClient.setQueryData(['accounting', 'codef', 'scope', DEFAULT_CONNECTED_ID], saved)
      setConflictScope(null)
      setRestoredScope(saved)
      setSelection({
        accountRefs: normalizeRefs(saved.accountRefs),
        cardRefs: normalizeRefs(saved.cardRefs),
        loanRefs: normalizeRefs(saved.loanRefs),
      })
      setScopeMode(saved.scopeMode)
      setType(saved.defaultImportType)
      setSelectionDirty(false)
      onToast({ type: 'success', message: '가져오기 선택을 저장했습니다.' })
    },
    onError: async (error) => {
      if (isScopeConflict(error)) {
        try {
          const latest = await loadCodefImportScope(DEFAULT_CONNECTED_ID)
          const latestSelection: SelectionState = {
            accountRefs: normalizeRefs(latest.accountRefs),
            cardRefs: normalizeRefs(latest.cardRefs),
            loanRefs: normalizeRefs(latest.loanRefs),
          }
          queryClient.setQueryData(['accounting', 'codef', 'scope', DEFAULT_CONNECTED_ID], latest)
          setConflictScope(latest)
          setRestoredScope(latest.scopeMode === null ? null : latest)
          setScopeMode(latest.scopeMode)
          setType(latest.defaultImportType)
          setSelection(latest.scopeMode === 'SELECTED' ? latestSelection : EMPTY_SELECTION)
          setSelectionDirty(false)
          onToast({
            type: 'error',
            message: '다른 화면에서 가져오기 선택이 변경되었습니다. 최신 선택을 확인한 뒤 다시 저장해 주세요.',
          })
          return
        } catch (reloadError) {
          onToast({ type: 'error', message: errorMessage(reloadError, '최신 가져오기 선택을 불러오지 못했습니다.') })
          return
        }
      }
      onToast({ type: 'error', message: errorMessage(error, '가져오기 선택 저장에 실패했습니다.') })
    },
  })

  const importMutation = useMutation({
    mutationFn: () => importScopedCodef(buildImportPayload()),
    onSuccess: async (data) => {
      setResult(data)
      onToast({
        type: 'success',
        message: `${IMPORT_TYPE_LABEL[type]} 거래내역 가져오기 완료 · ${[
          `조회 ${data.fetchedCount.toLocaleString('ko-KR')}건`,
          `적재 ${data.importedCount.toLocaleString('ko-KR')}건`,
          `중복 ${data.duplicateSkippedCount.toLocaleString('ko-KR')}건`,
          `자동매칭 ${data.matchedCount.toLocaleString('ko-KR')}건`,
          ...(data.staleSkippedCount > 0 ? [`stale 보류 ${data.staleSkippedCount.toLocaleString('ko-KR')}건`] : []),
          // #810 R3: 일시장애 skip 은 stale 과 별개로 집계·표기(재시도 대상 — 미저장이라 재가져오기 시 재적재).
          ...(data.unavailableSkippedCount > 0 ? [`일시장애 보류 ${data.unavailableSkippedCount.toLocaleString('ko-KR')}건`] : []),
        ].join(' · ')}`,
      })
      await onImported()
    },
    onError: (error) => {
      onToast({ type: 'error', message: errorMessage(error, '거래내역 가져오기 중 오류가 발생했습니다.') })
    },
  })

  const datesValid = Boolean(from) && Boolean(to) && from <= to
  const listsLoading = visibleCategories.some((category) => category.isLoading)
  const restoredSelectionInvalid = Boolean(
    scopeMode === 'SELECTED' && selectedCount(effectiveSelection(false)) === 0,
  )
  const savedAllScopeDirty = Boolean(
    restoredScope?.scopeMode === 'ALL' && selectionDirty,
  )
  const scopeHint = !canUpdate
    ? '범위 변경 권한이 없어 저장 범위를 바꿀 수 없습니다. 권한 보유자에게 요청하세요.'
    : savedAllScopeDirty
      ? '저장된 전체 범위의 유형을 바꾸려면 먼저 저장하세요.'
    : scopeMode === null
      ? "전체로 처리하려면 '전체' 칩을 선택하세요."
      : null
  const allScopeLocksItems = scopeMode === 'ALL'
  const importSelectionReady = scopeMode !== 'SELECTED' || selectedCount(effectiveSelection(false)) > 0
  const canSave = canUpdate
    && scopeMode !== null
    && !restoredSelectionInvalid
    && !listsLoading
    && !saveMutation.isPending
  const canImport = canCreate
    && scopeMode !== null
    && importSelectionReady
    && !restoredSelectionInvalid
    && datesValid
    && !savedAllScopeDirty
    && !importMutation.isPending
  // #825 슬5 R1(H-4) — refs 배열 비어있음이 아니라 scopeMode===null(한 번도 저장한 적 없음)로
  // 판정한다. ALL 로 저장된 scope 도 refs 는 설계상 비어 있으므로(D-S5-02), ref 기준 판정은
  // 정상 저장된 ALL 을 '미저장'으로 오판해 이 힌트를 잘못 노출시킨다.
  const scopeMissing = Boolean(scopeQuery.data && scopeQuery.data.scopeMode === null)
    || (
      scopeQuery.isError
      && isAxiosError(scopeQuery.error)
      && (scopeQuery.error.response?.data as { code?: unknown } | undefined)?.code === 'NOT_FOUND'
    )
  const conflictSelectionLabels = conflictScope
    ? [
        ...conflictScope.accountRefs,
        ...conflictScope.cardRefs,
        ...conflictScope.loanRefs,
      ]
        .map((ref) => itemLabelByRef.get(ref)?.label)
        .filter((label): label is string => Boolean(label))
    : []

  return (
    <div className="codef-import-panel">
      <div>
        <h4 className="codef-import-title">거래내역 가져오기</h4>
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-neutral-500)' }}>
          선택한 계좌·카드·대출 거래를 가져와 입출금 내역에 적재합니다.
        </div>
      </div>

      <div className="codef-import-grid">
        <label className="codef-import-field">
          시작일
          <Input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            data-testid="codef-import-from"
          />
        </label>
        <label className="codef-import-field">
          종료일
          <Input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            data-testid="codef-import-to"
          />
        </label>
        <label className="codef-import-field">
          범위
          <Select
            value={type}
            disabled={!canUpdate}
            onChange={(event) => {
              setType(event.target.value as CodefImportType)
              setSelectionDirty(true)
            }}
            data-testid="codef-import-type"
          >
            <option value="ALL">전체</option>
            <option value="BANK">계좌</option>
            <option value="CARD">카드</option>
            <option value="LOAN">대출</option>
          </Select>
        </label>
        <div className="codef-import-actions">
          <Button
            type="button"
            variant="ghost"
            disabled={!canSave}
            onClick={() => saveMutation.mutate()}
            data-testid="codef-save-scope-button"
            aria-describedby={scopeHint ? SCOPE_HINT_ID : undefined}
          >
            {saveMutation.isPending ? '저장 중' : '저장'}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!canImport}
            onClick={() => importMutation.mutate()}
            data-testid="codef-import-button"
            aria-describedby={scopeHint ? SCOPE_HINT_ID : undefined}
          >
            {importMutation.isPending ? '가져오는 중' : '가져오기'}
          </Button>
        </div>
      </div>

      {!datesValid ? (
        <div role="alert" className="codef-import-hint codef-import-hint--error">
          날짜 범위를 확인하세요. 시작일은 종료일보다 이전이어야 합니다.
        </div>
      ) : null}

      {scopeMissing ? (
        <div className="codef-import-hint">
          저장된 선택이 없습니다. 필요한 항목을 선택한 뒤 저장하세요.
        </div>
      ) : null}
      {conflictScope ? (
        <div role="alert" className="codef-import-hint codef-import-hint--error" data-testid="codef-scope-conflict">
          다른 화면에서 가져오기 선택이 변경되었습니다. 서버 최신 선택을 확인했습니다.
          {conflictScope.scopeMode === 'ALL'
            ? ' 최신 범위: 전체.'
            : conflictSelectionLabels.length > 0
              ? ` 최신 선택: ${conflictSelectionLabels.join(', ')}.`
              : ' 최신 선택 항목이 없습니다.'}
          내 의도를 다시 선택한 뒤 저장하세요.
        </div>
      ) : null}
      {restoredScope && !selectionDirty ? (
        restoredSelectionInvalid ? (
          <div className="codef-import-hint codef-import-hint--error" role="alert" data-testid="codef-restored-scope-invalid">
            기존 저장 범위에 선택된 항목이 없습니다. 계좌·카드·대출 중 하나를 다시 선택하거나 '전체' 칩을 선택한 뒤 저장하세요.
          </div>
        ) : (
          <div className="codef-import-hint">
            저장된 선택을 복원했습니다. 그대로 가져오거나 항목을 바꿔 다시 저장할 수 있습니다.
          </div>
        )
      ) : null}
      {restoredSelectionInvalid && (!restoredScope || selectionDirty) ? (
        <div className="codef-import-hint codef-import-hint--error" role="alert" data-testid="codef-restored-scope-invalid">
          현재 범위에 선택된 항목이 없습니다. 해당 범위의 항목을 선택하거나 '전체' 칩을 선택한 뒤 저장하세요.
        </div>
      ) : null}

      <div className="codef-scope-grid" data-testid="codef-scope-list">
        {visibleCategories.map((category) => {
          const key = refsKey(category.key)
          const selectedRefs = selection[key]
          const allRefs = category.items.map((item) => item.ref)
          const allChecked = allRefs.length > 0 && allRefs.every((ref) => selectedRefs.includes(ref))
          return (
            <section key={category.key} className="codef-scope-list" data-testid={`codef-${category.key.toLowerCase()}-scope`}>
              <div className="codef-scope-list__header">
                <strong>{category.title}</strong>
                {category.isLoading ? <Spinner size="sm" /> : null}
              </div>
              <label className="codef-checkbox-row">
                <input
                  type="checkbox"
                  checked={allChecked}
                  disabled={!canUpdate || scopeMode === 'ALL' || category.items.length === 0}
                  aria-describedby={scopeMode === 'ALL' ? SCOPE_ALL_LOCK_HINT_ID : undefined}
                  onChange={(event) => setCategoryRefs(category.key, event.target.checked ? allRefs : [])}
                  data-testid={`${category.testId}-select-all`}
                />
                <span>{category.title} 전체 선택</span>
              </label>
              <div className="codef-checkbox-list">
                {category.isError ? (
                  <div role="alert" className="codef-import-hint codef-import-hint--error">
                    {category.title} 목록을 불러오지 못했습니다.
                  </div>
                ) : null}
                {!category.isLoading && !category.isError && category.items.length === 0 ? (
                  <div className="codef-import-hint">표시할 {category.title} 항목이 없습니다.</div>
                ) : null}
                {category.items.map((item, index) => (
                  <label key={item.ref} className="codef-checkbox-row">
                    <input
                      type="checkbox"
                      checked={selectedRefs.includes(item.ref)}
                      disabled={!canUpdate || scopeMode === 'ALL'}
                      aria-describedby={scopeMode === 'ALL' ? SCOPE_ALL_LOCK_HINT_ID : undefined}
                      onChange={(event) => toggleRef(category.key, item.ref, event.target.checked)}
                      data-testid={`${category.testId}-${index}`}
                    />
                    <span>{categoryItemLabel(category.key, item)}</span>
                  </label>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <div className="codef-selected-chips" aria-label="선택 항목">
        <TagChip
          label="범위"
          value="전체"
          removeLabel="전체 범위"
          ref={allScopeChipRef}
          onClick={canUpdate ? selectAllScope : undefined}
          onRemove={canUpdate && scopeMode === 'ALL' ? () => { clearScope(); focusAllScopeChip() } : undefined}
          data-testid="codef-all-scope-chip"
          className={!canUpdate ? 'codef-scope-chip--disabled' : undefined}
          role={canUpdate ? 'button' : undefined}
          tabIndex={canUpdate ? 0 : undefined}
          aria-pressed={canUpdate ? scopeMode === 'ALL' : undefined}
          aria-describedby={canUpdate && scopeMode === null ? SCOPE_HINT_ID : undefined}
        />
        {scopeMode === null ? (
          // #825 슬5 R1 item12 — 상시 표시되는 수동적 안내는 role="alert"(긴급/동적 공지 전용)가
          // 아닌 role="status"(비강제적 polite live region)가 맞다. 세 화면 동일 시맨틱로 통일.
          <span className="codef-import-hint" data-testid="codef-scope-hint" id={SCOPE_HINT_ID} role="status">
            {scopeHint}
          </span>
        ) : scopeMode === 'SELECTED' ? (
          ([
            ...selection.accountRefs.map((ref) => ({ ref, category: 'BANK' as const })),
            ...selection.cardRefs.map((ref) => ({ ref, category: 'CARD' as const })),
            ...selection.loanRefs.map((ref) => ({ ref, category: 'LOAN' as const })),
          ] as Array<{ ref: string; category: CodefScopeCategory }>)
            .filter((item) => type === 'ALL' || type === item.category)
            .map((item) => {
              const labelInfo = itemLabelByRef.get(item.ref)
              if (!labelInfo && !listsLoading) return null
              const label = labelInfo?.label ?? '로딩 중'
              return (
                <TagChip
                  key={`${item.category}-${item.ref}`}
                  label={CATEGORY_LABEL[item.category]}
                  value={label}
                  removeLabel={label}
                  onRemove={canUpdate ? () => { toggleRef(item.category, item.ref, false); focusAllScopeChip() } : undefined}
                  data-testid="codef-selected-chip"
                />
              )
            })
        ) : null}
      </div>

      {allScopeLocksItems ? (
        <div className="codef-import-hint" id={SCOPE_ALL_LOCK_HINT_ID} role="status">
          전체 범위가 선택되어 개별 항목 선택은 비활성화됩니다.
        </div>
      ) : null}

      {result ? <CodefImportResultSummary result={result} /> : null}
    </div>
  )
}

/**
 * 가져오기 결과 요약 + 보류 경고 — 두 보류 상태를 구분해 표시한다(#810 적대검증 R3 계약 pin).
 *
 * <p>stale(거래처 삭제/비활성 — 영구, 매핑 재선택 필요)은 role="alert" 경고,
 * unavailable(거래처 조회 일시 장애 — 저장 없이 skip, 재시도 대상)은 role="status" 안내로
 * 문구·시맨틱을 분리한다. unavailable 행은 미저장이라 잠시 후 다시 가져오면 재적재·재매칭된다.
 */
export function CodefImportResultSummary({ result }: { result: CodefImportResponse }) {
  return (
    <>
      <div data-testid="codef-import-result" role="status" className="codef-import-result">
        조회 {result.fetchedCount.toLocaleString('ko-KR')}건 · 적재 {result.importedCount.toLocaleString('ko-KR')}건 · 중복 {result.duplicateSkippedCount.toLocaleString('ko-KR')}건 · 자동매칭 {result.matchedCount.toLocaleString('ko-KR')}건
      </div>
      {result.staleSkippedCount > 0 ? (
        <div role="alert" className="warning-banner" data-testid="codef-stale-warning">
          거래처 조회가 확인되지 않아 {result.staleSkippedCount.toLocaleString('ko-KR')}건을 보류했습니다.
          {result.staleNormalizedNames.length > 0 ? ` 대상: ${result.staleNormalizedNames.join(', ')}` : ''}
        </div>
      ) : null}
      {result.unavailableSkippedCount > 0 ? (
        <div role="status" className="warning-banner" data-testid="codef-unavailable-warning">
          거래처 조회 일시 장애로 {result.unavailableSkippedCount.toLocaleString('ko-KR')}건 매칭 보류 — 잠시 후 다시
          가져오기 하세요.
          {result.unavailableNames.length > 0 ? ` 대상: ${result.unavailableNames.join(', ')}` : ''}
        </div>
      ) : null}
    </>
  )
}
