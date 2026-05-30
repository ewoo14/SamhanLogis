/**
 * 전표 작성 화면 (출고/입고 공용) — sales-form-polish 슬라이스 v3.
 *
 * Designer (5-team) spec (`docs/design/sales-form-polish-slice/`) 충실 반영.
 *
 * v3 변경사항 (sales-form-polish 슬라이스 — 본 PR):
 * - 라인 입력 → `<LineRow>` 디자인 시스템 컴포넌트 (9-column dense table)
 * - drag-and-drop 라인 순서 변경 — `@dnd-kit/sortable`
 *   (DndContext + SortableContext + useSortable + 마우스 + 키보드 sensor)
 * - 행 체크박스 + 헤더 체크박스 (전체 선택 / indeterminate)
 * - 행 클릭/체크 시 selected state — 좌측 4px 파란 띠 + 배경 변화
 * - 헤더에 [선택 항목 재고조회] 버튼 — `POST /inventory/balances/batch`
 * - `<StockBalanceModal>` 모달 (모델명 × 창고 matrix + 합계)
 * - 자동 라인 번호 (drag 시 자동 갱신)
 * - 합계 영역 헤더 — 4건 / 공급가액 / 부가세 / 총 (모던 미니멀 dense)
 * - 신규 디자인 토큰 (`--surface-*`, `--ink-*`, `--row-h` 등) 적용
 *
 * UUID 비공개 가드 (memory `feedback_uuid_no_user_visibility.md`):
 * - LineDraft.id 는 dnd-kit key 용 — 화면 미노출 (서버 UUID 또는 'tmp-N')
 * - LineDraft.productId 는 부모 state 로만 보관, 서버 호출 시 사용
 * - 모든 화면 표시 식별자는 modelName / productName / 창고 코드 등 비즈니스 라벨
 *
 * 본 컴포넌트는 `mode` prop 으로 OUTBOUND / INBOUND 양쪽 화면에서 재사용.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  DeliveryTagSelector,
  FormField,
  KOREAN_MOBILE_PHONE_PATTERN,
  LineRow,
  LineTableHeader,
  PhoneInput,
  StockBalanceModal,
  WarehouseSelector,
  type DeliveryTagOption,
  type LineDraft,
  type StockBalanceRow,
  type WarehouseColumn,
} from '@samhan/design-system'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import axios from 'axios'
import {
  fetchStockBalanceBatch,
  listWarehouses,
  type StockBalanceLookupLine,
} from '../api/inventory'
import {
  createSlip,
  lookupPartnerForAutoFill,
  lookupProductByModelName,
  type SlipLineInput,
  type SlipType,
} from '../api/slip'
import { usePageTitle } from '../hooks/usePageTitle'

/**
 * 본 슬라이스용 OUTBOUND 배송태그 옵션 — BE `DeliveryTag` enum 의 OUTBOUND 8종.
 */
const OUTBOUND_TAG_OPTIONS: DeliveryTagOption[] = [
  { code: 'DAY', displayName: '당일', direction: 'OUTBOUND', autoMemo: false },
  { code: 'STACK', displayName: '야적', direction: 'OUTBOUND', autoMemo: true },
  { code: 'REGION', displayName: '지방', direction: 'OUTBOUND', autoMemo: true },
  { code: 'LOGEN', displayName: '로젠택배', direction: 'OUTBOUND', autoMemo: false },
  { code: 'GYEONGDONG_PARCEL', displayName: '경동택배', direction: 'OUTBOUND', autoMemo: false },
  { code: 'GYEONGDONG_FREIGHT', displayName: '경동화물', direction: 'OUTBOUND', autoMemo: false },
  { code: 'RENTAL', displayName: '대여', direction: 'OUTBOUND', autoMemo: false },
  { code: 'RETURN_RENTAL', displayName: '반납', direction: 'OUTBOUND', autoMemo: false },
]

/** 임시 라인 ID 생성기 — UUID 노출 방지를 위해 프론트 prefix 사용. */
let __tempIdCounter = 0
const nextTempId = (): string => `tmp-${++__tempIdCounter}`

const emptyLine = (): LineDraft => ({
  id: nextTempId(),
  productId: null,
  modelName: '',
  productName: '',
  specification: '', // Slice A 신규 (피드백 #4)
  quantity: '1',
  unitPrice: '0',
  lookupError: null,
  lookupLoading: false,
})

export interface SlipFormPageProps {
  /** OUTBOUND (판매/출고) 또는 INBOUND (구매/입고). */
  mode: SlipType
}

/**
 * dnd-kit useSortable 을 적용한 LineRow wrapper — SlipFormPage 내부 전용.
 *
 * useSortable 은 hook 이라 LineRow 외부에서 호출하고 setNodeRef + transform CSS
 * 를 wrapper div 에 부착, dragHandleProps 는 LineRow 의 DragHandle 에 전달.
 */
function SortableLineRow(props: {
  line: LineDraft
  lineNumber: number
  selected: boolean
  canDelete: boolean
  onSelect: (s: boolean) => void
  onModelNameChange: (v: string) => void
  onModelNameBlur: (v: string) => void
  onSpecificationChange: (v: string) => void
  onQuantityChange: (v: string) => void
  onUnitPriceChange: (v: string) => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.line.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <LineRow
      ref={setNodeRef}
      style={style}
      isDragging={isDragging}
      lineNumber={props.lineNumber}
      line={props.line}
      selected={props.selected}
      canDelete={props.canDelete}
      onSelect={props.onSelect}
      onModelNameChange={props.onModelNameChange}
      onModelNameBlur={props.onModelNameBlur}
      onSpecificationChange={props.onSpecificationChange}
      onQuantityChange={props.onQuantityChange}
      onUnitPriceChange={props.onUnitPriceChange}
      onDelete={props.onDelete}
      dragHandleProps={{
        attributes: attributes as unknown as Record<string, unknown>,
        listeners: listeners as Record<string, unknown> | undefined,
        setActivatorNodeRef,
      }}
    />
  )
}

/**
 * 출고/입고 공용 작성 화면.
 *
 * mode 별 차이:
 * - OUTBOUND: 출발/도착 창고 + 배송태그, 저장 후 `/sales` 로 이동
 * - INBOUND: 도착 창고 (출발은 거래처 측), 배송태그 미노출, 저장 후 `/purchases` 로 이동
 */
export function SlipFormPage({ mode }: SlipFormPageProps) {
  const navigate = useNavigate()
  const isOutbound = mode === 'OUTBOUND'
  const listPath = isOutbound ? '/sales' : '/purchases'
  const titleLabel = isOutbound ? '새 출고전표' : '새 입고전표'

  // Slice A: AppHeader 동적 화면명 (Designer wireframes.md § 1.3)
  usePageTitle(titleLabel)

  const [sourceWh, setSourceWh] = useState<string | null>(null)
  const [destWh, setDestWh] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState('')
  const [memo, setMemo] = useState('')
  const [tag, setTag] = useState<DeliveryTagOption['code'] | null>(null)
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // link-dispatch-slice 신규 — 기사명 + 기사 휴대폰 (LinkDispatchListPage 자동 그룹의 키)
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')

  // PR-G1 backlog #2 — V16 e-Count 12 컬럼 form state.
  // 거래처 자동 채움 (customerTel/Address/Representative) + 별도 입력 6 + 기간 2 + 분기 2.
  const [partnerCode, setPartnerCode] = useState('')
  const [customerTel, setCustomerTel] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerRepresentative, setCustomerRepresentative] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')
  const [inspectionAddress, setInspectionAddress] = useState('')
  const [receiverPhone, setReceiverPhone] = useState('')
  const [paymentDueLabel, setPaymentDueLabel] = useState('')
  const [discountInfo, setDiscountInfo] = useState('')
  const [collectTerm, setCollectTerm] = useState('')
  const [agreeTerm, setAgreeTerm] = useState('')
  // V20 신규 5필드 form state
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [supervisionAddress, setSupervisionAddress] = useState('')
  const [supervisionSameAsDelivery, setSupervisionSameAsDelivery] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [paymentDueDate, setPaymentDueDate] = useState('')

  // ioType 은 mode 분기 자동 (OUTBOUND="10" / INBOUND="11"), 사용자 toggle 가능.
  const [ioType, setIoType] = useState<string>(isOutbound ? '10' : '11')
  // timeDate 는 BE 가 null 시 서버 시각 자동 채움 — 사용자 명시 입력 옵션 (HHmmss).
  const [timeDate, setTimeDate] = useState('')
  // 자동 채움 상태
  const [autoFillError, setAutoFillError] = useState<string | null>(null)
  const [autoFillLoading, setAutoFillLoading] = useState(false)

  // 재고조회 모달 state
  const [stockModalOpen, setStockModalOpen] = useState(false)
  const [stockRows, setStockRows] = useState<StockBalanceRow[] | null>(null)
  const [stockError, setStockError] = useState<string | null>(null)
  const [stockSelectedSnapshot, setStockSelectedSnapshot] = useState<
    Array<{ productId: string; modelName: string; productName: string }>
  >([])

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // dnd-kit 마우스 + 키보드 sensor (Designer ux-flow.md § 1.2 + § 2.2 인용)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 }, // 4px 이상 드래그 시 시작 (text 선택 보호)
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  /** 창고 컬럼 메타 (재고 모달용) — listWarehouses 결과에서 자동 생성. */
  const warehouseColumns = useMemo<WarehouseColumn[]>(() => {
    const ws = Array.isArray(warehousesQuery.data) ? warehousesQuery.data : []
    return ws.map((w) => ({
      code: w.code,
      label: w.name.length > 6 ? w.name.slice(0, 6) : w.name,
      virtual: w.type === 'VIRTUAL',
    }))
  }, [warehousesQuery.data])

  // ── 라인 조작 핸들러 ─────────────────────────────────────

  const addLine = () => {
    const next = emptyLine()
    setLines((ls) => [...ls, next])
  }

  const removeLine = (id: string) => {
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((l) => l.id !== id)))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const updateLine = (id: string, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const toggleSelect = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (selected) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleAll = (selected: boolean) => {
    if (selected) setSelectedIds(new Set(lines.map((l) => l.id)))
    else setSelectedIds(new Set())
  }

  // dnd-kit drag end 핸들러 — 라인 순서 변경 + selectedIds 유지
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setLines((ls) => {
      const oldIdx = ls.findIndex((l) => l.id === active.id)
      const newIdx = ls.findIndex((l) => l.id === over.id)
      if (oldIdx < 0 || newIdx < 0) return ls
      return arrayMove(ls, oldIdx, newIdx)
    })
  }

  /**
   * 모델명 onBlur lookup — `GET /slips/lookup-product?modelName=...`.
   *
   * 200 시 productId / productName / sellingPrice fill,
   * 404 시 lookupError 메시지 + productId null 유지.
   */
  const handleModelNameBlur = async (id: string, modelName: string) => {
    const trimmed = modelName.trim()
    if (!trimmed) {
      updateLine(id, { productId: null, lookupError: null, productName: '' })
      return
    }
    updateLine(id, { lookupLoading: true, lookupError: null })
    try {
      const product = await lookupProductByModelName(trimmed)
      updateLine(id, {
        productId: product.productId,
        productName: product.productName,
        unitPrice: product.sellingPrice,
        lookupError: null,
        lookupLoading: false,
      })
    } catch (err) {
      const msg = axios.isAxiosError(err) && err.response?.status === 404
        ? '해당 모델명을 찾을 수 없습니다'
        : '모델명 조회에 실패했습니다'
      updateLine(id, {
        productId: null,
        productName: '',
        lookupError: msg,
        lookupLoading: false,
      })
    }
  }

  // ── PR-G1 backlog #2 — 거래처 자동 채움 (partner-service lookup) ──

  /**
   * partnerCode 입력 후 "거래처 자동 채움" 버튼 클릭 시 호출.
   *
   * `GET /admin/partners/{partnerCode}` → name/phone/address/representative 200 응답.
   * 200 시 customerTel/customerAddress/customerRepresentative + partnerName 자동 fill.
   * 사용자가 채워진 후 자유롭게 수정 가능 (snapshot).
   * 404 시 autoFillError 표시 — partner strict validation 정책에 따라 BE 가 발행 거부함.
   */
  const handlePartnerAutoFill = async () => {
    const trimmed = partnerCode.trim()
    if (!trimmed) {
      setAutoFillError('거래처 코드를 먼저 입력하세요')
      return
    }
    setAutoFillLoading(true)
    setAutoFillError(null)
    try {
      const partner = await lookupPartnerForAutoFill(trimmed)
      setPartnerName(partner.name)
      if (partner.phone) setCustomerTel(partner.phone)
      if (partner.address) setCustomerAddress(partner.address)
      if (partner.representative) setCustomerRepresentative(partner.representative)
    } catch (err) {
      const msg = axios.isAxiosError(err) && err.response?.status === 404
        ? `거래처 코드 '${trimmed}' 를 찾을 수 없습니다. 먼저 partner-service 에 등록하세요.`
        : '거래처 자동 채움에 실패했습니다.'
      setAutoFillError(msg)
    } finally {
      setAutoFillLoading(false)
    }
  }

  // ── 재고조회 mutation ───────────────────────────────────

  const stockMutation = useMutation({
    mutationFn: (lines: StockBalanceLookupLine[]) =>
      fetchStockBalanceBatch(lines),
    onMutate: () => {
      setStockRows(null)
      setStockError(null)
    },
    onSuccess: (data) => {
      setStockRows(data.rows as StockBalanceRow[])
    },
    onError: () => {
      setStockError('재고 조회에 실패했습니다. 다시 시도해 주세요.')
      setStockRows([])
    },
  })

  const selectedProductLines = useMemo(() => {
    return lines
      .filter((l) => selectedIds.has(l.id) && l.productId)
      .map((l) => ({
        productId: l.productId!,
        modelName: l.modelName,
        productName: l.productName,
      }))
  }, [lines, selectedIds])

  const openStockModal = () => {
    if (selectedProductLines.length === 0) return
    setStockSelectedSnapshot(selectedProductLines)
    setStockModalOpen(true)
    stockMutation.mutate(selectedProductLines)
  }

  const closeStockModal = () => setStockModalOpen(false)

  // ── 합계 계산 (Designer components.md § 6.2 인용) ──────

  const totals = useMemo(() => {
    const valid = lines.filter((l) => l.productId && Number(l.quantity) > 0)
    const supply = valid.reduce(
      (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice || 0),
      0,
    )
    const vat = Math.round(supply * 0.1)
    return { count: valid.length, supply, vat, total: supply + vat }
  }, [lines])

  // ── 저장 mutation ───────────────────────────────────────

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Parameters<typeof createSlip>[0] = {
        slipType: mode,
        slipDate: today,
        sourceWarehouseId: sourceWh ?? undefined,
        destinationWarehouseId: destWh ?? undefined,
        partnerName: partnerName.trim() || undefined,
        deliveryTag: isOutbound ? tag ?? undefined : undefined,
        memo: memo.trim() || undefined,
        // link-dispatch-slice — OUTBOUND 만 driver 정보 송신
        driverName: isOutbound && driverName.trim() ? driverName.trim() : undefined,
        driverPhone: isOutbound && driverPhone ? driverPhone : undefined,
        // PR-G1 backlog #2 — V16 e-Count 12 컬럼 송신 (모두 옵션, 빈 값은 undefined).
        ioType: ioType || undefined,
        timeDate: timeDate.trim() || undefined,
        customerTel: customerTel.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        customerRepresentative: customerRepresentative.trim() || undefined,
        shippingAddress: shippingAddress.trim() || undefined,
        inspectionAddress: inspectionAddress.trim() || undefined,
        receiverPhone: receiverPhone.trim() || undefined,
        paymentDueLabel: paymentDueLabel.trim() || undefined,
        discountInfo: discountInfo.trim() || undefined,
        collectTerm: collectTerm.trim() || undefined,
        agreeTerm: agreeTerm.trim() || undefined,
        // V20 신규 5필드
        deliveryAddress: deliveryAddress.trim() || undefined,
        supervisionAddress: supervisionSameAsDelivery
          ? (deliveryAddress.trim() || undefined)
          : (supervisionAddress.trim() || undefined),
        projectName: projectName.trim() || undefined,
        recipientPhone: recipientPhone.trim() || undefined,
        paymentDueDate: paymentDueDate || undefined,
        lines: lines
          .filter((l) => l.productId && Number(l.quantity) > 0)
          .map<SlipLineInput>((l) => ({
            productId: l.productId!,
            productName: l.productName.trim() || undefined,
            modelName: l.modelName.trim() || undefined,
            specification: l.specification.trim() || undefined,
            quantity: Number(l.quantity),
            unitPrice: l.unitPrice || '0',
          })),
      }
      return createSlip(payload)
    },
    onSuccess: () => navigate(listPath),
  })

  const errorMessage = (() => {
    if (!mutation.isError) return null
    const err = mutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '전표 생성에 실패했습니다.'
    }
    return '알 수 없는 오류'
  })()

  const validLineCount = lines.filter(
    (l) => l.productId && Number(l.quantity) > 0,
  ).length
  const requiredWh = isOutbound ? sourceWh : destWh
  const canSubmit = !!requiredWh && validLineCount > 0 && !mutation.isPending

  // ── Header 체크박스 상태 ────────────────────────────────

  const allSelected = selectedIds.size === lines.length && lines.length > 0
  const someSelected = selectedIds.size > 0 && selectedIds.size < lines.length

  const stockButtonLabel =
    selectedProductLines.length === 0
      ? '재고조회'
      : selectedProductLines.length === 1
        ? '재고조회'
        : `선택 항목 재고조회 (${selectedProductLines.length}건)`

  // ── render ──────────────────────────────────────────────

  return (
    <div className="sales-form-polish">
      <div className="sfp-page-header">
        <h2 className="sfp-page-title">{titleLabel}</h2>
        <div className="sfp-page-actions">
          <Button variant="ghost" onClick={() => navigate(listPath)}>
            목록으로
          </Button>
        </div>
      </div>

      {/* 헤더 정보 카드 */}
      <Card padding={6} shadow="sm" className="sfp-card">
        <div className="sfp-section-title">헤더 정보</div>
        <div className="sfp-form-grid sfp-form-grid--3">
          <WarehouseSelector
            label={isOutbound ? '출발 창고' : '입고 창고'}
            required={isOutbound}
            warehouses={Array.isArray(warehousesQuery.data) ? warehousesQuery.data : []}
            value={sourceWh}
            onChange={(id) => setSourceWh(id)}
            hideVirtual
          />
          <WarehouseSelector
            label={isOutbound ? '도착 창고' : '출발 창고 (옵션)'}
            required={!isOutbound}
            warehouses={Array.isArray(warehousesQuery.data) ? warehousesQuery.data : []}
            value={destWh}
            onChange={(id) => setDestWh(id)}
            hideVirtual
          />
          {isOutbound ? (
            <DeliveryTagSelector
              options={OUTBOUND_TAG_OPTIONS}
              value={tag}
              onChange={(code) => setTag(code)}
              direction="OUTBOUND"
              slipDate={today}
            />
          ) : (
            <span aria-hidden="true" />
          )}
        </div>

        <div className="sfp-form-grid sfp-form-grid--2" style={{ marginTop: 16 }}>
          <FormField
            label="거래처명"
            render={({ id }) => (
              <input
                id={id}
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                maxLength={100}
                className="sfp-input"
              />
            )}
          />
          <FormField
            label="메모"
            render={({ id }) => (
              <input
                id={id}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                maxLength={1000}
                className="sfp-input"
              />
            )}
          />
        </div>

        {/*
          link-dispatch-slice 신규: 기사명 + 기사 휴대폰 (OUTBOUND 만)
          LinkDispatchListPage 자동 그룹의 키 (기사명 + 배송일자) 가 된다.
        */}
        {isOutbound ? (
          <div className="sfp-form-grid sfp-form-grid--driver" style={{ marginTop: 16 }}>
            <FormField
              label="기사명"
              hint="배송 기사 이름 (자동 그룹 키)"
              render={({ id }) => (
                <input
                  id={id}
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  maxLength={50}
                  className="sfp-input"
                  placeholder="예: 홍길동"
                />
              )}
            />
            <PhoneInput
              label="기사 연락처"
              helperText="010-0000-0000 (자동 하이픈)"
              value={driverPhone}
              onChange={setDriverPhone}
              error={
                driverPhone && !KOREAN_MOBILE_PHONE_PATTERN.test(driverPhone)
                  ? '올바른 휴대폰 번호 형식이 아닙니다'
                  : undefined
              }
            />
          </div>
        ) : null}
      </Card>

      {/*
        PR-G1 backlog #2 — V16 e-Count 12 컬럼 입력 카드.
        거래처 자동 채움 + 자동 채움 후 수동 수정 가능 + 별도 입력 6 + 결제/할인/약정 4.
      */}
      <Card padding={6} shadow="sm" className="sfp-card">
        <div className="sfp-section-title">거래 명세 정보 (e-Count 12 필드)</div>

        {/* 거래처 코드 + 자동 채움 버튼 */}
        <div className="sfp-form-grid sfp-form-grid--2" style={{ marginTop: 8 }}>
          <FormField
            label="거래처 코드"
            hint="입력 후 '거래처 자동 채움' 버튼으로 연락처/주소/대표자 채우기"
            render={({ id }) => (
              <input
                id={id}
                value={partnerCode}
                onChange={(e) => setPartnerCode(e.target.value)}
                maxLength={100}
                className="sfp-input"
                placeholder="예: CUST-0001"
                data-testid="slip-form-partner-code"
              />
            )}
          />
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handlePartnerAutoFill()}
              loading={autoFillLoading}
              disabled={!partnerCode.trim() || autoFillLoading}
              data-testid="slip-form-partner-autofill-btn"
            >
              거래처 자동 채움
            </Button>
          </div>
        </div>

        {autoFillError ? (
          <div className="sfp-error-banner" role="alert" style={{ marginTop: 8 }}>
            <span aria-hidden="true">ⓘ</span>
            <span>{autoFillError}</span>
          </div>
        ) : null}

        {/* 거래처 snapshot 3 (자동 채움 + 수정 가능) */}
        <div className="sfp-form-grid sfp-form-grid--3" style={{ marginTop: 16 }}>
          <FormField
            label="거래처 연락처"
            render={({ id }) => (
              <input
                id={id}
                value={customerTel}
                onChange={(e) => setCustomerTel(e.target.value)}
                maxLength={100}
                className="sfp-input"
                placeholder="자동 채움 후 수정 가능"
                data-testid="slip-form-customer-tel"
              />
            )}
          />
          <FormField
            label="거래처 사업장 주소"
            render={({ id }) => (
              <input
                id={id}
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                maxLength={200}
                className="sfp-input"
                placeholder="자동 채움 후 수정 가능"
                data-testid="slip-form-customer-address"
              />
            )}
          />
          <FormField
            label="거래처 대표자"
            render={({ id }) => (
              <input
                id={id}
                value={customerRepresentative}
                onChange={(e) => setCustomerRepresentative(e.target.value)}
                maxLength={100}
                className="sfp-input"
                placeholder="자동 채움 후 수정 가능"
                data-testid="slip-form-customer-representative"
              />
            )}
          />
        </div>

        {/* 배송지 / 검수지 / 수령자 (별도 입력 3) */}
        <div className="sfp-form-grid sfp-form-grid--3" style={{ marginTop: 16 }}>
          <FormField
            label="배송지 주소"
            hint="배송 도착지 (필수 권장)"
            render={({ id }) => (
              <input
                id={id}
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                maxLength={500}
                className="sfp-input"
                data-testid="slip-form-shipping-address"
              />
            )}
          />
          <FormField
            label="검수지 주소"
            hint="검수자 사무실 (배송 도착지와 다른 경우)"
            render={({ id }) => (
              <input
                id={id}
                value={inspectionAddress}
                onChange={(e) => setInspectionAddress(e.target.value)}
                maxLength={500}
                className="sfp-input"
                data-testid="slip-form-inspection-address"
              />
            )}
          />
          <FormField
            label="수령자 연락처"
            hint="현장 수령자 직접 연락처"
            render={({ id }) => (
              <input
                id={id}
                value={receiverPhone}
                onChange={(e) => setReceiverPhone(e.target.value)}
                maxLength={100}
                className="sfp-input"
                data-testid="slip-form-receiver-phone"
              />
            )}
          />
        </div>

        {/* 결제/할인 (2) */}
        <div className="sfp-form-grid sfp-form-grid--2" style={{ marginTop: 16 }}>
          <FormField
            label="결제 만기"
            hint="MM-DD 또는 '익월말' / '월말' 등 라벨"
            render={({ id }) => (
              <input
                id={id}
                value={paymentDueLabel}
                onChange={(e) => setPaymentDueLabel(e.target.value)}
                maxLength={200}
                className="sfp-input"
                placeholder="예: 06-30 또는 익월말"
                data-testid="slip-form-payment-due-label"
              />
            )}
          />
          <FormField
            label="할인 정보"
            render={({ id }) => (
              <textarea
                id={id}
                value={discountInfo}
                onChange={(e) => setDiscountInfo(e.target.value)}
                maxLength={200}
                rows={2}
                className="sfp-input"
                placeholder="예: 5% 할인 / 정가 / 특가 등"
                data-testid="slip-form-discount-info"
              />
            )}
          />
        </div>

        {/* 회수/약정 (2) — 자유 입력 */}
        <div className="sfp-form-grid sfp-form-grid--2" style={{ marginTop: 16 }}>
          <FormField
            label="대금 회수 조건"
            hint="월말 / 익월말 / 현금 등"
            render={({ id }) => (
              <input
                id={id}
                value={collectTerm}
                onChange={(e) => setCollectTerm(e.target.value)}
                maxLength={100}
                className="sfp-input"
                placeholder="예: 월말"
                data-testid="slip-form-collect-term"
              />
            )}
          />
          <FormField
            label="거래 약정"
            render={({ id }) => (
              <input
                id={id}
                value={agreeTerm}
                onChange={(e) => setAgreeTerm(e.target.value)}
                maxLength={100}
                className="sfp-input"
                data-testid="slip-form-agree-term"
              />
            )}
          />
        </div>

        {/* ioType + timeDate (분기/시간) */}
        <div className="sfp-form-grid sfp-form-grid--2" style={{ marginTop: 16 }}>
          <FormField
            label="입출고 분기 (io_type)"
            hint="'10'=출고 / '11'=입고. 페이지 분기로 자동 설정"
            render={({ id }) => (
              <select
                id={id}
                value={ioType}
                onChange={(e) => setIoType(e.target.value)}
                className="sfp-input"
                data-testid="slip-form-io-type"
              >
                <option value="10">10 (출고)</option>
                <option value="11">11 (입고)</option>
              </select>
            )}
          />
          <FormField
            label="발행 시각 (HHmmss)"
            hint="비워두면 BE 가 서버 시각 자동 채움"
            render={({ id }) => (
              <input
                id={id}
                value={timeDate}
                onChange={(e) => setTimeDate(e.target.value)}
                maxLength={10}
                className="sfp-input"
                placeholder="예: 143025 (자동)"
                data-testid="slip-form-time-date"
              />
            )}
          />
        </div>
      </Card>

      {/*
        V20 신규 5필드 입력 카드 — 배송주소 / 감리주소 / 프로젝트명 / 인수자 번호 / 입금예정일.
        BE V20__add_slip_v20_fields.sql 컬럼과 1:1 대응 (모두 옵션).
        UUID 비공개 가드: 거래처 businessNumber 는 자동 표시 전용, 사용자 직접 입력 X.
      */}
      <Card padding={6} shadow="sm" className="sfp-card">
        <div className="sfp-section-title">배송 정보 (V20)</div>

        {/* 배송주소 + 거래처 주소 복사 버튼 */}
        <div className="sfp-form-grid sfp-form-grid--2" style={{ marginTop: 8 }}>
          <FormField
            label="배송주소"
            hint="배송 현장 주소 (최대 500자)"
            render={({ id }) => (
              <input
                id={id}
                value={deliveryAddress}
                onChange={(e) => {
                  setDeliveryAddress(e.target.value)
                  if (supervisionSameAsDelivery) {
                    setSupervisionAddress(e.target.value)
                  }
                }}
                maxLength={500}
                className="sfp-input"
                placeholder="예: 서울특별시 강남구 테헤란로 152"
                data-testid="slip-form-delivery-address"
              />
            )}
          />
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (customerAddress.trim()) {
                  setDeliveryAddress(customerAddress.trim())
                  if (supervisionSameAsDelivery) {
                    setSupervisionAddress(customerAddress.trim())
                  }
                }
              }}
              disabled={!customerAddress.trim()}
              data-testid="slip-form-copy-customer-address-btn"
            >
              거래처 주소 복사
            </Button>
          </div>
        </div>

        {/* 감리주소 + "배송주소와 동일" 체크박스 */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>감리주소</label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                color: 'var(--color-neutral-600)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={supervisionSameAsDelivery}
                onChange={(e) => {
                  setSupervisionSameAsDelivery(e.target.checked)
                  if (e.target.checked) {
                    setSupervisionAddress(deliveryAddress)
                  }
                }}
                data-testid="slip-form-supervision-same-checkbox"
              />
              배송주소와 동일
            </label>
          </div>
          <input
            value={supervisionSameAsDelivery ? deliveryAddress : supervisionAddress}
            onChange={(e) => {
              if (!supervisionSameAsDelivery) {
                setSupervisionAddress(e.target.value)
              }
            }}
            disabled={supervisionSameAsDelivery}
            maxLength={500}
            className="sfp-input"
            style={{ width: '100%', opacity: supervisionSameAsDelivery ? 0.6 : 1 }}
            placeholder="감리 현장 주소 (배송주소와 다를 경우)"
            data-testid="slip-form-supervision-address"
          />
        </div>

        {/* 프로젝트명 / 인수자 번호 / 입금예정일 */}
        <div className="sfp-form-grid sfp-form-grid--3" style={{ marginTop: 16 }}>
          <FormField
            label="프로젝트명"
            render={({ id }) => (
              <input
                id={id}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                maxLength={200}
                className="sfp-input"
                placeholder="예: 강남 오피스텔 A동 공조 설치"
                data-testid="slip-form-project-name"
              />
            )}
          />
          <FormField
            label="인수자 번호"
            hint="010-1234-5678 형식"
            render={({ id }) => (
              <input
                id={id}
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                maxLength={20}
                className="sfp-input"
                placeholder="010-0000-0000"
                data-testid="slip-form-recipient-phone"
              />
            )}
          />
          <FormField
            label="입금예정일"
            render={({ id }) => (
              <input
                id={id}
                type="date"
                value={paymentDueDate}
                onChange={(e) => setPaymentDueDate(e.target.value)}
                className="sfp-input"
                data-testid="slip-form-payment-due-date"
              />
            )}
          />
        </div>
      </Card>

      {/* 라인 카드 */}
      <Card padding={6} shadow="sm" className="sfp-card">
        <div className="sfp-line-toolbar">
          <div className="sfp-section-title">전표 라인</div>
          <div className="sfp-line-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={openStockModal}
              disabled={selectedProductLines.length === 0}
            >
              {stockButtonLabel}
            </Button>
            <Button variant="primary" size="sm" onClick={addLine}>
              + 라인 추가
            </Button>
          </div>
        </div>

        <div className="sfp-line-table">
          <LineTableHeader
            allSelected={allSelected}
            someSelected={someSelected}
            onToggleAll={toggleAll}
          />
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={lines.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {lines.map((line, idx) => (
                <SortableLineRow
                  key={line.id}
                  line={line}
                  lineNumber={idx + 1}
                  selected={selectedIds.has(line.id)}
                  canDelete={lines.length > 1}
                  onSelect={(s) => toggleSelect(line.id, s)}
                  onModelNameChange={(v) => updateLine(line.id, { modelName: v })}
                  onModelNameBlur={(v) => void handleModelNameBlur(line.id, v)}
                  onSpecificationChange={(v) => updateLine(line.id, { specification: v })}
                  onQuantityChange={(v) => updateLine(line.id, { quantity: v })}
                  onUnitPriceChange={(v) => updateLine(line.id, { unitPrice: v })}
                  onDelete={() => removeLine(line.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* 합계 영역 (Designer wireframes.md § 1.1 인용) */}
        <div className="sfp-totals">
          <span className="sfp-totals-item">
            <span className="sfp-totals-label">합계</span>
            <span className="sfp-totals-value">{totals.count}건</span>
          </span>
          <span className="sfp-totals-divider" aria-hidden="true">|</span>
          <span className="sfp-totals-item">
            <span className="sfp-totals-label">공급가액</span>
            <span className="sfp-totals-value sfp-totals-num">
              ₩{totals.supply.toLocaleString()}
            </span>
          </span>
          <span className="sfp-totals-divider" aria-hidden="true">|</span>
          <span className="sfp-totals-item">
            <span className="sfp-totals-label">부가세</span>
            <span className="sfp-totals-value sfp-totals-num">
              ₩{totals.vat.toLocaleString()}
            </span>
          </span>
          <span className="sfp-totals-divider" aria-hidden="true">|</span>
          <span className="sfp-totals-item sfp-totals-item--strong">
            <span className="sfp-totals-label">총</span>
            <span className="sfp-totals-value sfp-totals-num">
              ₩{totals.total.toLocaleString()}
            </span>
          </span>
        </div>

        {errorMessage ? (
          <div className="sfp-error-banner" role="alert">
            <span aria-hidden="true">ⓘ</span>
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <div className="sfp-submit-bar">
          <Button variant="ghost" onClick={() => navigate(listPath)}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!canSubmit}
          >
            저장
          </Button>
        </div>
      </Card>

      {/* 재고조회 모달 */}
      <StockBalanceModal
        open={stockModalOpen}
        onClose={closeStockModal}
        selectedLines={stockSelectedSnapshot}
        warehouseColumns={warehouseColumns}
        rows={stockRows}
        error={stockError}
      />
    </div>
  )
}
