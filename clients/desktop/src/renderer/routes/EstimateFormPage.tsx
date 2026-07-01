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
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, PartnerAutocomplete, Spinner, type PartnerOption } from '@samhan/design-system'
import {
  createEstimate,
  getEstimate,
  sendEstimate,
  updateEstimate,
  type BundleSetOptions,
  type CreateEstimateRequest,
  type EstimateDetail,
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
import { CollaborativeSlipInput } from '../components/collab/CollaborativeSlipInput'
import { createDocCoeditProvider, type DocCoeditProvider } from '../realtime/createCoeditProvider'
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
const ESTIMATE_HEADER_TEXT_FIELDS = new Set<string>(['memo'])

const calcLineSupply = (qty: string, unitPrice: string): number => {
  const q = Number.parseFloat(qty || '0')
  const p = Number.parseFloat(unitPrice || '0')
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0
  return Math.trunc(q * p)
}

function toDraftLinesFromEstimate(estimate: EstimateDetail): DraftLine[] {
  return estimate.lines.length > 0
    ? estimate.lines.map((line) => ({
        uid: nextLineUid(),
        productId: line.productId,
        modelName: line.modelName ?? '',
        productName: line.productName ?? '',
        specification: line.specification ?? '',
        quantity: String(line.quantity),
        // 단가 부가세포함: 폼 단가 입력은 VAT 포함값. 편집 hydrate/coedit seed 모두 같은 값으로 보존.
        unitPrice: line.unitPriceWithVat ?? line.unitPrice,
        note: line.note ?? '',
        lookupError: null,
        lookupLoading: false,
        // 편집 모드: 이미 전개·저장된 구성품 라인이므로 재전개하지 않음.
        productType: null,
        setOptions: emptyBundleSetOptions(),
      }))
    : [emptyLine()]
}

function seedEstimateCoeditProvider(provider: DocCoeditProvider, estimate: EstimateDetail) {
  provider.setHeaderValue('partnerName', estimate.partnerName)
  provider.setHeaderValue('partnerBusinessNo', estimate.partnerBusinessNo ?? '')
  provider.setHeaderValue('partnerAddress', estimate.partnerAddress ?? '')
  provider.setHeaderValue('estimateDate', estimate.estimateDate)
  provider.setHeaderValue('validUntil', estimate.validUntil ?? '')
  provider.setHeaderValue('memo', estimate.memo ?? '')
  provider.replaceItems(
    toDraftLinesFromEstimate(estimate).map((line) => ({
      modelName: line.modelName,
      productName: line.productName,
      specification: line.specification,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      productId: line.productId ?? '',
    })),
  )
}

function coeditLinesToDraftLines(provider: DocCoeditProvider, current: DraftLine[]): DraftLine[] {
  return provider.items.toArray().map((_, index) => {
    const previous = current[index]
    return {
      uid: previous?.uid ?? nextLineUid(),
      productId: provider.getItemValue(index, 'productId') || null,
      modelName: provider.getItemValue(index, 'modelName'),
      productName: provider.getItemValue(index, 'productName'),
      specification: provider.getItemValue(index, 'specification'),
      quantity: provider.getItemValue(index, 'quantity') || '0',
      unitPrice: provider.getItemValue(index, 'unitPrice') || '0',
      note: previous?.note ?? '',
      // 원격 doc 변경마다 재빌드되므로 진행 중 lookup 상태는 previous 에서 보존(스피너 조기소멸 방지, 리뷰 MED).
      lookupError: previous?.lookupError ?? null,
      lookupLoading: previous?.lookupLoading ?? false,
      productType: previous?.productType ?? null,
      setOptions: previous?.setOptions ?? emptyBundleSetOptions(),
    }
  })
}

function EstimateMobileLineCard(props: {
  line: DraftLine
  index: number
  isReadOnly: boolean
  provider: DocCoeditProvider | null
  coeditPending: boolean
  lineStructureLocked: boolean
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
          disabled={props.lineStructureLocked}
          aria-label={`라인 ${lineNumber} 삭제`}
        >
          삭제
        </button>
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">모델명</label>
        <CollaborativeSlipInput
          provider={props.provider}
          coeditPending={props.coeditPending}
          fieldPath={`items.${props.index}.modelName`}
          value={props.line.modelName}
          onValueChange={(value) => props.onUpdate({ modelName: value })}
          onBlur={props.onLookup}
          inputSize="sm"
          readOnly={props.isReadOnly}
          type="text"
          aria-label={`라인 ${lineNumber} 모델명`}
        />
        {props.line.lookupError ? (
          <div className="mobile-line-error">{props.line.lookupError}</div>
        ) : null}
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">품목명</label>
        <CollaborativeSlipInput
          provider={props.provider}
          coeditPending={props.coeditPending}
          fieldPath={`items.${props.index}.productName`}
          value={props.line.productName}
          onValueChange={(value) => props.onUpdate({ productName: value })}
          inputSize="sm"
          readOnly={props.isReadOnly}
          type="text"
          aria-label={`라인 ${lineNumber} 품목명`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">규격</label>
        <CollaborativeSlipInput
          provider={props.provider}
          coeditPending={props.coeditPending}
          fieldPath={`items.${props.index}.specification`}
          value={props.line.specification}
          onValueChange={(value) => props.onUpdate({ specification: value })}
          inputSize="sm"
          readOnly={props.isReadOnly}
          type="text"
          aria-label={`라인 ${lineNumber} 규격`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">수량</label>
        <CollaborativeSlipInput
          provider={props.provider}
          coeditPending={props.coeditPending}
          fieldPath={`items.${props.index}.quantity`}
          value={props.line.quantity}
          onValueChange={(value) => props.onUpdate({ quantity: value })}
          inputSize="sm"
          readOnly={props.isReadOnly}
          type="text"
          aria-label={`라인 ${lineNumber} 수량`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">단가(VAT포함)</label>
        <CollaborativeSlipInput
          provider={props.provider}
          coeditPending={props.coeditPending}
          fieldPath={`items.${props.index}.unitPrice`}
          value={props.line.unitPrice}
          onValueChange={(value) => props.onUpdate({ unitPrice: value })}
          inputSize="sm"
          readOnly={props.isReadOnly}
          type="text"
          aria-label={`라인 ${lineNumber} 단가`}
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
  const [estimateFormCoeditProvider, setEstimateFormCoeditProvider] = useState<DocCoeditProvider | null>(null)
  const [estimateFormCoeditPending, setEstimateFormCoeditPending] = useState(false)

  const isReadOnly =
    isEdit &&
    detailQuery.data &&
    detailQuery.data.status !== 'QUOTE_DRAFT' &&
    detailQuery.data.status !== 'QUOTE_SENT'
  const canCollabEdit =
    isEdit &&
    !!editId &&
    !!detailQuery.data &&
    !isReadOnly &&
    canAccess('estimates.list', 'update')
  const coeditActive = Boolean(estimateFormCoeditProvider) || estimateFormCoeditPending
  // coedit useEffect 가 detailQuery.data 객체를 deps 로 두면 React Query 리페치/SSE invalidate 마다
  // provider 가 재생성돼 협업 세션이 끊기고 미저장 CRDT 델타가 재시드로 유실된다(듀얼리뷰 HIGH).
  // seed 용 최신 스냅샷은 ref 로 읽어 effect 를 안정 트리거(canCollabEdit/editId/isEdit)로만 재실행한다.
  const estimateDataRef = useRef<EstimateDetail | null>(null)
  estimateDataRef.current = detailQuery.data ?? null

  // edit mode hydrate
  useEffect(() => {
    if (!isEdit) return
    const e = detailQuery.data
    if (!e) return
    if (estimateFormCoeditProvider) return
    setPartnerIdSnapshot(e.partnerId)
    setPartnerName(e.partnerName)
    setPartnerBusinessNo(e.partnerBusinessNo ?? '')
    setPartnerAddress(e.partnerAddress ?? '')
    setEstimateDate(e.estimateDate)
    setValidUntil(e.validUntil ?? '')
    setMemo(e.memo ?? '')
    setLines(toDraftLinesFromEstimate(e))
  }, [isEdit, detailQuery.data, estimateFormCoeditProvider])

  useEffect(() => {
    const estimate = estimateDataRef.current
    if (!isEdit || !editId || !estimate || !canCollabEdit) {
      setEstimateFormCoeditProvider(null)
      setEstimateFormCoeditPending(false)
      return undefined
    }

    let disposed = false
    let provider: DocCoeditProvider | null = null
    let unsubscribeDoc: (() => void) | null = null
    setEstimateFormCoeditPending(true)

    const applyProviderState = (nextProvider: DocCoeditProvider) => {
      setPartnerName(nextProvider.getHeaderValue('partnerName'))
      setPartnerBusinessNo(nextProvider.getHeaderValue('partnerBusinessNo'))
      setPartnerAddress(nextProvider.getHeaderValue('partnerAddress'))
      setEstimateDate(nextProvider.getHeaderValue('estimateDate'))
      setValidUntil(nextProvider.getHeaderValue('validUntil'))
      setMemo(nextProvider.getHeaderValue('memo'))
      setLines((prev) => coeditLinesToDraftLines(nextProvider, prev))
    }

    void createDocCoeditProvider({
      documentId: editId,
      basePath: `/slips/estimates/${editId}`,
      headerTextFields: ESTIMATE_HEADER_TEXT_FIELDS,
    }).then((nextProvider) => {
      if (disposed) {
        nextProvider.destroy()
        return
      }
      provider = nextProvider
      const serverLineCount = toDraftLinesFromEstimate(estimate).length
      const providerLineCount = nextProvider.items.toArray().length
      // 슬1은 협업 중 라인 추가/삭제를 잠가 index seed-lock 을 유지한다.
      // provider 라인수와 서버 라인수가 다르면 stale snapshot 으로 보고 서버 기준 재시드한다.
      if (nextProvider.isEmpty() || providerLineCount !== serverLineCount) {
        seedEstimateCoeditProvider(nextProvider, estimate)
      }
      applyProviderState(nextProvider)
      unsubscribeDoc = nextProvider.subscribeDoc(() => applyProviderState(nextProvider))
      setEstimateFormCoeditProvider(nextProvider)
      setEstimateFormCoeditPending(false)
    }).catch(() => {
      if (disposed) return
      setEstimateFormCoeditProvider(null)
      setEstimateFormCoeditPending(false)
    })

    return () => {
      disposed = true
      unsubscribeDoc?.()
      if (provider) provider.destroy()
      setEstimateFormCoeditProvider(null)
      setEstimateFormCoeditPending(false)
    }
    // deps 에서 detailQuery.data 제외 — 리페치/SSE 재생성 방지(estimate 는 estimateDataRef 로 최신값 사용).
  }, [canCollabEdit, editId, isEdit])

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
    const modelName = (estimateFormCoeditProvider?.getItemValue(index, 'modelName') || line?.modelName || '').trim()
    if (!line || !modelName) return
    updateLine(index, { lookupLoading: true, lookupError: null })
    try {
      const result = await lookupProductByModelName(modelName)
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
      if (estimateFormCoeditProvider) {
        const nextUnitPrice =
          line.unitPrice === '0' || !line.unitPrice
            ? result.sellingPrice
            : line.unitPrice
        try {
          estimateFormCoeditProvider.setItemValue(index, 'productName', result.productName)
          estimateFormCoeditProvider.setItemValue(index, 'unitPrice', nextUnitPrice)
          estimateFormCoeditProvider.setItemValue(index, 'productId', result.productId)
        } catch {
          // 언마운트 중 provider destroy 가능 — 로컬 state 는 이미 갱신됨. 동기화 실패는 무시(가짜 lookup 오류 방지, 리뷰 LOW).
        }
      }
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
            disabled={Boolean(isReadOnly) || coeditActive}
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
          <CollaborativeSlipInput
            provider={estimateFormCoeditProvider}
            coeditPending={estimateFormCoeditPending}
            fieldPath="header.partnerName"
            label="거래처명"
            value={partnerName}
            onValueChange={setPartnerName}
            readOnly={Boolean(isReadOnly)}
            required
            aria-label="거래처명"
            data-testid="estimate-form-partner-name"
          />
          <CollaborativeSlipInput
            provider={estimateFormCoeditProvider}
            coeditPending={estimateFormCoeditPending}
            fieldPath="header.partnerBusinessNo"
            label="사업자번호"
            value={partnerBusinessNo}
            onValueChange={setPartnerBusinessNo}
            readOnly={Boolean(isReadOnly)}
            aria-label="사업자번호"
            data-testid="estimate-form-partner-business-no"
          />
          <CollaborativeSlipInput
            provider={estimateFormCoeditProvider}
            coeditPending={estimateFormCoeditPending}
            fieldPath="header.estimateDate"
            label="작성일"
            type="date"
            value={estimateDate}
            onValueChange={setEstimateDate}
            readOnly={Boolean(isReadOnly)}
            aria-label="작성일"
            data-testid="estimate-form-estimate-date"
          />
          <CollaborativeSlipInput
            provider={estimateFormCoeditProvider}
            coeditPending={estimateFormCoeditPending}
            fieldPath="header.validUntil"
            label="유효기간"
            type="date"
            value={validUntil}
            onValueChange={setValidUntil}
            readOnly={Boolean(isReadOnly)}
            aria-label="유효기간"
            data-testid="estimate-form-valid-until"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <CollaborativeSlipInput
            provider={estimateFormCoeditProvider}
            coeditPending={estimateFormCoeditPending}
            fieldPath="header.partnerAddress"
            label="주소"
            value={partnerAddress}
            onValueChange={setPartnerAddress}
            readOnly={Boolean(isReadOnly)}
            aria-label="주소"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <CollaborativeSlipInput
            provider={estimateFormCoeditProvider}
            coeditPending={estimateFormCoeditPending}
            fieldPath="header.memo"
            label="비고"
            value={memo}
            onValueChange={setMemo}
            readOnly={Boolean(isReadOnly)}
            aria-label="비고"
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

        {isMobile && !isReadOnly && canViewProductLookups ? (
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLineLookupOpen(true)}
              disabled={estimateFormCoeditPending}
              data-testid="estimate-line-lookup-btn"
            >
              참조 조회
            </Button>
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
                provider={estimateFormCoeditProvider}
                coeditPending={estimateFormCoeditPending}
                lineStructureLocked={Boolean(isReadOnly) || coeditActive}
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
                    disabled={Boolean(isReadOnly) || estimateFormCoeditPending}
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
                <CollaborativeSlipInput
                  provider={estimateFormCoeditProvider}
                  coeditPending={estimateFormCoeditPending}
                  fieldPath={`items.${i}.modelName`}
                  type="text"
                  value={line.modelName}
                  onValueChange={(value) => updateLine(i, { modelName: value })}
                  onBlur={() => handleModelLookup(i)}
                  readOnly={Boolean(isReadOnly)}
                  aria-label={`라인 ${i + 1} 모델명`}
                  data-testid={`estimate-form-line-${i}-model`}
                />
                {line.lookupError ? (
                  <div style={{ fontSize: 10, color: 'var(--state-danger)', marginTop: 2 }}>
                    {line.lookupError}
                  </div>
                ) : null}
              </div>
              <CollaborativeSlipInput
                provider={estimateFormCoeditProvider}
                coeditPending={estimateFormCoeditPending}
                fieldPath={`items.${i}.productName`}
                type="text"
                value={line.productName}
                onValueChange={(value) => updateLine(i, { productName: value })}
                readOnly={Boolean(isReadOnly)}
                aria-label={`라인 ${i + 1} 품목명`}
              />
              <CollaborativeSlipInput
                provider={estimateFormCoeditProvider}
                coeditPending={estimateFormCoeditPending}
                fieldPath={`items.${i}.specification`}
                type="text"
                value={line.specification}
                onValueChange={(value) => updateLine(i, { specification: value })}
                readOnly={Boolean(isReadOnly)}
                aria-label={`라인 ${i + 1} 규격`}
              />
              <CollaborativeSlipInput
                provider={estimateFormCoeditProvider}
                coeditPending={estimateFormCoeditPending}
                fieldPath={`items.${i}.quantity`}
                type="text"
                value={line.quantity}
                onValueChange={(value) => updateLine(i, { quantity: value })}
                readOnly={Boolean(isReadOnly)}
                aria-label={`라인 ${i + 1} 수량`}
                data-testid={`estimate-form-line-${i}-qty`}
              />
              <CollaborativeSlipInput
                provider={estimateFormCoeditProvider}
                coeditPending={estimateFormCoeditPending}
                fieldPath={`items.${i}.unitPrice`}
                type="text"
                value={line.unitPrice}
                onValueChange={(value) => updateLine(i, { unitPrice: value })}
                readOnly={Boolean(isReadOnly)}
                aria-label={`라인 ${i + 1} 단가`}
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
                disabled={Boolean(isReadOnly) || coeditActive}
                aria-label={`라인 ${i + 1} 삭제`}
                style={{
                  height: 32,
                  width: 32,
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 4,
                  background: '#fff',
                  color: 'var(--state-danger)',
                  cursor: isReadOnly || coeditActive ? 'not-allowed' : 'pointer',
                }}
              >
                ×
              </button>
            </div>
            {isBundle ? (
              <BundleOptionRow
                line={line}
                index={i}
                disabled={Boolean(isReadOnly) || coeditActive}
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
              disabled={coeditActive}
              data-testid="estimate-form-add-line"
            >
              + 라인 추가
            </Button>
            {!isMobile && canViewProductLookups ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLineLookupOpen(true)}
                disabled={estimateFormCoeditPending}
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

      {estimateFormCoeditPending ? (
        <p role="status" data-testid="estimate-form-coedit-pending">
          협업 연결 중…
        </p>
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
              disabled={isPending || estimateFormCoeditPending}
              data-testid="estimate-form-save-button"
            >
              {isPending ? '저장 중...' : '임시저장'}
            </Button>
            {isEdit ? (
              <Button
                variant="primary"
                onClick={handleSend}
                disabled={isPending || estimateFormCoeditPending}
                data-testid="estimate-form-send-button"
              >
                {sendMutation.isPending ? '발송 중...' : '발송'}
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
