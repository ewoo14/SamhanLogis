import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery } from '@tanstack/react-query'
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

function isEmptySelection(selection: SelectionState): boolean {
  return selectedCount(selection) === 0
}

function isEmptyScope(scope: CodefImportScope): boolean {
  return scope.accountRefs.length === 0
    && scope.cardRefs.length === 0
    && scope.loanRefs.length === 0
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
  const [restoredScope, setRestoredScope] = useState<CodefImportScope | null>(null)
  const [restoredApplied, setRestoredApplied] = useState(false)
  const [selectionDirty, setSelectionDirty] = useState(false)
  const [result, setResult] = useState<CodefImportResponse | null>(null)

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
    if (isEmptySelection(loadedScopeSelection)) {
      setRestoredScope(null)
      setSelection(EMPTY_SELECTION)
      setSelectionDirty(false)
      setRestoredApplied(true)
      return
    }
    setRestoredScope(scopeQuery.data)
    setType(scopeQuery.data.defaultImportType)
    setSelection(loadedScopeSelection)
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
    setSelection((prev) => ({
      ...prev,
      [refsKey(category)]: normalizeRefs(refs),
    }))
    setSelectionDirty(true)
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
    return {
      connectedId: DEFAULT_CONNECTED_ID,
      ...effectiveSelection(true),
      defaultImportType: type,
    }
  }

  function buildImportPayload(): CodefScopedImportRequest {
    if (restoredScope && !selectionDirty) {
      return {
        connectedId: DEFAULT_CONNECTED_ID,
        from,
        to,
        type: 'ALL',
        accountRefs: [],
        cardRefs: [],
        loanRefs: [],
      }
    }

    const refs = effectiveSelection(false)
    if (selectedCount(refs) === 0) {
      return {
        connectedId: DEFAULT_CONNECTED_ID,
        from,
        to,
        type,
      }
    }
    return {
      connectedId: DEFAULT_CONNECTED_ID,
      from,
      to,
      type,
      ...refs,
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => saveCodefImportScope(buildScopePayload()),
    onSuccess: (saved) => {
      setRestoredScope(saved)
      setSelection({
        accountRefs: normalizeRefs(saved.accountRefs),
        cardRefs: normalizeRefs(saved.cardRefs),
        loanRefs: normalizeRefs(saved.loanRefs),
      })
      setType(saved.defaultImportType)
      setSelectionDirty(false)
      onToast({ type: 'success', message: '가져오기 선택을 저장했습니다.' })
    },
    onError: (error) => {
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
  const canSave = canUpdate && !listsLoading && !saveMutation.isPending
  const canImport = canCreate && datesValid && !importMutation.isPending
  const scopeMissing = Boolean(scopeQuery.data && isEmptyScope(scopeQuery.data))
    || (
      scopeQuery.isError
      && isAxiosError(scopeQuery.error)
      && (scopeQuery.error.response?.data as { code?: unknown } | undefined)?.code === 'NOT_FOUND'
    )

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
          >
            {saveMutation.isPending ? '저장 중' : '저장'}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!canImport}
            onClick={() => importMutation.mutate()}
            data-testid="codef-import-button"
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
      {restoredScope && !selectionDirty ? (
        <div className="codef-import-hint">
          저장된 선택을 복원했습니다. 그대로 가져오거나 항목을 바꿔 다시 저장할 수 있습니다.
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
                  disabled={category.items.length === 0}
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
        {selectedCount(effectiveSelection(false)) === 0 ? (
          <span className="codef-import-hint">선택 항목이 없으면 현재 범위 전체를 가져옵니다.</span>
        ) : (
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
                  onRemove={() => toggleRef(item.category, item.ref, false)}
                  data-testid="codef-selected-chip"
                />
              )
            })
        )}
      </div>

      {result ? (
        <div data-testid="codef-import-result" role="status" className="codef-import-result">
          조회 {result.fetchedCount.toLocaleString('ko-KR')}건 · 적재 {result.importedCount.toLocaleString('ko-KR')}건 · 중복 {result.duplicateSkippedCount.toLocaleString('ko-KR')}건 · 자동매칭 {result.matchedCount.toLocaleString('ko-KR')}건
        </div>
      ) : null}
    </div>
  )
}
