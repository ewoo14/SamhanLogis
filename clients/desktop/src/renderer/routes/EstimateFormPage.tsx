/**
 * 견적서 작성/편집 화면 — `/sales/estimates/new` + `/:id/edit` (P2-1 #6).
 *
 * <p>UX:
 * <ul>
 *   <li>거래처 선택 — partner-service `searchPartners` 자동완성 (snapshot 자동 입력).</li>
 *   <li>유효기간 — 작성일 기준 +30일 default. 사용자 변경 가능.</li>
 *   <li>라인 입력 — 모델명 onBlur lookup → productId / productName / 단가 자동 채움.</li>
 *   <li>저장 — DRAFT 생성/갱신 후 상세로 이동.</li>
 *   <li>발송 — 편집 모드에서만. DRAFT → SENT 전이.</li>
 * </ul>
 *
 * <p>매뉴얼 출처: {@code docs/manual/01-영업/06-견적서.md}.
 * UUID 비공개 가드 — productId / partnerId 는 state 에만, 화면 표시는 modelName / partnerName.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, PartnerAutocomplete, Spinner, type PartnerOption } from '@samhan/design-system'
import {
  createEstimate,
  getEstimate,
  sendEstimate,
  updateEstimate,
  type BundleSetOptions,
  type CreateEstimateRequest,
  type EstimateLineRequest,
  type UpdateEstimateRequest,
} from '../api/estimateApi'
import { estimateAuditApi } from '../api/createAuditApi'
import { EstimateRealtimeClient } from '../realtime/EstimateRealtimeClient'
import { AuditRevisionBadge } from '../components/audit/AuditOverlaySection'
import { searchPartners, type PartnerSummary } from '../api/sales'
import {
  lookupProductByModelName,
  emptyBundleSetOptions,
  toApiBundleSetOptions,
} from '../api/slip'
import { useIsMobile } from '../hooks/useIsMobile'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { LineLookupReferenceModal } from './components/LineLookupReferenceModal'
import { BundleOptionRow } from './components/BundleOptionRow'

let __lineUidCounter = 0
const nextLineUid = (): string => `est-line-${++__lineUidCounter}`

interface DraftLine {
  uid: string
  /** lookup 성공 시 채워지는 product UUID — 화면 미노출. */
  productId: string | null
  modelName: string
  productName: string
  specification: string
  quantity: string
  unitPrice: string
  note: string
  lookupError: string | null
  lookupLoading: boolean
  /** 품목 유형 — "SINGLE" | "BUNDLE". BUNDLE 일 때만 세트 옵션 노출. */
  productType: string | null
  /** 세트 전개 옵션 — BUNDLE 라인에 한해 채움 (BE BundleSetOptions). */
  setOptions: BundleSetOptions
}

const emptyLine = (): DraftLine => ({
  uid: nextLineUid(),
  productId: null,
  modelName: '',
  productName: '',
  specification: '',
  quantity: '1',
  unitPrice: '0',
  note: '',
  lookupError: null,
  lookupLoading: false,
  productType: null,
  setOptions: emptyBundleSetOptions(),
})

const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const datePlusDays = (iso: string, days: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return ''
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const fmt = (n: number): string => Math.trunc(n).toLocaleString('ko-KR')

const calcLineSupply = (qty: string, unitPrice: string): number => {
  const q = Number.parseFloat(qty || '0')
  const p = Number.parseFloat(unitPrice || '0')
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0
  return Math.trunc(q * p)
}

function EstimateMobileLineCard(props: {
  line: DraftLine
  index: number
  isReadOnly: boolean
  lineIncl: number
  lineSupply: number
  lineVat: number
  onUpdate: (patch: Partial<DraftLine>) => void
  onLookup: () => void
  onRemove: () => void
  children?: ReactNode
}) {
  const lineNumber = props.index + 1
  return (
    <div className="mobile-line-card" data-testid={`estimate-form-line-${props.index}`}>
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
        <label className="mobile-line-field-label">모델명</label>
        <input
          type="text"
          className="mobile-line-text-input"
          value={props.line.modelName}
          onChange={(e) => props.onUpdate({ modelName: e.target.value })}
          onBlur={props.onLookup}
          placeholder="예: AJ040RXH4BC1"
          disabled={props.isReadOnly}
          data-testid={`estimate-form-line-${props.index}-model`}
        />
        {props.line.lookupError ? (
          <div className="mobile-line-error">{props.line.lookupError}</div>
        ) : null}
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">품목명</label>
        <input
          type="text"
          className="mobile-line-text-input"
          value={props.line.productName}
          onChange={(e) => props.onUpdate({ productName: e.target.value })}
          placeholder={props.line.lookupLoading ? '조회 중...' : '품목명'}
          disabled={props.isReadOnly}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">규격</label>
        <input
          type="text"
          className="mobile-line-text-input"
          value={props.line.specification}
          onChange={(e) => props.onUpdate({ specification: e.target.value })}
          placeholder="규격"
          disabled={props.isReadOnly}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">수량</label>
        <input
          type="text"
          inputMode="numeric"
          className="mobile-line-text-input mobile-line-number-input"
          value={props.line.quantity}
          onChange={(e) => props.onUpdate({ quantity: e.target.value })}
          disabled={props.isReadOnly}
          data-testid={`estimate-form-line-${props.index}-qty`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">단가(VAT포함)</label>
        <input
          type="text"
          inputMode="decimal"
          className="mobile-line-text-input mobile-line-number-input"
          value={props.line.unitPrice}
          onChange={(e) => props.onUpdate({ unitPrice: e.target.value })}
          disabled={props.isReadOnly}
          data-testid={`estimate-form-line-${props.index}-unit-price`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">합계(VAT포함)</label>
        <div className="mobile-line-readonly mobile-line-readonly--strong">
          {fmt(props.lineIncl)}
          <span>공급 {fmt(props.lineSupply)} · VAT {fmt(props.lineVat)}</span>
        </div>
      </div>

      {props.children}
    </div>
  )
}

export function EstimateFormPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams<{ id?: string }>()
  const editId = params['id']
  const isEdit = Boolean(editId)
  const { canAccess } = usePermissions()
  const canViewProductLookups = canAccess('products.list', 'view')
  const isMobile = useIsMobile()

  usePageTitle(isEdit ? '견적서 편집' : '견적서 작성')

  const detailQuery = useQuery({
    queryKey: ['estimate', editId],
    queryFn: () => getEstimate(editId!),
    enabled: isEdit,
  })

  // PR-H4c: edit 모드 audit log 백필
  const auditQuery = useQuery({
    queryKey: ['estimate', editId, 'audit-logs'],
    queryFn: () => estimateAuditApi.listAuditLogs(editId!).catch(() => []),
    enabled: isEdit && !!editId,
  })

  // PR-H4c: edit 모드 SSE 구독
  useEffect(() => {
    if (!isEdit || !editId) return
    const ctrl = EstimateRealtimeClient.subscribe(editId, (evt) => {
      void queryClient.invalidateQueries({ queryKey: ['estimate', editId] })
      if (evt.event === 'estimate:edit' || evt.event === 'message') {
        void queryClient.invalidateQueries({ queryKey: ['estimate', editId, 'audit-logs'] })
      }
    })
    return () => ctrl.abort()
  }, [isEdit, editId, queryClient])

  const revertMutation = useMutation({
    mutationFn: (revisionNo: number) =>
      estimateAuditApi.revertToRevision(editId!, revisionNo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['estimate', editId] })
      void queryClient.invalidateQueries({ queryKey: ['estimate', editId, 'audit-logs'] })
    },
    onError: () => alert('복원에 실패했습니다.'),
  })

  const [partner, setPartner] = useState<PartnerSummary | null>(null)
  const [partnerName, setPartnerName] = useState<string>('')
  const [partnerBusinessNo, setPartnerBusinessNo] = useState<string>('')
  const [partnerAddress, setPartnerAddress] = useState<string>('')
  const [partnerIdSnapshot, setPartnerIdSnapshot] = useState<string>('')
  const [estimateDate, setEstimateDate] = useState<string>(today())
  const [validUntil, setValidUntil] = useState<string>(datePlusDays(today(), 30))
  const [memo, setMemo] = useState<string>('')
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()])
  const [topError, setTopError] = useState<string>('')
  const [lineLookupOpen, setLineLookupOpen] = useState(false)

  // edit mode hydrate
  useEffect(() => {
    if (!isEdit) return
    const e = detailQuery.data
    if (!e) return
    setPartnerIdSnapshot(e.partnerId)
    setPartnerName(e.partnerName)
    setPartnerBusinessNo(e.partnerBusinessNo ?? '')
    setPartnerAddress(e.partnerAddress ?? '')
    setEstimateDate(e.estimateDate)
    setValidUntil(e.validUntil ?? '')
    setMemo(e.memo ?? '')
    setLines(
      e.lines.length > 0
        ? e.lines.map((l) => ({
            uid: nextLineUid(),
            productId: l.productId,
            modelName: l.modelName ?? '',
            productName: l.productName ?? '',
            specification: l.specification ?? '',
            quantity: String(l.quantity),
            // 단가 부가세포함: 폼 단가 입력은 VAT 포함값. 편집 hydrate 시 저장된 공급단가(unitPrice)가
            // 아니라 VAT 포함 단가(unitPriceWithVat)를 채워야 재저장(priceVatInclusive=true) 시 금액 보존.
            unitPrice: l.unitPriceWithVat ?? l.unitPrice,
            note: l.note ?? '',
            lookupError: null,
            lookupLoading: false,
            // 편집 모드: 이미 전개·저장된 구성품 라인이므로 재전개하지 않음
            // (개별 SINGLE 품목으로 취급, setOptions 미적용).
            productType: null,
            setOptions: emptyBundleSetOptions(),
          }))
        : [emptyLine()],
    )
  }, [isEdit, detailQuery.data])

  const totals = useMemo(() => {
    // 단가 부가세포함(라인 단위 eCount, 원 단위): 라인별 합계(VAT포함)=round(수량×단가),
    // 공급가액=round(합계/1.1), 부가세=차액 → 라인별 반올림 후 합산(BE 와 동일).
    let supply = 0
    let total = 0
    for (const l of lines) {
      const incl = Math.round(
        (Number.parseFloat(l.quantity || '0') || 0) * (Number.parseFloat(l.unitPrice || '0') || 0),
      )
      supply += Math.round(incl / 1.1)
      total += incl
    }
    return { supply, vat: total - supply, total }
  }, [lines])

  const handleSelectPartner = (p: PartnerSummary) => {
    setPartner(p)
    setPartnerName(p.companyName)
    setPartnerBusinessNo(p.businessRegistrationNumber)
    setPartnerAddress(p.address ?? '')
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
  const updateSetOption = (index: number, patch: Partial<BundleSetOptions>) => {
    setLines((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, setOptions: { ...l.setOptions, ...patch } } : l,
      ),
    )
  }
  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (index: number) => {
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length === 0 ? [emptyLine()] : next
    })
  }

  // 모델명 onBlur lookup
  const handleModelLookup = async (index: number) => {
    const line = lines[index]
    if (!line || !line.modelName.trim()) return
    updateLine(index, { lookupLoading: true, lookupError: null })
    try {
      const result = await lookupProductByModelName(line.modelName.trim())
      updateLine(index, {
        productId: result.productId,
        productName: result.productName,
        productType: result.productType ?? 'SINGLE',
        unitPrice:
          line.unitPrice === '0' || !line.unitPrice
            ? result.sellingPrice
            : line.unitPrice,
        lookupError: null,
        lookupLoading: false,
      })
    } catch (err: unknown) {
      updateLine(index, {
        lookupError:
          err instanceof Error
            ? '모델 미존재 또는 lookup 실패'
            : '알 수 없는 오류',
        lookupLoading: false,
      })
    }
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateEstimateRequest) => createEstimate(body),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      navigate(`/sales/estimates/${created.id}`, { replace: true })
    },
    onError: (err: Error) => setTopError(`저장 실패: ${err.message}`),
  })

  const updateMutation = useMutation({
    mutationFn: (body: UpdateEstimateRequest) => updateEstimate(editId!, body),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      queryClient.invalidateQueries({ queryKey: ['estimate', updated.id] })
      navigate(`/sales/estimates/${updated.id}`, { replace: true })
    },
    onError: (err: Error) => setTopError(`수정 실패: ${err.message}`),
  })

  const sendMutation = useMutation({
    mutationFn: (id: string) => sendEstimate(id),
    onSuccess: (sent) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      queryClient.invalidateQueries({ queryKey: ['estimate', sent.id] })
      alert(`발송 완료: ${sent.estimateNo}`)
      navigate(`/sales/estimates/${sent.id}`, { replace: true })
    },
    onError: (err: Error) => setTopError(`발송 실패: ${err.message}`),
  })

  const buildBody = (): CreateEstimateRequest | null => {
    setTopError('')
    if (!partnerIdSnapshot && !partner) {
      setTopError('거래처를 선택하세요.')
      return null
    }
    if (!partnerName.trim()) {
      setTopError('거래처명이 비어있습니다.')
      return null
    }
    const valid = lines.filter(
      (l) => l.productId && Number.parseInt(l.quantity || '0', 10) > 0,
    )
    if (valid.length === 0) {
      setTopError(
        '라인 1개 이상 (모델명 lookup 성공 + 수량 > 0) 을 입력하세요.',
      )
      return null
    }
    const apiLines: EstimateLineRequest[] = valid.map((l) => ({
      productId: l.productId!,
      productName: l.productName.trim() || undefined,
      modelName: l.modelName.trim() || undefined,
      specification: l.specification.trim() || undefined,
      quantity: Number.parseInt(l.quantity || '0', 10),
      unitPrice: l.unitPrice || '0',
      note: l.note.trim() || undefined,
      setOptions: toApiBundleSetOptions(l.productType, l.setOptions),
      // 단가 부가세포함 — BE 가 라인 단위로 공급가액/부가세 분리(eCount).
      priceVatInclusive: true,
    }))
    return {
      estimateDate: estimateDate || undefined,
      partnerId: partnerIdSnapshot || partner?.businessRegistrationNumber || '',
      partnerName: partnerName.trim(),
      partnerBusinessNo: partnerBusinessNo.trim() || undefined,
      partnerAddress: partnerAddress.trim() || undefined,
      validUntil: validUntil || undefined,
      memo: memo.trim() || undefined,
      lines: apiLines,
    }
  }

  const handleSave = () => {
    const body = buildBody()
    if (!body) return
    if (isEdit) {
      const updateBody: UpdateEstimateRequest = {
        partnerId: body.partnerId,
        partnerName: body.partnerName,
        partnerBusinessNo: body.partnerBusinessNo,
        partnerAddress: body.partnerAddress,
        validUntil: body.validUntil,
        memo: body.memo,
        lines: body.lines,
      }
      updateMutation.mutate(updateBody)
    } else {
      createMutation.mutate(body)
    }
  }

  const handleSend = async () => {
    if (!isEdit || !editId) {
      setTopError('먼저 저장 후 발송할 수 있습니다.')
      return
    }
    if (
      !confirm(
        '이 견적서를 발송하시겠습니까?\n발송 후 거래처가 수락/거절을 결정합니다.',
      )
    )
      return
    const body = buildBody()
    if (!body) return
    try {
      const updateBody: UpdateEstimateRequest = {
        partnerId: body.partnerId,
        partnerName: body.partnerName,
        partnerBusinessNo: body.partnerBusinessNo,
        partnerAddress: body.partnerAddress,
        validUntil: body.validUntil,
        memo: body.memo,
        lines: body.lines,
      }
      await updateEstimate(editId, updateBody)
      sendMutation.mutate(editId)
    } catch (err: unknown) {
      setTopError(
        `발송 전 저장 실패: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  if (isEdit && detailQuery.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
        <Spinner size="lg" label="견적서 불러오는 중" />
      </div>
    )
  }

  const isReadOnly =
    isEdit &&
    detailQuery.data &&
    detailQuery.data.status !== 'QUOTE_DRAFT' &&
    detailQuery.data.status !== 'QUOTE_SENT'

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    sendMutation.isPending

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
            {isEdit ? '견적서 편집' : '견적서 작성'}
          </h3>
          <p style={{ marginTop: 4, fontSize: 13, color: '#6B7280' }}>
            모델명을 입력하고 다른 영역을 클릭하면 품목명/단가가 자동 입력됩니다.
          </p>
        </div>
        {/* PR-H4c: 편집 모드 — 수정 횟수 + 복원 dropdown */}
        {isEdit ? (
          <AuditRevisionBadge
            logs={Array.isArray(auditQuery.data) ? auditQuery.data : []}
            isError={auditQuery.isError}
            reverting={revertMutation.isPending}
            onRevert={(rev) => revertMutation.mutate(rev)}
            testIdPrefix="estimate-form"
          />
        ) : null}
      </div>

      {isReadOnly ? (
        <div
          className="error-banner"
          role="alert"
          style={{ marginBottom: 16, padding: 12 }}
        >
          이 견적서는 수락/거절/변환되어 더 이상 수정할 수 없습니다.
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

        <div
          className="mobile-form-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr',
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
            data-testid="estimate-form-partner-name"
          />
          <Input
            label="사업자번호"
            value={partnerBusinessNo}
            onChange={(e) => setPartnerBusinessNo(e.target.value)}
            disabled={Boolean(isReadOnly)}
            data-testid="estimate-form-partner-business-no"
          />
          <Input
            label="작성일"
            type="date"
            value={estimateDate}
            onChange={(e) => setEstimateDate(e.target.value)}
            disabled={Boolean(isReadOnly)}
            data-testid="estimate-form-estimate-date"
          />
          <Input
            label="유효기간"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            disabled={Boolean(isReadOnly)}
            data-testid="estimate-form-valid-until"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Input
            label="주소"
            value={partnerAddress}
            onChange={(e) => setPartnerAddress(e.target.value)}
            disabled={Boolean(isReadOnly)}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Input
            label="비고"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            disabled={Boolean(isReadOnly)}
          />
        </div>

        {!isMobile ? (
          /* 라인 헤더 */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                '32px 160px 1fr 100px 80px 130px 130px 36px',
              gap: 8,
              padding: '8px 0',
              borderBottom: '2px solid var(--line-default)',
              fontSize: 12,
              color: '#6B7280',
              fontWeight: 600,
            }}
          >
            <div style={{ textAlign: 'center' }}>#</div>
            <div>모델명</div>
            <div>품목명</div>
            <div>규격</div>
            <div style={{ textAlign: 'right' }}>수량</div>
            <div style={{ textAlign: 'right' }}>단가(VAT포함)</div>
            <div style={{ textAlign: 'right' }}>합계(VAT포함)</div>
            <div />
          </div>
        ) : null}

        <div className={isMobile ? 'mobile-line-card-list' : undefined}>
        {lines.map((line, i) => {
          // 단가 부가세포함: 합계(VAT포함)=round(수량×단가), 공급가액=round(합계/1.1), 부가세=차액.
          const lineIncl = Math.round(calcLineSupply(line.quantity, line.unitPrice))
          const lineSupply = Math.round(lineIncl / 1.1)
          const lineVat = lineIncl - lineSupply
          const isBundle = line.productType === 'BUNDLE'
          if (isMobile) {
            return (
              <EstimateMobileLineCard
                key={line.uid}
                line={line}
                index={i}
                isReadOnly={Boolean(isReadOnly)}
                lineIncl={lineIncl}
                lineSupply={lineSupply}
                lineVat={lineVat}
                onUpdate={(patch) => updateLine(i, patch)}
                onLookup={() => handleModelLookup(i)}
                onRemove={() => removeLine(i)}
              >
                {isBundle ? (
                  <BundleOptionRow
                    line={line}
                    index={i}
                    disabled={Boolean(isReadOnly)}
                    onChange={(patch) => updateSetOption(i, patch)}
                  />
                ) : null}
              </EstimateMobileLineCard>
            )
          }
          return (
           <div key={line.uid}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  '32px 160px 1fr 100px 80px 130px 130px 36px',
                gap: 8,
                padding: '6px 0',
                alignItems: 'center',
                borderBottom: isBundle ? 'none' : '1px solid #F3F4F6',
              }}
              data-testid={`estimate-form-line-${i}`}
            >
              <div style={{ textAlign: 'center', color: '#6B7280' }}>
                {i + 1}
              </div>
              <div>
                <input
                  type="text"
                  value={line.modelName}
                  onChange={(e) =>
                    updateLine(i, { modelName: e.target.value })
                  }
                  onBlur={() => handleModelLookup(i)}
                  placeholder="예: AJ040RXH4BC1"
                  disabled={Boolean(isReadOnly)}
                  style={{
                    height: 32,
                    width: '100%',
                    padding: '0 8px',
                    border: line.lookupError
                      ? '1px solid var(--state-danger)'
                      : '1px solid var(--color-neutral-300)',
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                  data-testid={`estimate-form-line-${i}-model`}
                />
                {line.lookupError ? (
                  <div style={{ fontSize: 10, color: 'var(--state-danger)', marginTop: 2 }}>
                    {line.lookupError}
                  </div>
                ) : null}
              </div>
              <input
                type="text"
                value={line.productName}
                onChange={(e) =>
                  updateLine(i, { productName: e.target.value })
                }
                placeholder={line.lookupLoading ? '조회 중...' : '품목명'}
                disabled={Boolean(isReadOnly)}
                style={{
                  height: 32,
                  padding: '0 8px',
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 4,
                  fontSize: 13,
                  background: line.productId ? '#F9FAFB' : '#fff',
                }}
              />
              <input
                type="text"
                value={line.specification}
                onChange={(e) =>
                  updateLine(i, { specification: e.target.value })
                }
                placeholder="규격"
                disabled={Boolean(isReadOnly)}
                style={{
                  height: 32,
                  padding: '0 8px',
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 4,
                  fontSize: 13,
                }}
              />
              <input
                type="text"
                inputMode="numeric"
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: e.target.value })}
                disabled={Boolean(isReadOnly)}
                style={{
                  height: 32,
                  padding: '0 8px',
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 4,
                  fontSize: 13,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
                data-testid={`estimate-form-line-${i}-qty`}
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
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 4,
                  fontSize: 13,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
                data-testid={`estimate-form-line-${i}-unit-price`}
              />
              <div
                style={{
                  textAlign: 'right',
                  fontSize: 13,
                  color: 'var(--ink-primary)',
                  fontVariantNumeric: 'tabular-nums',
                  background: '#F9FAFB',
                  padding: '6px 8px',
                  borderRadius: 4,
                }}
              >
                {fmt(lineIncl)}
                <div style={{ fontSize: 10, color: 'var(--ink-secondary, #5C6773)', fontWeight: 400 }}>
                  공급 {fmt(lineSupply)} · VAT {fmt(lineVat)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={Boolean(isReadOnly)}
                aria-label={`라인 ${i + 1} 삭제`}
                style={{
                  height: 32,
                  width: 32,
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 4,
                  background: '#fff',
                  color: 'var(--state-danger)',
                  cursor: isReadOnly ? 'not-allowed' : 'pointer',
                }}
              >
                ×
              </button>
            </div>
            {isBundle ? (
              <BundleOptionRow
                line={line}
                index={i}
                disabled={Boolean(isReadOnly)}
                onChange={(patch) => updateSetOption(i, patch)}
              />
            ) : null}
           </div>
          )
        })}
        </div>

        {!isReadOnly ? (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={addLine}
              data-testid="estimate-form-add-line"
            >
              + 라인 추가
            </Button>
            {canViewProductLookups ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLineLookupOpen(true)}
                data-testid="estimate-line-lookup-btn"
              >
                참조 조회
              </Button>
            ) : null}
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
          data-testid="estimate-form-totals"
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
          style={{ marginTop: 16, padding: 12, color: 'var(--state-danger)' }}
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
              data-testid="estimate-form-save-button"
            >
              {isPending ? '저장 중...' : '저장 (DRAFT)'}
            </Button>
            {isEdit ? (
              <Button
                variant="primary"
                onClick={handleSend}
                disabled={isPending}
                data-testid="estimate-form-send-button"
              >
                {sendMutation.isPending ? '발송 중...' : '발송 (SENT)'}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      <LineLookupReferenceModal
        open={lineLookupOpen}
        onClose={() => setLineLookupOpen(false)}
      />
    </>
  )
}
