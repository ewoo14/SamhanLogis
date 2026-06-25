/**
 * 세금계산서 작성/편집 화면 — `/accounting/tax-invoices/new` + `/:id/edit` (P0-4 #2).
 *
 * <p>UX:
 * <ul>
 *   <li>거래처 선택 — partner-service `searchPartners` 자동완성. 선택 즉시 사업자번호/주소/명 snapshot 자동 입력.</li>
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
import { taxInvoiceAuditApi } from '../api/createAuditApi'
import { TaxInvoiceRealtimeClient } from '../realtime/AccountingRealtimeClient'
import { AuditRevisionBadge } from '../components/audit/AuditOverlaySection'
import { searchPartners, type PartnerSummary } from '../api/sales'
import { useIsMobile } from '../hooks/useIsMobile'
import { usePageTitle } from '../hooks/usePageTitle'

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

  // 헤더 state
  const [partner, setPartner] = useState<PartnerSummary | null>(null)
  /** Snapshot — partner 선택 시 채워짐. partner null 이라도 detail edit 시 채워질 수 있음. */
  const [partnerName, setPartnerName] = useState<string>('')
  const [partnerBusinessNo, setPartnerBusinessNo] = useState<string>('')
  const [partnerAddress, setPartnerAddress] = useState<string>('')
  /** edit 모드에서 BE 가 보존한 partnerId — search snapshot 없어도 mutation 시 사용. */
  const [partnerIdSnapshot, setPartnerIdSnapshot] = useState<string>('')
  const [supplyDate, setSupplyDate] = useState<string>(today())
  const [description, setDescription] = useState<string>('')
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()])
  const [topError, setTopError] = useState<string>('')

  // edit 모드 hydrate
  useEffect(() => {
    if (!isEdit) return
    const t = detailQuery.data
    if (!t) return
    setPartnerIdSnapshot(t.partnerId)
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
  }, [isEdit, detailQuery.data])

  const totals = useMemo(() => {
    const supply = lines.reduce(
      (sum, l) => sum + calcLineSupply(l.quantity, l.unitPrice),
      0,
    )
    const vat = Math.trunc(supply * 0.1)
    return { supply, vat, total: supply + vat }
  }, [lines])

  // 거래처 선택 — search row click
  const handleSelectPartner = (p: PartnerSummary) => {
    setPartner(p)
    setPartnerName(p.companyName)
    setPartnerBusinessNo(p.businessRegistrationNumber)
    setPartnerAddress(p.address ?? '')
    // edit 모드 partnerIdSnapshot 도 맞춰줌 (단, search PartnerSummary 에 partnerId 가 없으면 빈 채로
    // BE 검증 단계에서 reject — 실제 운영은 search 가 partnerId 도 함께 반환해야 함).
  }

  const searchPartnerOptions = async (q: string): Promise<PartnerOption[]> => {
    const rows = await searchPartners(q, 8)
    return rows.map((row) => ({
      partnerCode: row.businessRegistrationNumber,
      name: row.companyName,
      bizNo: row.businessRegistrationNumber,
      phone: row.contactPhone ?? undefined,
    }))
  }

  const handlePartnerOptionChange = (option: PartnerOption | null) => {
    if (!option) {
      setPartner(null)
      return
    }
    handleSelectPartner({
      businessRegistrationNumber: option.bizNo ?? option.partnerCode,
      companyName: option.name,
      representativeName: null,
      contactPhone: option.phone ?? null,
      address: null,
      groupName: null,
      note: null,
    })
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
    onError: (err: Error) => setTopError(`저장 실패: ${err.message}`),
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
    onError: (err: Error) => setTopError(`수정 실패: ${err.message}`),
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
    onError: (err: Error) => setTopError(`발행 실패: ${err.message}`),
  })

  const buildBody = (): CreateTaxInvoiceRequest | null => {
    setTopError('')
    if (!partnerIdSnapshot && !partner) {
      setTopError(
        '거래처를 선택하세요. (목록에서 검색 후 클릭하면 사업자번호/주소가 자동 입력됩니다)',
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
      // search PartnerSummary 에는 partnerId 필드가 없어 — 운영 환경에선 search BE 보강 필요.
      // 본 mock 환경에서는 partnerIdSnapshot (edit) 우선, 신규 시 partner.businessRegistrationNumber
      // 를 placeholder 로 보내지 않고 빈 채로 두면 BE 가 422 → topError 노출.
      partnerId: partnerIdSnapshot || partner?.businessRegistrationNumber || '',
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
        `발행 전 저장 실패: ${err instanceof Error ? err.message : String(err)}`,
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
          <AuditRevisionBadge
            logs={Array.isArray(auditQuery.data) ? auditQuery.data : []}
            isError={auditQuery.isError}
            reverting={revertMutation.isPending}
            onRevert={(rev) => revertMutation.mutate(rev)}
            testIdPrefix="tax-invoice-form"
          />
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
            placeholder="거래처명 또는 사업자번호"
            value={partner
              ? {
                  partnerCode: partner.businessRegistrationNumber,
                  name: partner.companyName,
                  bizNo: partner.businessRegistrationNumber,
                  phone: partner.contactPhone ?? undefined,
                }
              : null}
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
          const vat = Math.trunc(supply * 0.1)
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
              {isPending ? '저장 중...' : '저장 (DRAFT)'}
            </Button>
            {isEdit ? (
              <Button
                variant="primary"
                onClick={handleIssue}
                disabled={isPending}
                data-testid="tax-invoice-form-issue-button"
              >
                {issueMutation.isPending ? '발행 중...' : '발행 (ISSUED)'}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  )
}
