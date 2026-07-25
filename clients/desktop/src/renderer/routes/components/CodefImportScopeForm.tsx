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
type ConflictInfo = { latest: CodefImportScope | null; baselineConfirmed: boolean }

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
/** 재수렴 R4 N1/N3 — 이번 mount 에서 baseline 확인이 아직 끝나지 않은 동안(확인 중·확인
 * 실패) 저장·가져오기 버튼에 사유를 연결하는 힌트 id. scopeMode===null 여부와 무관하게
 * 항상 렌더되므로 SCOPE_HINT_ID(칩 영역 전용)와 별도로 둔다. */
const SCOPE_UNCONFIRMED_HINT_ID = 'codef-scope-unconfirmed-hint-text'
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
    // F5 — 서버가 한국어 메시지를 주지 않은 axios 오류(네트워크 단절 등)를 아래
    // `error instanceof Error` 폴백으로 흘려보내면 axios 원문(주로 영문, 예: "Network
    // Error")이 그대로 노출된다(한국어 의무 위반). AxiosError 는 이 분기 밖으로 절대
    // 내보내지 않고 항상 한국어(매칭 코드 메시지 · data.message · fallback) 로 마감한다.
    return message ?? fallback
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

type ItemLabelMap = Map<string, { category: CodefScopeCategory; label: string }>

/**
 * 409 충돌 배너/토스트의 "서버 최신 상태" 문구를 만든다.
 *
 * <p>F2 — 라벨 해석 실패를 조용히 감추고 "선택 항목이 없습니다"로 오보하던 결함의 단일
 * root fix. refs 가 실제로 0건일 때만 "없습니다"라고 말한다. refs 는 있으나 이 화면의
 * 캐시(계좌/카드/대출 목록)에서 라벨을 못 찾으면(상대가 방금 등록한 신규 계좌, 또는 목록
 * 조회 자체가 실패한 상태 등) "확인하지 못했다"고 사실대로 말한다 — 이 오보를 믿고 사용자가
 * "서버엔 아무것도 없다"며 저장하면 전체교체 PUT 때문에 상대 선택이 그대로 사라진다(이 PR 이
 * 없애려는 무음 유실의 재발).
 */
function describeConflictSelection(
  latest: CodefImportScope,
  itemLabelByRef: ItemLabelMap,
): string {
  if (latest.scopeMode === 'ALL') return ' 서버에는 현재 전체 범위가 저장되어 있습니다.'
  const refs = [...latest.accountRefs, ...latest.cardRefs, ...latest.loanRefs]
  if (refs.length === 0) return ' 서버에는 현재 저장된 선택 항목이 없습니다.'
  const resolved: string[] = []
  let unresolved = 0
  refs.forEach((ref) => {
    const info = itemLabelByRef.get(ref)
    if (info) resolved.push(info.label)
    else unresolved += 1
  })
  if (resolved.length === 0) {
    return ` 서버에 선택 ${refs.length}건이 저장되어 있으나 이 화면의 목록에서 이름을 확인하지 못했습니다.`
  }
  if (unresolved > 0) {
    return ` 서버에 저장된 선택: ${resolved.join(', ')} 외 ${unresolved}건(이름 확인 불가).`
  }
  return ` 서버에 저장된 선택: ${resolved.join(', ')}.`
}

/** GET 이 "저장된 범위 없음"을 의미하는 NOT_FOUND 코드로 응답했는지 판정한다 — 이 경우는
 * 확인 실패가 아니라 확인된 부재이므로 아래 scopeBaselineUnconfirmed 잠금 대상이 아니다. */
function isScopeNotFoundError(error: unknown): boolean {
  if (!isAxiosError(error)) return false
  const data = error.response?.data as { code?: unknown } | undefined
  return data?.code === 'NOT_FOUND'
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
  // F1 root fix — 낙관적 잠금 버전 커서를 restoredScope(마지막 "성공 저장/최초 로드" 스냅샷 —
  // 화면 표시·buildImportPayload branch-A·savedAllScopeDirty 판단에 쓰인다)와 분리한다. 409
  // 충돌 시 서버의 최신 버전 번호만 여기로 반영해 다음 저장 시도가 같은 버전으로 재충돌하지
  // 않게 하되, 사용자가 화면에서 보고 있는 selection/scopeMode/type 은 절대 건드리지 않는다.
  const [baseVersion, setBaseVersion] = useState<number | null>(null)
  // 409 충돌 안내용 스냅샷 — 화면 작업 상태(selection/scopeMode/type)를 대체하지 않는
  // 순수 정보성 상태다. baselineConfirmed 는 F4 판정에 쓰인다(아래 onError 참조).
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null)
  // N-3 root fix(재수렴 R4) — 충돌 배너의 latest=null(재조회 실패) 상태에서 "다시 확인" 중임을
  // 추적한다. 이 액션은 saveMutation 과 분리된 GET 전용 시도라 별도 pending 플래그가 필요하다.
  const [isReconfirmingConflict, setIsReconfirmingConflict] = useState(false)
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
    // 전역 QueryClient 는 5분 캐시를 사용하지만, 이 값은 낙관적 잠금의 저장 기준이다.
    // 화면에 다시 들어올 때 캐시의 과거 version 을 저장 기준으로 재사용하지 않는다.
    staleTime: 0,
    refetchOnMount: 'always',
  })
  // N-1/N-2 root fix(재수렴 R4) — react-query 는 error 액션에서도 data 를 지우지 않는다
  // (query-core query.js:375-389, error 리듀서가 이전 성공 data 를 그대로 spread 한다).
  // 그래서 isFetchedAfterMount(구 게이트, dataUpdateCount OR errorUpdateCount)는 "재진입
  // 재조회가 실패"해도 true 가 되어 낡은 캐시를 "확인됨"으로 오인시킨다. 이 ref 는 mount
  // 시점의 dataUpdatedAt 을 1회만 캡처해(useRef 초기값은 첫 렌더에만 반영) 이후 그보다
  // 큰(=이번 mount 에서 진짜로 성공한) 값이 도착했는지만으로 확인 여부를 판정한다 —
  // isFetching/isSuccess 타이밍 가정에 기대지 않는 결정적 신호다.
  const mountScopeDataUpdatedAtRef = useRef(scopeQuery.dataUpdatedAt)
  const scopeConfirmedThisMount = scopeQuery.dataUpdatedAt > mountScopeDataUpdatedAtRef.current
  // N1/N3 root fix — 이번 mount 에서 아직 성공적으로 확인되지 않았는데(!restoredApplied)
  // (a) 여전히 확인 중이거나 (b) 확인 시도가 오류로 끝났고 그 오류가 남긴 낡은 데이터가
  // 있으면(=화면에 무언가를 보여줄 수 있어 오인될 여지가 있으면) "확인 불명" 상태로 본다.
  // NOT_FOUND(확인된 부재)는 제외한다 — 그것은 실패가 아니라 정상적인 "미저장 확인"이다.
  const scopeBaselineUnconfirmed = Boolean(
    !restoredApplied
    && (scopeQuery.isFetching
      || (scopeQuery.isError && scopeQuery.data && !isScopeNotFoundError(scopeQuery.error))),
  )

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
    // N-1 root fix(재수렴 R4, 유지) — 게이트를 isFetchedAfterMount(성공/오류 어느 쪽으로
    // "정착"해도 true)가 아니라 scopeConfirmedThisMount(이번 mount 에서 "성공"한 GET만
    // true)로 바꾼다. 재진입 재조회가 실패하면 이 effect 는 아예 실행되지 않고,
    // scopeBaselineUnconfirmed(위)가 저장·가져오기를 잠근 채 화면에 "확인 실패" 안내(아래
    // JSX)를 낸다 — 낡은 캐시(react-query 는 error 액션에서도 data 를 지우지 않는다)를
    // "복원 완료"로 오인해 보여주지 않는다.
    if (!scopeQuery.data || !loadedScopeSelection || restoredApplied || !scopeConfirmedThisMount) return
    // #825 슬5 R1(H-4) — refs 배열의 비어있음이 아니라 scopeMode 3-상태(null=미저장·ALL·
    // SELECTED)로 복원을 분기한다. refs=[] 는 ALL 저장에서도 나타나는 정상 표현이라(D-S5-02),
    // 종전처럼 refs 비어있음만으로 '미저장'을 추정하면 ALL 로 저장한 뒤 재방문 시 '미선택'으로
    // 잘못 되돌아가는 결함이 있었다(라이브 QA d3-s2c 로 실증됨).
    const savedMode = scopeQuery.data.scopeMode
    setBaseVersion(scopeQuery.data.version)
    setRestoredApplied(true)
    // 🔒 개발책임자 바운드 결정(2026-07-25, PR #925 — "UX 기제 2개 되돌리고 머지") — 여기
    // 있던 `if (selectionDirty) { setRestoredScope(...); return }` 조기 반환 분기(05b8c9e5a
    // N2 root fix)를 되돌린다. 확인이 늦게 도착하는 창에서 사용자가 이미 조작
    // (selectionDirty=true)했더라도, 확인이 "성공"하면 그 결과(서버의 진짜 최신
    // selection/scopeMode/type)를 화면에 그대로 반영한다 — 종전엔 서버 선택을 화면에 숨긴
    // 채 baseVersion 만 앞당겨서, 뒤이은 저장이 409 없이 성공하며 서버가 실제로 가진 선택을
    // 조용히 지웠다(A-1, rA-closing a1 실측: PUT version=9 200 OK 로 국민 계좌 소거 +
    // defaultImportType BANK→ALL 동반 유실). 대가로 확인 창에서의 미저장 클릭은 확인 성공
    // 시 서버 값으로 대체될 수 있다(가시적·비파괴 UX 불편) — 그러나 그 창에서는
    // scopeBaselineUnconfirmed 가 저장·가져오기를 이미 잠그고 있어(N-1/N-3 은 유지) 이
    // 대체가 잘못된 저장으로 이어지지 않는다. 이 되돌림을 다시 "고치려 하지 말 것".
    if (savedMode === null) {
      setRestoredScope(null)
      setSelection(EMPTY_SELECTION)
      setScopeMode(null)
      setSelectionDirty(false)
      return
    }
    setRestoredScope(scopeQuery.data)
    setScopeMode(savedMode)
    setType(scopeQuery.data.defaultImportType)
    setSelection(savedMode === 'SELECTED' ? loadedScopeSelection : EMPTY_SELECTION)
    setSelectionDirty(false)
  }, [loadedScopeSelection, restoredApplied, scopeQuery.data, scopeConfirmedThisMount])

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

  const itemLabelByRef = useMemo<ItemLabelMap>(() => {
    const map: ItemLabelMap = new Map()
    // F2(부수) — 배너/칩 라벨을 체크박스 행과 같은 전체 표기(은행명 · 별칭 · 계좌번호)로
    // 통일한다. 종전 item.name 단독 표기는 동일 별칭의 서로 다른 계좌를 구분하지 못했다.
    accounts.forEach((item) => map.set(item.ref, { category: 'BANK', label: categoryItemLabel('BANK', item) }))
    cards.forEach((item) => map.set(item.ref, { category: 'CARD', label: categoryItemLabel('CARD', item) }))
    loans.forEach((item) => map.set(item.ref, { category: 'LOAN', label: categoryItemLabel('LOAN', item) }))
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
      version: baseVersion,
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
      setConflictInfo(null)
      setBaseVersion(saved.version)
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
        // F1 — 거부는 사용자의 미저장 선택을 지우는 사유가 아니다. selection/scopeMode/type/
        // selectionDirty 는 여기서 절대 건드리지 않는다. PM 결정 재확인: 금지된 것은 "자동
        // 합집합 병합"(사용자가 해제한 남의 항목이 되살아나는 것)이지, "사용자가 방금 고른
        // 것의 보존"이 아니다 — conflictInfo 는 화면 작업 상태를 대체하지 않는 별도의
        // 안내용 스냅샷일 뿐이다(K1).
        //
        // F4 — baselineConfirmed 는 이번 저장 시도 이전에 서버의 진짜 최신을 성공적으로 한
        // 번이라도 확인했는지(restoredApplied)를 기록한다. 확인한 적이 없다면(예: 최초
        // scope 조회가 실패한 채 저장을 시도) "다른 화면에서 변경되었다"는 사실이 아니다 —
        // 애초 비교 기준 자체가 없었을 뿐이다(K3).
        const baselineConfirmed = restoredApplied
        const headline = baselineConfirmed
          ? '다른 화면에서 가져오기 선택이 변경되었습니다. 저장이 거부되었습니다.'
          : '저장 전 서버의 기존 선택을 확인하지 못했습니다. 이미 저장된 선택이 있어 저장이 거부되었습니다.'
        // F1 회귀 방지 — baselineConfirmed 가 false 였던 경우(F4), 아래 setQueryData 가
        // scopeQuery.data 를 최초로 채운다. 복원 useEffect 의 가드는 `restoredApplied` 하나뿐이라,
        // 그 값을 여기서 앞당겨 true 로 만들지 않으면 setQueryData 직후 재렌더에서 그 effect가
        // "최초 복원"으로 오인해 재실행되어 selection/scopeMode/type 을 서버 값으로 덮어써버린다
        // (RED 로 실측: F4 테스트에서 bank-account-0 체크가 저장 시도 후 풀리는 회귀를 발견).
        // baselineConfirmed 는 이미 위에서 그 이전 값을 스냅샷했으므로 안전하게 앞당겨 true로
        // 고정할 수 있다 — 이 저장 시도부터는 "최초 복원 대기" 단계가 끝난 것이 맞다.
        setRestoredApplied(true)
        try {
          const latest = await loadCodefImportScope(DEFAULT_CONNECTED_ID)
          queryClient.setQueryData(['accounting', 'codef', 'scope', DEFAULT_CONNECTED_ID], latest)
          // 버전 커서만 최신화한다 — F1 에 따라 selection/scopeMode/type 은 그대로 둔다.
          setBaseVersion(latest.version)
          setConflictInfo({ latest, baselineConfirmed })
          onToast({
            type: 'error',
            message: `${headline}${describeConflictSelection(latest, itemLabelByRef)} 방금 선택한 항목은 화면에 그대로 남아 있습니다.`,
          })
          return
        } catch (reloadError) {
          // F5 — 재조회가 실패해도 "저장이 거부됐다"는 사실은 반드시 먼저 전달한다(K4).
          // errorMessage 가 이제 axios 원문(영문)을 새지 않으므로 원인 상세를 이어 붙여도
          // 한국어 의무를 어기지 않는다. 이전 충돌의 서버 스냅샷은 최신이라고 말할 수 없으므로
          // latest=null 로 교체한다(L1).
          setConflictInfo({ latest: null, baselineConfirmed })
          onToast({
            type: 'error',
            message: `${headline} 최신 선택 확인에 실패했습니다 — ${errorMessage(reloadError, '원인을 알 수 없습니다.')} 방금 선택한 항목은 화면에 그대로 남아 있습니다.`,
          })
          return
        }
      }
      onToast({ type: 'error', message: errorMessage(error, '가져오기 선택 저장에 실패했습니다.') })
    },
  })

  /**
   * N-3 root fix(재수렴 R4) — conflictInfo.latest===null(충돌 후 재조회까지 실패) 상태의
   * 유일한 저장 수단이었던 "현재 화면 선택으로 다시 저장" 버튼은 baseVersion 을 절대
   * 갱신하지 않고 그대로 saveMutation.mutate() 만 재호출했다. baseVersion 은 이미 서버보다
   * 낡은 값으로 확정된 상태였으므로(그래서 애초 409 를 받았다) 그 값으로 재PUT 하면 항상
   * 다시 409 다 — 몇 번을 눌러도 성공할 수 없는, 성공 가능성 없는 버튼이었다(N5 위반의
   * 직접 원인). 이 함수는 그 버튼을 대체한다: PUT 을 맹목적으로 반복하지 않고 먼저 GET 으로
   * 진짜 최신을 다시 확인한다 — 성공하면 baseVersion/conflictInfo 가 갱신되어 화면은 latest
   * 가 채워진 정상 배너(기존 "현재 화면 선택으로 덮어쓰기" 버튼)로 전환되고, 사용자는 그
   * 버튼으로 명시적으로 저장을 이어간다(K5). 실패하면 latest=null 상태에 머물되, 이번
   * 시도가 "진짜 재확인 시도"였다는 점에서 예전의 맹목적 재PUT 과 다르다 — 근본 원인(일시
   * 장애 등)이 풀리면 다음 재시도는 성공할 수 있다.
   */
  async function reconfirmConflictLatest() {
    setIsReconfirmingConflict(true)
    try {
      const latest = await loadCodefImportScope(DEFAULT_CONNECTED_ID)
      queryClient.setQueryData(['accounting', 'codef', 'scope', DEFAULT_CONNECTED_ID], latest)
      setBaseVersion(latest.version)
      setConflictInfo({ latest, baselineConfirmed: true })
    } catch (reloadError) {
      setConflictInfo({ latest: null, baselineConfirmed: true })
      onToast({
        type: 'error',
        message: `최신 선택 확인에 다시 실패했습니다 — ${errorMessage(reloadError, '원인을 알 수 없습니다.')} 방금 선택한 항목은 화면에 그대로 남아 있습니다.`,
      })
    } finally {
      setIsReconfirmingConflict(false)
    }
  }

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
    : scopeBaselineUnconfirmed
      // N1/N6 root fix(재수렴 R4) — 확인 미완료 창에서는 "미선택" 힌트를 내지 않는다(사실이
      // 아니다). 실제 문구는 아래 codef-scope-unconfirmed/-confirming 블록이 scopeMode 값과
      // 무관하게 늘 렌더되며 담당한다 — 여기서는 칩 영역의 옛 힌트만 비운다.
      ? null
    : savedAllScopeDirty
      ? '저장된 전체 범위의 유형을 바꾸려면 먼저 저장하세요.'
    : scopeMode === null
      ? "전체로 처리하려면 '전체' 칩을 선택하세요."
      : null
  const allScopeLocksItems = scopeMode === 'ALL'
  const importSelectionReady = scopeMode !== 'SELECTED' || selectedCount(effectiveSelection(false)) > 0
  const canSaveWithoutConflict = canUpdate
    && scopeMode !== null
    && !restoredSelectionInvalid
    && !listsLoading
    && !scopeQuery.isFetching
    && !scopeBaselineUnconfirmed
    && !saveMutation.isPending
  // 🔒 개발책임자 바운드 결정(2026-07-25, PR #925 — "UX 기제 2개 되돌리고 머지") — N7
  // (scopeCoversLatest/conflictLatestCovered, 05b8c9e5a)을 되돌린다. scopeMode='ALL' 화면을
  // 무조건 "포괄"로 판정하고 defaultImportType(실제 실행 범위)을 비교하지 않아, 배너가
  // "삭제되지 않습니다"라고 단언하는 바로 그 저장이 서버의 refs 를 비우거나(A-2, rA-closing
  // a2: PUT accountRefs=[] 인데 배너는 "삭제되지 않습니다") 서버가 좁혀둔 defaultImportType
  // 을 무음 확대(B-1/A-3: CARD 로 좁혀진 서버 값이 ALL 로 덮임)하는 PUT을 냈다. 충돌 후
  // 일반 저장은 포괄 여부와 무관하게 항상 잠그고, 명시적 덮어쓰기 버튼(K5)으로만 진행한다 —
  // "포괄" 예외를 다시 만들지 말 것(클릭 1회 추가는 감수한 대가다).
  const canSave = canSaveWithoutConflict && !conflictInfo
  const canImport = canCreate
    && scopeMode !== null
    && importSelectionReady
    && !restoredSelectionInvalid
    && datesValid
    && !savedAllScopeDirty
    // N-1/N3 root fix(재수렴 R4) — canSaveWithoutConflict 에만 있던 !scopeQuery.isFetching
    // 류 가드가 canImport 에는 없어, 재진입 확인이 아직 끝나지 않은 창에서도 가져오기
    // 버튼이 활성일 수 있었다(브리프 N-1 의 직접 원인). scopeBaselineUnconfirmed 는 그
    // 창(fetching 또는 미확인 오류) 전체를 포괄해 가져오기까지 함께 잠근다.
    && !scopeBaselineUnconfirmed
    && !importMutation.isPending
  // #825 슬5 R1(H-4) — refs 배열 비어있음이 아니라 scopeMode===null(한 번도 저장한 적 없음)로
  // 판정한다. ALL 로 저장된 scope 도 refs 는 설계상 비어 있으므로(D-S5-02), ref 기준 판정은
  // 정상 저장된 ALL 을 '미저장'으로 오판해 이 힌트를 잘못 노출시킨다.
  // N1 root fix(재수렴 R4) — scopeBaselineUnconfirmed 인 동안은 이 힌트를 내지 않는다.
  // 캐시에 남은 scopeMode===null(과거 확인된 부재)이 이번 mount 의 미확인 상태와 겹치면
  // "확인 중"/"확인 실패" 안내와 "저장된 선택이 없습니다"가 동시에 뜨는 모순을 막는다.
  const scopeMissing = !scopeBaselineUnconfirmed && (
    Boolean(scopeQuery.data && scopeQuery.data.scopeMode === null)
    || (scopeQuery.isError && isScopeNotFoundError(scopeQuery.error))
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
            aria-describedby={
              scopeBaselineUnconfirmed ? SCOPE_UNCONFIRMED_HINT_ID : scopeHint ? SCOPE_HINT_ID : undefined
            }
          >
            {saveMutation.isPending ? '저장 중' : '저장'}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!canImport}
            onClick={() => importMutation.mutate()}
            data-testid="codef-import-button"
            aria-describedby={
              scopeBaselineUnconfirmed ? SCOPE_UNCONFIRMED_HINT_ID : scopeHint ? SCOPE_HINT_ID : undefined
            }
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

      {/* N1/N3/N6 root fix(재수렴 R4) — 이번 mount 에서 baseline 확인이 아직 안 끝난 동안은
          scopeMode 값과 무관하게(체크박스를 사용자가 이미 조작했더라도) 이 블록이 항상
          렌더된다. "확인 중"(role=status, 진행 중이라 비강제)과 "확인 실패"(role=alert,
          저장·가져오기를 잠근 이유를 설명 + 재확인 수단 제공)를 구분한다 — 브리프 N-1 의
          "완전히 로드된 미저장 화면처럼 보인다" 결함과 N-2 의 "확인 실패가 안 보인다"
          결함의 공통 root fix. */}
      {scopeBaselineUnconfirmed ? (
        scopeQuery.isFetching ? (
          <div className="codef-import-hint" role="status" id={SCOPE_UNCONFIRMED_HINT_ID} data-testid="codef-scope-confirming">
            저장된 선택을 확인하는 중입니다. 확인이 끝날 때까지 저장·가져오기를 사용할 수 없습니다.
          </div>
        ) : (
          <div
            className="codef-import-hint codef-import-hint--error"
            role="alert"
            id={SCOPE_UNCONFIRMED_HINT_ID}
            data-testid="codef-scope-unconfirmed"
          >
            최신 저장 상태를 확인하지 못했습니다. 이전에 확인된 값과 다를 수 있어 저장·가져오기를
            잠급니다.
            <Button
              type="button"
              variant="ghost"
              onClick={() => { void scopeQuery.refetch() }}
              data-testid="codef-scope-reconfirm-button"
            >
              다시 확인
            </Button>
          </div>
        )
      ) : null}
      {scopeMissing ? (
        <div className="codef-import-hint">
          저장된 선택이 없습니다. 필요한 항목을 선택한 뒤 저장하세요.
        </div>
      ) : null}
      {conflictInfo ? (
        <div role="alert" className="codef-import-hint codef-import-hint--error" data-testid="codef-scope-conflict">
          {conflictInfo.baselineConfirmed
            ? '다른 화면에서 가져오기 선택이 변경되었습니다. 저장이 거부되었습니다.'
            : '저장 전 서버의 기존 선택을 확인하지 못했습니다. 이미 저장된 선택이 있어 저장이 거부되었습니다.'}
          {conflictInfo.latest ? (
            <>
              {describeConflictSelection(conflictInfo.latest, itemLabelByRef)}
              {/* 🔒 개발책임자 바운드 결정(2026-07-25, PR #925) — "포괄하면 삭제되지
                  않습니다" 분기(N7, 05b8c9e5a)를 되돌린다. scopeMode='ALL' 화면을 무조건
                  포괄로 판정해 실제로는 서버 refs 를 비우거나 defaultImportType 을 무음
                  확대하는 저장을 "안전하다"고 잘못 안심시켰다(A-2/B-1, rA-closing a2·a3).
                  포괄 여부와 무관하게 항상 같은 경고를 낸다. */}
              {' 현재 화면에 없는 서버 선택 항목은 저장하면 지워질 수 있습니다. 이 결과를 확인한 뒤 명시적으로 진행하세요.'}
            </>
          ) : (
            ' 최신 선택을 확인하지 못했습니다. 서버에 있는 항목을 모른 채 저장하면 삭제될 수 있으므로 먼저 최신 상태를 다시 확인하세요.'
          )}
          {' 방금 선택한 항목은 화면에 그대로 남아 있습니다.'}
          {conflictInfo.latest ? (
            // K5 — latest 를 알고 있는 충돌에서는 명시적 우회 버튼만 다시 저장할 수 있다
            // (일반 저장은 canSave 에서 계속 잠긴다 — conflictInfo 가 있는 한 포괄 여부와
            // 무관하게 잠금, 위 바운드 결정 참조).
            <Button
              type="button"
              variant="ghost"
              disabled={!canSaveWithoutConflict}
              onClick={() => saveMutation.mutate()}
              data-testid="codef-scope-overwrite-button"
            >
              {saveMutation.isPending ? '다시 저장 중' : '현재 화면 선택으로 덮어쓰기'}
            </Button>
          ) : (
            // N-3/N5 root fix(재수렴 R4) — latest=null 일 때는 "다시 저장"(낡은 버전으로
            // 맹목적 재PUT, 구조적으로 항상 409)이 아니라 "다시 확인"(GET 재시도)을 제시한다.
            // 성공하면 위 conflictInfo.latest 분기로 전환되어 그 때의 명시 저장 버튼을 쓴다.
            <Button
              type="button"
              variant="ghost"
              disabled={isReconfirmingConflict}
              onClick={() => { void reconfirmConflictLatest() }}
              data-testid="codef-scope-conflict-reconfirm-button"
            >
              {isReconfirmingConflict ? '확인 중' : '최신 상태 다시 확인'}
            </Button>
          )}
        </div>
      ) : null}
      {restoredScope && !selectionDirty && !conflictInfo ? (
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
          aria-describedby={canUpdate && scopeMode === null && !scopeBaselineUnconfirmed ? SCOPE_HINT_ID : undefined}
        />
        {scopeMode === null && !scopeBaselineUnconfirmed ? (
          // #825 슬5 R1 item12 — 상시 표시되는 수동적 안내는 role="alert"(긴급/동적 공지 전용)가
          // 아닌 role="status"(비강제적 polite live region)가 맞다. 세 화면 동일 시맨틱로 통일.
          // N1 root fix(재수렴 R4) — scopeBaselineUnconfirmed 인 동안은 이 스팬 자체를
          // 렌더하지 않는다(scopeHint 도 이 상태에선 null 이지만, 빈 스팬이 남으면
          // "codef-scope-hint" 요소 자체는 여전히 존재해 "미선택" 시맨틱을 일부 유지하게
          // 된다 — 위 전용 블록이 유일한 안내여야 한다).
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
          {/* F6 — 잠금 힌트가 잠금 사실만 말하고 해제 방법을 말하지 않던 결함. 위 '범위: 전체'
              칩의 ✕(제거) 버튼이 유일한 탈출구인데 그 방법이 어디에도 없었다(K5). */}
          전체 범위가 선택되어 개별 항목 선택은 비활성화됩니다. 개별 항목을 다시 고르려면 위
          '범위: 전체' 칩의 ✕(전체 범위 제거) 버튼을 눌러 전체 선택을 해제하세요.
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
