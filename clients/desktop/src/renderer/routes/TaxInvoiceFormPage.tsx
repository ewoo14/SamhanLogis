/**
 * 세금계산서 작성/편집 화면 — `/accounting/tax-invoices/new` + `/:id/edit` (P0-4 #2).
 *
 * <p>UX:
 * <ul>
 *   <li>거래처 선택 — 정준 {@code partnerApi.searchPartners} 자동완성 (#825 재수렴 CM-a,
 *       (ii)통일과 동일 소스). 실 {@code partnerCode} + {@code bizNo} 분리 보유 — 선택 즉시
 *       사업자번호/명 snapshot 자동 입력, 저장 payload 에 실 partnerCode 전송.</li>
 *   <li>라인 입력 — 품명 / 규격 / 수량 / 단가 (부가세 자동 계산 = 공급가액 × 10%).</li>
 *   <li>합계 — 공급가액 / 부가세 / 총합 자동 계산 (모든 라인 합).</li>
 *   <li>저장 — DRAFT 로 생성 / 갱신 후 상세로 이동.</li>
 *   <li>발행 — DRAFT → ISSUED + 자동 분개 알림 (110/255/400) → 상세로 이동.</li>
 * </ul>
 *
 * <p>매뉴얼 출처: {@code docs/manual/03-회계/03-세금계산서.md}.
 * UUID 비공개 가드 — partnerId 는 state 에만, 화면 표시는 partnerName + businessNo.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, PartnerAutocomplete, Spinner, type PartnerOption } from '@samhan/design-system'
import {
  createTaxInvoice,
  getTaxInvoice,
  issueTaxInvoice,
  updateTaxInvoice,
  type CreateTaxInvoiceLineRequest,
  type CreateTaxInvoiceRequest,
} from '../api/taxInvoiceApi'
import { extractApiErrorMessage as extractErrorMessage } from '../api/apiError'
import { taxInvoiceAuditApi } from '../api/createAuditApi'
import { TaxInvoiceRealtimeClient } from '../realtime/AccountingRealtimeClient'
import { AuditRevisionBadge } from '../components/audit/AuditOverlaySection'
import { AuditVersionHistory } from '../components/audit/AuditVersionHistory'
import { searchPartners } from '../api/partnerApi'
import { useIsMobile } from '../hooks/useIsMobile'
import { usePageTitle } from '../hooks/usePageTitle'
import { vatFromSupply } from '../utils/vatRounding'

export function resolveTaxInvoicePartnerId(
  selectedPartnerId: string | undefined,
  partnerIdSnapshot: string,
  hasNewSelection: boolean,
): string | null {
  if (hasNewSelection) return selectedPartnerId ?? null
  return partnerIdSnapshot || null
}

/**
 * 저장 payload 의 실 partnerCode 결정 — {@link resolveTaxInvoicePartnerId} 와 대칭 시맨틱
 * (#825 재수렴 CM-a).
 *
 * <p>새 선택이 있으면 선택 옵션의 실 partnerCode 만 사용한다 (빈 값이면 null — 이전
 * snapshot 코드로의 silent fallback 은 partnerId≠partnerCode 오염이라 금지). 새 선택이
 * 없으면 edit hydrate 시 BE 가 보존한 partnerCode snapshot 을 유지한다.
 */
export function resolveTaxInvoicePartnerCode(
  selectedPartnerCode: string | undefined,
  partnerCodeSnapshot: string,
  hasNewSelection: boolean,
): string | null {
  if (hasNewSelection) {
    const trimmed = selectedPartnerCode?.trim() ?? ''
    return trimmed || null
  }
  return partnerCodeSnapshot || null
}

/** 클라이언트 라인 임시 ID — React key 안정성. */
let __lineUidCounter = 0
const nextLineUid = (): string => `tax-line-${++__lineUidCounter}`

interface DraftLine {
  uid: string
  itemName: string
  spec: string
  quantity: string
  unitPrice: string
  memo: string
}

const emptyLine = (): DraftLine => ({
  uid: nextLineUid(),
  itemName: '',
  spec: '',
  quantity: '1',
  unitPrice: '0',
  memo: '',
})

/** YYYY-MM-DD 오늘 (한국 클라이언트 local). */
const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 정수 → 천단위 콤마 표시. */
const fmt = (n: number): string =>
  Math.trunc(n).toLocaleString('ko-KR')

/** 라인 1건의 공급가액 계산 — 정수 KRW 가정 (소수점 입력 시 floor). */
const calcLineSupply = (qty: string, unitPrice: string): number => {
  const q = Number.parseFloat(qty || '0')
  const p = Number.parseFloat(unitPrice || '0')
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0
  return Math.trunc(q * p)
}

function TaxInvoiceMobileLineCard(props: {
  line: DraftLine
  index: number
  isReadOnly: boolean
  supply: number
  vat: number
  onUpdate: (patch: Partial<DraftLine>) => void
  onRemove: () => void
}) {
  const lineNumber = props.index + 1
  return (
    <div className="mobile-line-card" data-testid={`tax-invoice-form-line-${props.index}`}>
      <div className="mobile-line-card-header">
        <span className="mobile-line-card-index">{lineNumber}</span>
        <button
          type="button"
          className="mobile-line-remove-button"
          onClick={props.onRemove}
          disabled={props.isReadOnly}
          aria-label={`라인 ${lineNumber} 삭제`}
        >
          삭제
        </button>
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">품명</label>
        <input
          type="text"
          className="mobile-line-text-input"
          value={props.line.itemName}
          onChange={(e) => props.onUpdate({ itemName: e.target.value })}
          aria-label={`라인 ${lineNumber} 품명`}
          placeholder="품명"
          disabled={props.isReadOnly}
          data-testid={`tax-invoice-form-line-${props.index}-item-name`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">규격</label>
        <input
          type="text"
          className="mobile-line-text-input"
          value={props.line.spec}
          onChange={(e) => props.onUpdate({ spec: e.target.value })}
          aria-label={`라인 ${lineNumber} 규격`}
          placeholder="규격"
          disabled={props.isReadOnly}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">수량</label>
        <input
          type="text"
          inputMode="decimal"
          className="mobile-line-text-input mobile-line-number-input"
          value={props.line.quantity}
          onChange={(e) => props.onUpdate({ quantity: e.target.value })}
          aria-label={`라인 ${lineNumber} 수량`}
          disabled={props.isReadOnly}
          data-testid={`tax-invoice-form-line-${props.index}-qty`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">단가</label>
        <input
          type="text"
          inputMode="decimal"
          className="mobile-line-text-input mobile-line-number-input"
          value={props.line.unitPrice}
          onChange={(e) => props.onUpdate({ unitPrice: e.target.value })}
          aria-label={`라인 ${lineNumber} 단가`}
          disabled={props.isReadOnly}
          data-testid={`tax-invoice-form-line-${props.index}-unit-price`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">공급가액</label>
        <div className="mobile-line-readonly mobile-line-readonly--strong">
          {fmt(props.supply)}
        </div>
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">부가세</label>
        <div className="mobile-line-readonly">{fmt(props.vat)}</div>
      </div>
    </div>
  )
}

export function TaxInvoiceFormPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams<{ id?: string }>()
  const editId = params['id']
  const isEdit = Boolean(editId)
  const isMobile = useIsMobile()

  usePageTitle(isEdit ? '세금계산서 편집' : '세금계산서 작성')

  // 편집 모드: 기존 세금계산서 fetch 후 폼에 채움
  const detailQuery = useQuery({
    queryKey: ['accounting', 'tax-invoice', editId],
    queryFn: () => getTaxInvoice(editId!),
    enabled: isEdit,
  })

  // PR-H4c: edit 모드 audit log 백필
  const auditQuery = useQuery({
    queryKey: ['accounting', 'tax-invoice', editId, 'audit-logs'],
    queryFn: () => taxInvoiceAuditApi.listAuditLogs(editId!).catch(() => []),
    enabled: isEdit && !!editId,
  })

  // PR-H4c: edit 모드 SSE 구독
  useEffect(() => {
    if (!isEdit || !editId) return
    const ctrl = TaxInvoiceRealtimeClient.subscribe(editId, (evt) => {
      void queryClient.invalidateQueries({ queryKey: ['accounting', 'tax-invoice', editId] })
      if (evt.event === 'accounting:edit' || evt.event === 'message') {
        void queryClient.invalidateQueries({
          queryKey: ['accounting', 'tax-invoice', editId, 'audit-logs'],
        })
      }
    })
    return () => ctrl.abort()
  }, [isEdit, editId, queryClient])

  const revertMutation = useMutation({
    mutationFn: (revisionNo: number) =>
      taxInvoiceAuditApi.revertToRevision(editId!, revisionNo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounting', 'tax-invoice', editId] })
      void queryClient.invalidateQueries({
        queryKey: ['accounting', 'tax-invoice', editId, 'audit-logs'],
      })
    },
    onError: () => alert('복원에 실패했습니다.'),
  })

  // 헤더 state — 선택 거래처는 정준 검색 소스의 PartnerOption 그대로 보유
  // (실 partnerCode / bizNo / id(UUID) 분리 — #825 재수렴 CM-a).
  const [partner, setPartner] = useState<PartnerOption | null>(null)
  /** Snapshot — partner 선택 시 채워짐. partner null 이라도 detail edit 시 채워질 수 있음. */
  const [partnerName, setPartnerName] = useState<string>('')
  const [partnerBusinessNo, setPartnerBusinessNo] = useState<string>('')
  const [partnerAddress, setPartnerAddress] = useState<string>('')
  /** edit 모드에서 BE 가 보존한 partnerId — search snapshot 없어도 mutation 시 사용. */
  const [partnerIdSnapshot, setPartnerIdSnapshot] = useState<string>('')
  /** edit 모드에서 BE 가 보존한 실 partnerCode — 재선택 없으면 payload 에 유지 전송. */
  const [partnerCodeSnapshot, setPartnerCodeSnapshot] = useState<string>('')
  const [supplyDate, setSupplyDate] = useState<string>(today())
  const [description, setDescription] = useState<string>('')
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()])
  const [topError, setTopError] = useState<string>('')
  const [auditHistoryOpen, setAuditHistoryOpen] = useState(false)

  // #831-hydrate — detailQuery.data 하이드레이션을 useEffect 대신 렌더 중 파생으로 처리한다
  // (같은 계열, CashReceiptFormPage #831-hydrate 수단 1과 동일). useEffect 로 하면
  // "isLoading→false 렌더"(partner 관련 state 는 아직 공란 초기값)와 "실제 세금계산서 값으로
  // 채워지는 렌더"(effect 실행 후) 사이에 실제로 커밋되는 프레임이 존재한다. 이 파일의
  // 저장/임시저장 버튼은 isPending 으로만 disabled 되므로(하이드레이션 관련 게이트 없음) 그
  // 프레임에서 저장을 누르면 buildBody() 가 초기값(partnerIdSnapshot='', partnerName='' 등)
  // 기준으로 "선택한 거래처의 식별자를 확인할 수 없습니다" 같은 엉뚱한 오류를 기존(실제로는
  // 거래처가 있는) 세금계산서에 대해 낸다. 렌더 중 setState 를 호출하면 React 는 이 프레임을
  // 커밋하지 않고 새 state 로 즉시 재렌더하므로(공식 패턴: "Adjusting state when a prop
  // changes") 이 창 자체가 사라진다.
  //
  // 기존 useEffect 는 가드가 없어(ref 도 없음) detailQuery.data 참조가 바뀔 때마다 매번
  // 재하이드레이트했다 — [#825 R1 M1] 이 명시적으로 의도한 시맨틱(SSE coedit·revert
  // invalidate·refetch 시 미저장 새 선택 partner 를 포함해 로컬 편집 전부를 리셋)이므로
  // identical 하게 보존한다. "직전에 하이드레이트한 데이터 참조"를 state 로 추적해 매번
  // 참조가 바뀔 때만 재실행되도록 한다(CashReceiptFormPage 의 hydratedFromReceipt 와 동일
  // 패턴).
  const [hydratedFromDetail, setHydratedFromDetail] = useState<typeof detailQuery.data>(undefined)
  if (isEdit && detailQuery.data && detailQuery.data !== hydratedFromDetail) {
    setHydratedFromDetail(detailQuery.data)
    const t = detailQuery.data
    // [#825 R1 M1] hydrate 재실행(SSE coedit·revert invalidate·refetch) 시 미저장 새 선택
    // partner 도 함께 리셋해 소스 정합을 강제한다. 리셋 없이는 partnerIdSnapshot/partnerName 만
    // 원본으로 복원되고 partner(새 선택 P2)가 잔존 → buildBody 가 P2 UUID + 원본 partnerName 을
    // 전송하는 조용한 오염(partnerId≠partnerName)이 발생한다. 외부 refetch 는 이미 이름/주소/
    // 라인 등 미저장 수기 입력을 폐기하므로(기존 hydrate 시맨틱), partner 선택도 동일하게
    // 폐기하고 재선택을 유도하는 것이 세금계산서 무결성 우선의 안전 선택이다.
    setPartner(null)
    setPartnerIdSnapshot(t.partnerId)
    setPartnerCodeSnapshot(t.partnerCode ?? '')
    setPartnerName(t.partnerName)
    setPartnerBusinessNo(t.partnerBusinessNo ?? '')
    setPartnerAddress(t.partnerAddress ?? '')
    setSupplyDate(t.supplyDate)
    setDescription(t.description ?? '')
    setLines(
      t.lines.length > 0
        ? t.lines.map((l) => ({
            uid: nextLineUid(),
            itemName: l.itemName,
            // BE response field 명: specification (P0-4 rename, legacy 'spec' alias 호환)
            spec: l.specification ?? '',
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            memo: l.memo ?? '',
          }))
        : [emptyLine()],
    )
  }

  const totals = useMemo(() => {
    const supply = lines.reduce(
      (sum, l) => sum + calcLineSupply(l.quantity, l.unitPrice),
      0,
    )
    const vat = vatFromSupply(supply)
    return { supply, vat, total: supply + vat }
  }, [lines])

  // 거래처 검색 — 정준 partnerApi.searchPartners (#825 재수렴 CM-a, (ii)통일 5화면과
  // 동일 소스). 응답이 실 partnerCode + bizNo 분리 PartnerOption 이라 어댑터 불요 —
  // 구 sales.ts 어댑터의 partnerCode=bizNo 오라벨(L6)이 함께 해소된다.
  const searchPartnerOptions = (q: string): Promise<PartnerOption[]> =>
    searchPartners(q, { activeOnly: true })

  const handlePartnerOptionChange = (option: PartnerOption | null) => {
    if (!option) {
      setPartner(null)
      return
    }
    // 새 선택 — edit snapshot(id/code)은 폐기하고 선택 옵션 값으로 정합 유지.
    setPartnerIdSnapshot('')
    setPartnerCodeSnapshot('')
    setPartner(option)
    setPartnerName(option.name)
    // bizNo 미제공 시 빈 값 유지 — partnerCode 를 사업자번호로 대체 기입하지 않는다 (L6).
    setPartnerBusinessNo(option.bizNo ?? '')
    // 검색 응답은 주소 미제공 — 기존 시맨틱대로 재선택 시 초기화 (수기 입력 유도).
    setPartnerAddress('')
  }

  const updateLine = (index: number, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    )
  }
  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (index: number) => {
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length === 0 ? [emptyLine()] : next
    })
  }

  // mutation
  const createMutation = useMutation({
    mutationFn: (body: CreateTaxInvoiceRequest) => createTaxInvoice(body),
    onSuccess: (created) => {
      queryClient.invalidateQueries({
        queryKey: ['accounting', 'tax-invoices'],
      })
      navigate(`/accounting/tax-invoices/${created.id}`, { replace: true })
    },
    onError: (err: unknown) => setTopError(`저장 실패: ${extractErrorMessage(err)}`),
  })

  const updateMutation = useMutation({
    mutationFn: (body: CreateTaxInvoiceRequest) =>
      updateTaxInvoice(editId!, body),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: ['accounting', 'tax-invoices'],
      })
      queryClient.invalidateQueries({
        queryKey: ['accounting', 'tax-invoice', updated.id],
      })
      navigate(`/accounting/tax-invoices/${updated.id}`, { replace: true })
    },
    onError: (err: unknown) => setTopError(`수정 실패: ${extractErrorMessage(err)}`),
  })

  const issueMutation = useMutation({
    mutationFn: (id: string) => issueTaxInvoice(id),
    onSuccess: (issued) => {
      queryClient.invalidateQueries({
        queryKey: ['accounting', 'tax-invoices'],
      })
      queryClient.invalidateQueries({
        queryKey: ['accounting', 'tax-invoice', issued.id],
      })
      alert(
        `발행 완료: ${issued.taxInvoiceNo}\n\n자동 분개가 생성되었습니다 (110 외상매출금 / 255 부가세예수금 / 400 매출).`,
      )
      navigate(`/accounting/tax-invoices/${issued.id}`, { replace: true })
    },
    onError: (err: unknown) => setTopError(`발행 실패: ${extractErrorMessage(err)}`),
  })

  const buildBody = (): CreateTaxInvoiceRequest | null => {
    setTopError('')
    const partnerId = resolveTaxInvoicePartnerId(
      partner?.id,
      partnerIdSnapshot,
      Boolean(partner),
    )
    // [#825 재수렴 CM-a] 실 partnerCode — 새 선택은 옵션의 실 코드, edit 재선택 없음은
    // BE 보존 snapshot. bizNo 를 코드로 전송하지 않는다.
    const partnerCode = resolveTaxInvoicePartnerCode(
      partner?.partnerCode,
      partnerCodeSnapshot,
      Boolean(partner),
    )
    if (!partnerId) {
      setTopError(
        '선택한 거래처의 식별자를 확인할 수 없습니다. 거래처를 다시 검색해 선택하세요.',
      )
      return null
    }
    if (!partnerName.trim()) {
      setTopError('거래처명이 비어있습니다.')
      return null
    }
    if (!supplyDate) {
      setTopError('공급일자를 입력하세요.')
      return null
    }
    const meaningfulLines = lines.filter(
      (l) =>
        l.itemName.trim() && Number.parseFloat(l.quantity || '0') > 0,
    )
    if (meaningfulLines.length === 0) {
      setTopError('라인 1개 이상 (품명 + 수량 > 0) 을 입력하세요.')
      return null
    }
    const apiLines: CreateTaxInvoiceLineRequest[] = meaningfulLines.map((l) => ({
      itemName: l.itemName.trim(),
      spec: l.spec.trim() || undefined,
      quantity: l.quantity || '0',
      unitPrice: l.unitPrice || '0',
      memo: l.memo.trim() || undefined,
    }))
    return {
      partnerId,
      partnerCode: partnerCode ?? undefined,
      partnerBusinessNo: partnerBusinessNo.trim() || undefined,
      partnerName: partnerName.trim(),
      partnerAddress: partnerAddress.trim() || undefined,
      supplyDate,
      description: description.trim() || undefined,
      lines: apiLines,
    }
  }

  const handleSave = () => {
    const body = buildBody()
    if (!body) return
    if (isEdit) {
      updateMutation.mutate(body)
    } else {
      createMutation.mutate(body)
    }
  }

  const handleIssue = async () => {
    if (!isEdit || !editId) {
      setTopError('먼저 저장 후 발행할 수 있습니다.')
      return
    }
    if (!confirm('이 세금계산서를 발행하시겠습니까?\n발행 시 자동 분개가 생성되고 더 이상 수정할 수 없습니다.')) {
      return
    }
    // 라인이 변경되었다면 먼저 update 후 issue 호출
    const body = buildBody()
    if (!body) return
    try {
      await updateTaxInvoice(editId, body)
      issueMutation.mutate(editId)
    } catch (err: unknown) {
      setTopError(
        `발행 전 저장 실패: ${extractErrorMessage(err)}`,
      )
    }
  }

  if (isEdit && detailQuery.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="세금계산서 불러오는 중" />
      </div>
    )
  }

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    issueMutation.isPending

  // edit 모드 + 이미 ISSUED/CANCELLED 면 read-only
  const isReadOnly =
    isEdit && detailQuery.data && detailQuery.data.status !== 'DRAFT'

  return (
    <>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>
            {isEdit ? '세금계산서 편집' : '세금계산서 작성'}
          </h3>
          <p style={{ marginTop: 4, fontSize: 13, color: '#6B7280' }}>
            거래처를 선택하면 사업자번호/주소가 자동 입력됩니다. 부가세는
            공급가액의 10% 로 자동 계산됩니다.
          </p>
        </div>
        {/* PR-H4c: 편집 모드 — 수정 횟수 + 복원 dropdown */}
        {isEdit ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <AuditRevisionBadge
              logs={Array.isArray(auditQuery.data) ? auditQuery.data : []}
              isError={auditQuery.isError}
              reverting={revertMutation.isPending}
              onRevert={(rev) => revertMutation.mutate(rev)}
              testIdPrefix="tax-invoice-form"
            />
            <AuditVersionHistory
              logs={Array.isArray(auditQuery.data) ? auditQuery.data : []}
              isLoading={auditQuery.isLoading}
              isError={auditQuery.isError}
              open={auditHistoryOpen}
              onOpenChange={setAuditHistoryOpen}
              testIdPrefix="tax-invoice-form"
            />
          </div>
        ) : null}
      </div>

      {isReadOnly ? (
        <div
          className="error-banner"
          role="alert"
          style={{ marginBottom: 16, padding: 12 }}
        >
          이 세금계산서는 이미 발행 또는 취소되어 수정할 수 없습니다.
        </div>
      ) : null}

      <Card>
        {/* 거래처 선택 */}
        <div style={{ marginBottom: 16 }}>
          <PartnerAutocomplete
            label="거래처 검색"
            placeholder="거래처명 또는 코드, 사업자번호"
            value={partner}
            onChange={handlePartnerOptionChange}
            searchPartners={searchPartnerOptions}
            disabled={Boolean(isReadOnly)}
          />
        </div>

        {/* 거래처 snapshot 표시 */}
        <div
          className="mobile-form-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <Input
            label="거래처명"
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            disabled={Boolean(isReadOnly)}
            required
            data-testid="tax-invoice-form-partner-name"
          />
          <Input
            label="사업자번호"
            value={partnerBusinessNo}
            onChange={(e) => setPartnerBusinessNo(e.target.value)}
            disabled={Boolean(isReadOnly)}
            data-testid="tax-invoice-form-partner-business-no"
          />
          <Input
            label="공급일자"
            type="date"
            value={supplyDate}
            onChange={(e) => setSupplyDate(e.target.value)}
            disabled={Boolean(isReadOnly)}
            required
            data-testid="tax-invoice-form-supply-date"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Input
            label="주소"
            value={partnerAddress}
            onChange={(e) => setPartnerAddress(e.target.value)}
            disabled={Boolean(isReadOnly)}
            data-testid="tax-invoice-form-partner-address"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Input
            label="비고"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={Boolean(isReadOnly)}
            data-testid="tax-invoice-form-description"
          />
        </div>

        {!isMobile ? (
          /* 라인 헤더 */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 2fr 1fr 100px 140px 140px 140px 36px',
              gap: 8,
              padding: '8px 0',
              borderBottom: '2px solid #E5E7EB',
              fontSize: 12,
              color: '#6B7280',
              fontWeight: 600,
            }}
          >
            <div style={{ textAlign: 'center' }}>#</div>
            <div>품명</div>
            <div>규격</div>
            <div style={{ textAlign: 'right' }}>수량</div>
            <div style={{ textAlign: 'right' }}>단가</div>
            <div style={{ textAlign: 'right' }}>공급가액</div>
            <div style={{ textAlign: 'right' }}>부가세</div>
            <div />
          </div>
        ) : null}

        <div className={isMobile ? 'mobile-line-card-list' : undefined}>
        {lines.map((line, i) => {
          const supply = calcLineSupply(line.quantity, line.unitPrice)
          const vat = vatFromSupply(supply)
          if (isMobile) {
            return (
              <TaxInvoiceMobileLineCard
                key={line.uid}
                line={line}
                index={i}
                isReadOnly={Boolean(isReadOnly)}
                supply={supply}
                vat={vat}
                onUpdate={(patch) => updateLine(i, patch)}
                onRemove={() => removeLine(i)}
              />
            )
          }
          return (
            <div
              key={line.uid}
              style={{
                display: 'grid',
                gridTemplateColumns:
                  '36px 2fr 1fr 100px 140px 140px 140px 36px',
                gap: 8,
                padding: '6px 0',
                alignItems: 'center',
                borderBottom: '1px solid #F3F4F6',
              }}
              data-testid={`tax-invoice-form-line-${i}`}
            >
              <div style={{ textAlign: 'center', color: '#6B7280' }}>
                {i + 1}
              </div>
              <input
                type="text"
                value={line.itemName}
                onChange={(e) => updateLine(i, { itemName: e.target.value })}
                placeholder="품명"
                disabled={Boolean(isReadOnly)}
                style={{
                  height: 32,
                  padding: '0 8px',
                  border: '1px solid #D1D5DB',
                  borderRadius: 4,
                  fontSize: 13,
                }}
                data-testid={`tax-invoice-form-line-${i}-item-name`}
              />
              <input
                type="text"
                value={line.spec}
                onChange={(e) => updateLine(i, { spec: e.target.value })}
                placeholder="규격"
                disabled={Boolean(isReadOnly)}
                style={{
                  height: 32,
                  padding: '0 8px',
                  border: '1px solid #D1D5DB',
                  borderRadius: 4,
                  fontSize: 13,
                }}
              />
              <input
                type="text"
                inputMode="decimal"
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: e.target.value })}
                disabled={Boolean(isReadOnly)}
                style={{
                  height: 32,
                  padding: '0 8px',
                  border: '1px solid #D1D5DB',
                  borderRadius: 4,
                  fontSize: 13,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
                data-testid={`tax-invoice-form-line-${i}-qty`}
              />
              <input
                type="text"
                inputMode="decimal"
                value={line.unitPrice}
                onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                disabled={Boolean(isReadOnly)}
                style={{
                  height: 32,
                  padding: '0 8px',
                  border: '1px solid #D1D5DB',
                  borderRadius: 4,
                  fontSize: 13,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
                data-testid={`tax-invoice-form-line-${i}-unit-price`}
              />
              <div
                style={{
                  textAlign: 'right',
                  fontSize: 13,
                  color: '#374151',
                  fontVariantNumeric: 'tabular-nums',
                  background: '#F9FAFB',
                  padding: '8px',
                  borderRadius: 4,
                }}
              >
                {fmt(supply)}
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontSize: 13,
                  color: '#6B7280',
                  fontVariantNumeric: 'tabular-nums',
                  background: '#F9FAFB',
                  padding: '8px',
                  borderRadius: 4,
                }}
              >
                {fmt(vat)}
              </div>
              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={Boolean(isReadOnly)}
                aria-label={`라인 ${i + 1} 삭제`}
                style={{
                  height: 32,
                  width: 32,
                  border: '1px solid #D1D5DB',
                  borderRadius: 4,
                  background: '#fff',
                  color: '#DC2626',
                  cursor: isReadOnly ? 'not-allowed' : 'pointer',
                }}
              >
                ×
              </button>
            </div>
          )
        })}
        </div>

        {!isReadOnly ? (
          <div style={{ marginTop: 12 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={addLine}
              data-testid="tax-invoice-form-add-line"
            >
              + 라인 추가
            </Button>
          </div>
        ) : null}

        {/* 합계 */}
        <div
          className="mobile-form-grid"
          style={{
            marginTop: 16,
            padding: '12px 16px',
            background: '#F9FAFB',
            borderRadius: 6,
            display: 'grid',
            gridTemplateColumns: '1fr 140px 140px 140px',
            gap: 16,
            fontSize: 14,
            fontVariantNumeric: 'tabular-nums',
            alignItems: 'center',
          }}
          data-testid="tax-invoice-form-totals"
        >
          <div style={{ fontWeight: 600 }}>합계</div>
          <div style={{ textAlign: 'right' }}>
            공급가액 <strong>{fmt(totals.supply)}</strong>
          </div>
          <div style={{ textAlign: 'right' }}>
            부가세 <strong>{fmt(totals.vat)}</strong>
          </div>
          <div style={{ textAlign: 'right', fontSize: 16 }}>
            총합 <strong>{fmt(totals.total)}</strong>
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
        {!isReadOnly ? (
          <>
            <Button
              variant="ghost"
              onClick={handleSave}
              disabled={isPending}
              data-testid="tax-invoice-form-save-button"
            >
              {isPending ? '저장 중...' : '임시저장'}
            </Button>
            {isEdit ? (
              <Button
                variant="primary"
                onClick={handleIssue}
                disabled={isPending}
                data-testid="tax-invoice-form-issue-button"
              >
                {issueMutation.isPending ? '발행 중...' : '발행'}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  )
}
