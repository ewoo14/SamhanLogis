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
 * - 헤더에 [선택 항목 재고조회] 버튼 — 가용/실/예약 재고 모달
 * - `<InventoryLookupModal>` 모달 (모델명 × 창고 matrix)
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
import { useMemo, useState, type ReactNode } from 'react'
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
  PartnerAutocomplete,
  PhoneInput,
  ProductAutocomplete,
  WarehouseAutocomplete,
  type BundleSetOptions,
  type DeliveryTagOption,
  type LineDraft,
  type PartnerOption,
  type ProductOption,
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
  listWarehouses,
  type StockBalanceLookupLine,
} from '../api/inventory'
import {
  createSlip,
  lookupPartnerForAutoFill,
  emptyBundleSetOptions,
  toApiBundleSetOptions,
  type SlipLineInput,
  type SlipType,
} from '../api/slip'
import { searchProducts as searchProductsApi } from '../api/productApi'
import { searchPartners as searchPartnersApi } from '../api/partnerApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { InventoryLookupModal } from './components/InventoryLookupModal'
import { BundleOptionRow } from './components/BundleOptionRow'

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
  productType: null,
  modelCode: null,
  setOptions: emptyBundleSetOptions(),
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
  /** AC-2: 모델명 셀 커스텀 렌더 slot (ProductAutocomplete 주입). */
  modelCell?: ReactNode
  /**
   * 라인 하단 부가 행 slot (세트 옵션 picker 등). sortable wrapper 내부에 렌더되어
   * 드래그 transform 이 라인+footer 를 하나로 이동시킨다(분리 방지).
   */
  footer?: ReactNode
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

  // setNodeRef/transform 을 wrapper 에 부착 → LineRow + footer(옵션 picker) 동시 이동.
  return (
    <div ref={setNodeRef} style={style}>
      <LineRow
        isDragging={isDragging}
        vatInclusive
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
        modelCell={props.modelCell}
        dragHandleProps={{
          attributes: attributes as unknown as Record<string, unknown>,
          listeners: listeners as Record<string, unknown> | undefined,
          setActivatorNodeRef,
        }}
      />
      {props.footer}
    </div>
  )
}

/**
 * 출고/입고 공용 작성 화면.
 *
 * mode 별 차이 (출고전표 폼 정비 반영):
 * - OUTBOUND: 출고 창고 1개 + 출고구분(배송태그), 저장 후 `/sales` 로 이동
 * - INBOUND: 입고 창고 1개, 출고구분 미노출, 저장 후 `/purchases` 로 이동
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

  // AC-3: 거래처 자동완성 선택 상태 (PartnerAutocomplete controlled value)
  const [selectedPartner, setSelectedPartner] = useState<PartnerOption | null>(null)

  // 거래처 snapshot — 자동완성 선택 시 채워짐(폼 미표시, 전표 기록/주소복사용).
  // eCount 12필드 입력 카드는 출고전표 폼 정비로 제거(ioType/timeDate/검수지/결제·할인·약정 등).
  const [customerTel, setCustomerTel] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerRepresentative, setCustomerRepresentative] = useState('')
  // 배송 정보 — 배송주소 / 감리주소 (V20 중 프로젝트명·인수자번호·입금예정일은 정비로 제거)
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [supervisionAddress, setSupervisionAddress] = useState('')
  const [supervisionSameAsDelivery, setSupervisionSameAsDelivery] = useState(false)
  // 자동 채움 상태
  const [autoFillError, setAutoFillError] = useState<string | null>(null)
  const [autoFillLoading, setAutoFillLoading] = useState(false)

  // 재고조회 모달 state — 신 InventoryLookupModal 은 자체 페치(useQuery).
  // 스냅샷은 모달 열린 채 라인 편집 시 표 흔들림 방지용으로 유지.
  const [stockModalOpen, setStockModalOpen] = useState(false)
  const [stockSelectedSnapshot, setStockSelectedSnapshot] = useState<
    StockBalanceLookupLine[]
  >([])
  /** 세트 전용 안내 스냅샷 (모달 열릴 때 확정) — §2-2 세트 재고 가드. */
  const [stockBundleOnlySnapshot, setStockBundleOnlySnapshot] = useState(false)
  /** 혼합 선택 시 제외된 세트 건수 스냅샷 (모달 열릴 때 확정) — P2-3 혼합선택 무고지 방지. */
  const [stockExcludedBundleSnapshot, setStockExcludedBundleSnapshot] = useState(0)

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

  const updateSetOption = (id: string, patch: Partial<BundleSetOptions>) =>
    setLines((ls) =>
      ls.map((l) =>
        l.id === id
          ? { ...l, setOptions: { ...(l.setOptions ?? emptyBundleSetOptions()), ...patch } }
          : l,
      ),
    )

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
   * 모델명 onBlur — AC-2 이후 모든 라인이 `modelCell` 슬롯의 `ProductAutocomplete` 로 대체됨.
   *
   * LineRow backward-compat 유지를 위해 prop 으로 전달하지만
   * `modelCell` 제공 시 LineRow 가 기존 input 을 렌더하지 않으므로 실제 호출되지 않는다.
   *
   * @deprecated AC-2 이후 미사용. modelCell=ProductAutocomplete 로 대체.
   */
  const handleModelNameBlur = (_id: string, _modelName: string): void => {
    // no-op: AC-2 ProductAutocomplete 가 onChange 로 updateLine 직접 호출
  }

  // ── AC-3: PartnerAutocomplete onChange 핸들러 ────────────────────────────────

  /**
   * AC-3 거래처 자동완성 선택 핸들러 — 2단계 채움.
   *
   * 1단계: 검색 summary(PartnerOption)로 partnerCode/partnerName/customerTel 즉시 fill.
   * 2단계: GET /admin/partners/{partnerCode} → customerAddress/customerRepresentative 보강.
   *        (기존 handlePartnerAutoFill 로직 재사용 — address/representative 는 search 응답에 없음)
   *
   * partner=null(해제) 시 관련 필드 클리어.
   */
  const handlePartnerAutocompleteChange = async (
    partner: PartnerOption | null,
  ) => {
    setSelectedPartner(partner)

    if (!partner) {
      // 선택 해제 — 관련 필드 클리어
      setPartnerName('')
      setCustomerTel('')
      setCustomerAddress('')
      setCustomerRepresentative('')
      setAutoFillError(null)
      return
    }

    // 1단계: search summary 즉시 fill
    setPartnerName(partner.name)
    setCustomerTel(partner.phone ?? '')

    // 2단계: detail fetch → address/representative 보강 (기존 handlePartnerAutoFill 로직 재사용)
    setAutoFillLoading(true)
    setAutoFillError(null)
    try {
      const detail = await lookupPartnerForAutoFill(partner.partnerCode)
      if (detail.address) setCustomerAddress(detail.address)
      if (detail.representative) setCustomerRepresentative(detail.representative)
      // phone/name 은 summary 기준 우선, detail 로 보강
      if (!partner.phone && detail.phone) setCustomerTel(detail.phone)
    } catch (err) {
      const msg =
        axios.isAxiosError(err) && err.response?.status === 404
          ? `거래처 코드 '${partner.partnerCode}' 상세 정보를 찾을 수 없습니다.`
          : '거래처 상세 정보 조회에 실패했습니다.'
      setAutoFillError(msg)
    } finally {
      setAutoFillLoading(false)
    }
  }

  /** 선택된 라인 중 productId 가 있는 전체 라인 (BUNDLE 포함). */
  const selectedProductLines = useMemo(() => {
    return lines
      .filter((l) => selectedIds.has(l.id) && l.productId)
      .map((l) => ({
        productId: l.productId!,
        modelName: l.modelName,
        productName: l.productName,
        productType: l.productType ?? null,
      }))
  }, [lines, selectedIds])

  /**
   * 세트 재고 가드 (§2-2): BUNDLE 라인은 재고조회 대상 제외.
   * 선택 라인이 전부 BUNDLE 인 경우 bundleOnlyLines=true 로 모달에 안내 표시.
   */
  const nonBundleLookupLines = useMemo(
    () =>
      selectedProductLines
        .filter((l) => l.productType !== 'BUNDLE')
        .map(({ productId, modelName, productName }) => ({ productId, modelName, productName })),
    [selectedProductLines],
  )

  const allSelectedAreBundle =
    selectedProductLines.length > 0 &&
    selectedProductLines.every((l) => l.productType === 'BUNDLE')

  /** 선택 라인 중 세트(BUNDLE) 건수 — 혼합 선택 시 제외 고지에 사용 (P2-3). */
  const selectedBundleCount = useMemo(
    () => selectedProductLines.filter((l) => l.productType === 'BUNDLE').length,
    [selectedProductLines],
  )

  const openStockModal = () => {
    if (selectedProductLines.length === 0) return
    setStockSelectedSnapshot(nonBundleLookupLines)
    setStockBundleOnlySnapshot(allSelectedAreBundle)
    // 전부 세트면 bundleOnlyLines 안내가 표시되므로 혼합 캡션은 0 으로 둔다.
    setStockExcludedBundleSnapshot(allSelectedAreBundle ? 0 : selectedBundleCount)
    setStockModalOpen(true)
  }

  const closeStockModal = () => setStockModalOpen(false)

  // ── 합계 계산 (Designer components.md § 6.2 인용) ──────

  const totals = useMemo(() => {
    // 단가 부가세포함(라인 단위 eCount): 라인별 합계(VAT포함)=round(수량×단가),
    // 공급가액=round(합계/1.1), 부가세=차액 → 라인별 반올림 후 합산(BE 와 동일).
    const valid = lines.filter((l) => l.productId && Number(l.quantity) > 0)
    let supply = 0
    let total = 0
    for (const l of valid) {
      const incl = Math.round(Number(l.quantity) * Number(l.unitPrice || 0))
      const lineSupply = Math.round(incl / 1.1)
      supply += lineSupply
      total += incl
    }
    return { count: valid.length, supply, vat: total - supply, total }
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
        // 거래처 snapshot — 자동완성 선택 시 채워짐(폼 표시 X, 전표 기록용). ioType 는
        // 내부 코드라 BE 가 slipType 으로 자동 분기(미전송).
        customerTel: customerTel.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        customerRepresentative: customerRepresentative.trim() || undefined,
        // 배송 정보 — 배송주소 / 감리주소(배송주소와 동일 체크 시 복사)
        deliveryAddress: deliveryAddress.trim() || undefined,
        supervisionAddress: supervisionSameAsDelivery
          ? (deliveryAddress.trim() || undefined)
          : (supervisionAddress.trim() || undefined),
        lines: lines
          .filter((l) => l.productId && Number(l.quantity) > 0)
          .map<SlipLineInput>((l) => ({
            productId: l.productId!,
            productName: l.productName.trim() || undefined,
            modelName: l.modelName.trim() || undefined,
            specification: l.specification.trim() || undefined,
            quantity: Number(l.quantity),
            unitPrice: l.unitPrice || '0',
            setOptions: toApiBundleSetOptions(l.productType, l.setOptions),
            // 단가 부가세포함 — BE 가 라인 단위로 공급가액/부가세 분리(eCount 방식)
            priceVatInclusive: true,
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
        <div className="sfp-form-grid sfp-form-grid--2">
          {/*
            출고전표는 '출고 창고' 1개, 입고전표는 '입고 창고' 1개만 입력(도착 창고 제거).
            OUTBOUND: 출고지=sourceWh / INBOUND: 입고지=destWh (requiredWh 와 일치).
          */}
          {isOutbound ? (
            <WarehouseAutocomplete
              label="출고 창고"
              required
              warehouses={Array.isArray(warehousesQuery.data) ? warehousesQuery.data : []}
              value={sourceWh}
              onChange={(id) => setSourceWh(id)}
              placeholder={warehousesQuery.isLoading ? '창고 목록 불러오는 중…' : '창고 코드 또는 이름 입력…'}
              hideVirtual
            />
          ) : (
            <WarehouseAutocomplete
              label="입고 창고"
              required
              warehouses={Array.isArray(warehousesQuery.data) ? warehousesQuery.data : []}
              value={destWh}
              onChange={(id) => setDestWh(id)}
              placeholder={warehousesQuery.isLoading ? '창고 목록 불러오는 중…' : '창고 코드 또는 이름 입력…'}
              hideVirtual
            />
          )}
          {isOutbound ? (
            <DeliveryTagSelector
              label="출고구분"
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

        {/*
          AC-3: 거래처 선택은 PartnerAutocomplete 단일 경로.
          기존 수동 '거래처명' FormField/input 제거 — P0 D-AC3-01 수정.
          partnerName state 는 PartnerAutocomplete onChange(handlePartnerAutocompleteChange)
          에서만 setPartnerName 을 호출하며, createSlip payload 의 partnerName 으로 전달됨.
          partnerCode 는 BE CreateSlipRequest 에 필드 없음(partnerId=UUID만 존재) —
          partnerName/customerTel/Address/Representative denormalize 전송이 설계 의도.
          회귀 아님: 기존 수동 input 도 partnerCode 를 payload 에 전송한 적 없음.
        */}
        <div style={{ marginTop: 16 }}>
          <PartnerAutocomplete
            value={selectedPartner}
            onChange={(p) => { void handlePartnerAutocompleteChange(p) }}
            searchPartners={searchPartnersApi}
            label="거래처"
            placeholder="거래처명 또는 코드 입력…"
            ariaLabel="거래처 자동완성"
            disabled={autoFillLoading}
          />
          {autoFillError ? (
            <div className="sfp-error-banner" role="alert" style={{ marginTop: 8 }}>
              <span aria-hidden="true">ⓘ</span>
              <span>{autoFillError}</span>
            </div>
          ) : null}
        </div>

        <div className="sfp-form-grid sfp-form-grid--1" style={{ marginTop: 16 }}>
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
        배송 정보 — 배송주소 / 감리주소. (출고전표 폼 정비: eCount 12필드 카드 제거 +
        프로젝트명/인수자번호/입금예정일 제거. businessNumber 는 partnerId 로 BE 자동 resolve.)
      */}
      <Card padding={6} shadow="sm" className="sfp-card">
        <div className="sfp-section-title">배송 정보</div>

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

      </Card>

      {/* 라인 카드 */}
      <Card padding={6} shadow="sm" className="sfp-card">
        <div className="sfp-line-toolbar">
          <div className="sfp-section-title">
            전표 라인
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-secondary, #5C6773)', marginLeft: 8 }}>
              단가는 <b>부가세 포함</b> 단가 — 공급가액/부가세는 라인별 자동 분리
            </span>
          </div>
          <div className="sfp-line-actions">
            <Button
              variant="secondary"
              size="sm"
              data-testid="slip-form-inventory-lookup-btn"
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
              {lines.map((line, idx) => {
                /**
                 * AC-2: 현재 라인의 ProductOption 재구성.
                 * productId / modelName / productName 이 모두 있으면 value 전달, 없으면 null.
                 * UUID 비공개 가드: id 는 내부 state 전용, 화면 노출 X.
                 */
                const lineProductValue: ProductOption | null =
                  line.productId && line.modelName
                    ? {
                        id: line.productId,
                        modelName: line.modelName,
                        productName: line.productName,
                      }
                    : null

                const isBundle = line.productType === 'BUNDLE'
                return (
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
                    modelCell={
                      <ProductAutocomplete
                        value={lineProductValue}
                        onChange={(p) =>
                          updateLine(line.id, {
                            productId: p?.id ?? null,
                            modelName: p?.modelName ?? '',
                            productName: p?.productName ?? '',
                            unitPrice:
                              p?.sellingPrice != null
                                ? String(p.sellingPrice)
                                : line.unitPrice,
                            productType: p?.productType ?? null,
                            modelCode: p?.modelCode ?? null,
                            lookupError: null,
                            lookupLoading: false,
                          })
                        }
                        searchProducts={searchProductsApi}
                        label=""
                        ariaLabel={`라인 ${idx + 1} 품목`}
                        placeholder="모델명 또는 품목명"
                        debounceMs={250}
                      />
                    }
                    footer={
                      isBundle ? (
                        <BundleOptionRow
                          line={{
                            modelName: line.modelName,
                            setOptions: line.setOptions ?? emptyBundleSetOptions(),
                          }}
                          index={idx}
                          onChange={(patch) => updateSetOption(line.id, patch)}
                        />
                      ) : null
                    }
                  />
                )
              })}
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

      {/* 재고조회 모달 — 신 공용 InventoryLookupModal (가용/실/예약 자체 페치) */}
      {/* §2-2 세트 재고 가드: BUNDLE 라인은 제외 후 전달, 전부 세트면 bundleOnlyLines=true */}
      <InventoryLookupModal
        open={stockModalOpen}
        onClose={closeStockModal}
        lines={stockSelectedSnapshot}
        bundleOnlyLines={stockBundleOnlySnapshot}
        excludedBundleCount={stockExcludedBundleSnapshot}
      />
    </div>
  )
}
