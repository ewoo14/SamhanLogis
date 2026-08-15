/**
 * 병합 전환 모달 — Phase 2.6b D2.
 *
 * <h2>역할</h2>
 * <p>주문 목록에서 선택한 DRAFT/ON_HOLD 주문 여러 개를 단일 출고전표로 병합 발행한다.
 *
 * <h2>UX 흐름</h2>
 * <ol>
 *   <li>선택 주문 상세(라인) 로드 → 주문별 그룹으로 라인 표시.</li>
 *   <li>라인별 전환수량 입력 (기본=잔여 전량, 잔여 초과 차단).</li>
 *   <li>출고 창고 필수 선택 (WarehouseAutocomplete 재사용 — AC-1 패턴).</li>
 *   <li>헤더 충돌 필드(주문마다 다른 배송지/납기/수령인/할인/메모) 표시 →
 *       라디오 선택 or '/' 병기 텍스트 직접 입력 → shippingInfo 확정.</li>
 *   <li>병합 발행 → 성공 시 slipNo 안내 토스트 + onSuccess 콜백(목록 invalidate) + 닫기.
 *       409/오류 시 모달 내 에러 피드백.</li>
 * </ol>
 *
 * <h2>UUID 비공개 가드 ([[feedback_uuid_no_user_visibility]])</h2>
 * <p>주문 UUID/라인 UUID 는 API 전송 전용 — 화면에 절대 노출 금지.
 * 사용자에게는 orderNumber/partnerCode/partnerName/modelCode/productName 만 표시.
 *
 * <h2>design-system 재사용</h2>
 * Button / Input / Modal / Spinner / WarehouseAutocomplete (자체 신규 컴포넌트 작성 금지).
 *
 * <h2>data-testid 목록</h2>
 * <ul>
 *   <li>{@code merge-convert-dialog-body}             — 본문 div</li>
 *   <li>{@code merge-convert-order-{orderNumber}}     — 주문 그룹 섹션</li>
 *   <li>{@code merge-convert-qty-{orderNumber}-{lineIndex}} — 라인별 전환수량 input</li>
 *   <li>{@code merge-convert-warehouse}               — 창고 선택 wrapper</li>
 *   <li>{@code merge-convert-shipping-field-{key}}    — 충돌 헤더 필드</li>
 *   <li>{@code merge-convert-submit}                  — 발행 버튼</li>
 *   <li>{@code merge-convert-modal-error}             — 모달 내 에러 배너</li>
 * </ul>
 */
import { useCallback, useState, useEffect, useMemo, useRef } from 'react'
import { useQueries, useQuery, useMutation } from '@tanstack/react-query'
import axios from 'axios'
import {
  Badge,
  Button,
  Input,
  MultiSelectAutocomplete,
  Modal,
  PartnerAutocomplete,
  Spinner,
  TagChip,
  WarehouseAutocomplete,
} from '@samhan/design-system'
import type { PartnerOption, Warehouse } from '@samhan/design-system'
import {
  getPartnerOrder,
  listPartnerOrders,
  mergeConvertToSlip,
  type MergeConvertShippingInfo,
  type PartnerOrderSummary,
} from '../../api/sales'
import type { PageResponse } from '../../api/client'
import { searchPartners } from '../../api/partnerApi'
import { listWarehouses } from '../../api/inventory'
import { toOrderPathId } from '../../utils/orderNo'
import styles from '../../components/sales/sales.module.css'
import { buildMergedPreview } from './mergePreview'
import { PartnerOrderDetailReadOnly } from './PartnerOrderDetailReadOnly'

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

interface MergeConvertDialogProps {
  /** @deprecated 거래처 우선 선택으로 대체됐다. 구 호출부 호환을 위해 입력만 허용한다. */
  selectedOrders?: PartnerOrderSummary[]
  onClose: () => void
  /**
   * 발행 성공 후 호출 — slipNo + 전환된 주문번호 목록을 전달하여
   * 목록 페이지에서 토스트 표시 + 목록/단건 캐시 invalidate 처리.
   */
  onSuccess: (slipNo: string, convertedOrderNos: string[]) => void
}

/**
 * 헤더 충돌 필드 — 주문마다 다른 값이 있을 수 있는 배송 정보 키.
 * FE 가 사용자에게 선택 또는 '/' 병기 텍스트 입력을 요청하는 대상.
 *
 * NOTE: `discountInfo` 는 PartnerOrderDetail 에 미포함(BE 구조 제약)이므로
 * 충돌 감지 대상에서 제외한다 (가이드 §9 미결 항목으로 추적).
 */
type ShippingFieldKey =
  | 'partnerName'
  | 'shippingAddress'
  | 'receiverPhone'
  | 'paymentDueLabel'
  | 'memo'

/** 헤더 충돌 필드 한국어 라벨. */
const SHIPPING_FIELD_LABEL: Record<ShippingFieldKey, string> = {
  partnerName: '거래처명',
  shippingAddress: '배송지',
  receiverPhone: '수령인 연락처',
  paymentDueLabel: '납기',
  memo: '요청사항',
}

/** 충돌 필드별 직접입력 placeholder (가이드 §9 미결). */
const SHIPPING_FIELD_PLACEHOLDER: Record<ShippingFieldKey, string> = {
  partnerName: '예: 거래처명',
  shippingAddress: '예: 서울/부산',
  receiverPhone: '예: 010-1234-5678',
  paymentDueLabel: '예: 2026-06-30 / 2026-07-15',
  memo: '예: 직배송 요청',
}

/** 주문 상세에서 ShippingInfo 관련 필드 추출. */
function extractShippingFieldValue(
  order: Awaited<ReturnType<typeof getPartnerOrder>>,
  key: ShippingFieldKey,
): string {
  switch (key) {
    case 'partnerName':
      return order.partnerName ?? ''
    case 'shippingAddress':
      return order.deliveryAddress ?? ''
    case 'receiverPhone':
      return order.contactPhone ?? ''
    case 'paymentDueLabel':
      return order.dueDate ?? ''
    case 'memo':
      return order.memo ?? ''
    default:
      return ''
  }
}

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)

const BUNDLE_CONVERSION_MESSAGE = '세트 품목은 출고전표 라인으로 저장할 수 없습니다. 구성품으로 전개해 주세요.'

function safeConversionMessage(value: unknown): string | null {
  return typeof value === 'string' && value.includes('세트 품목') && value.includes('구성품으로 전개')
    ? BUNDLE_CONVERSION_MESSAGE
    : null
}

const MERGE_SELECTABLE_STATUS: ReadonlySet<PartnerOrderSummary['status']> = new Set(['DRAFT', 'ON_HOLD'])
const MERGE_CANDIDATE_PAGE_SIZE = 50

/** 병합 후보를 페이지 상한 없이 모두 모은다. 화면은 이후 상태/legacy를 분류한다. */
async function listAllMergeCandidateOrders(
  partnerCode: string,
  partnerIdExact: string,
): Promise<PageResponse<PartnerOrderSummary>> {
  const filters = { partnerCode, partnerIdExact, includeDeleted: false }
  const firstPage = await listPartnerOrders(0, MERGE_CANDIDATE_PAGE_SIZE, filters)
  const content = [...firstPage.content]
  let page = 0
  let currentPage = firstPage
  while (content.length < currentPage.totalElements && currentPage.content.length > 0) {
    page += 1
    currentPage = await listPartnerOrders(page, MERGE_CANDIDATE_PAGE_SIZE, filters)
    content.push(...currentPage.content)
    if (currentPage.content.length === 0) break
  }
  return { ...firstPage, content, totalElements: Math.max(firstPage.totalElements, content.length) }
}

interface MergeOrderChipSelectorProps {
  candidates: PartnerOrderSummary[]
  selected: PartnerOrderSummary[]
  onAdd: (order: PartnerOrderSummary) => void
  onRemove: (order: PartnerOrderSummary) => void
  disabled?: boolean
}

/**
 * 거래처 후보 주문을 칩으로 선택한다.
 * MultiSelectAutocomplete가 선택/검색/TagChip 렌더링을 소유하고, 이 화면은 주문 표시 계약만 주입한다.
 */
function MergeOrderChipSelector({
  candidates,
  selected,
  onAdd,
  onRemove,
  disabled = false,
}: MergeOrderChipSelectorProps) {
  const search = useCallback(async (query: string) => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return candidates
    return candidates.filter((order) =>
      [order.orderNumber, order.partnerCode, order.partnerName ?? '']
        .some((value) => value.toLowerCase().includes(normalized)),
    )
  }, [candidates])

  return (
    <MultiSelectAutocomplete<PartnerOrderSummary, PartnerOrderSummary>
      selected={selected}
      onAdd={onAdd}
      onRemove={onRemove}
      search={search}
      getOptionKey={(order) => order.orderNumber}
      getSelectedKey={(order) => order.orderNumber}
      getInputLabel={(order) => order.orderNumber}
      renderOption={(order) => (
        <span data-testid={`merge-convert-order-option-${order.orderNumber}`}>
          {order.orderNumber}
          <span style={{ color: 'var(--color-neutral-500)', marginLeft: 6 }}>
            {order.partnerName ?? order.partnerCode}
          </span>
        </span>
      )}
      listboxLabel="병합할 주문 검색 결과"
      label="병합할 주문"
      ariaLabel="병합할 주문번호 검색"
      inputTestId="merge-convert-order-search"
      placeholder="주문번호 검색 후 선택…"
      minChars={0}
      disabled={disabled}
      renderChip={(order, index, handleRemove) => (
        <TagChip
          label={String(index + 1)}
          value={order.orderNumber}
          removeLabel={order.orderNumber}
          onRemove={handleRemove}
          data-testid={`merge-convert-order-chip-${order.orderNumber}`}
        />
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

export function MergeConvertDialog({
  selectedOrders: initialSelectedOrders = [],
  onClose,
  onSuccess,
}: MergeConvertDialogProps) {
  const [selectedPartner, setSelectedPartner] = useState<PartnerOption | null>(null)
  const [selectedOrders, setSelectedOrders] = useState<PartnerOrderSummary[]>(initialSelectedOrders)
  const [partnerSearchError, setPartnerSearchError] = useState<string | null>(null)

  // 목록에서 미리 고른 주문은 거래처 코드로 다시 거래처 UUID를 확인한 뒤 모달에 유지한다.
  // 목록 row에는 UUID를 노출하지 않으므로 partnerIdExact를 임의로 조립하지 않는다.
  useEffect(() => {
    const partnerCode = initialSelectedOrders[0]?.partnerCode
    if (!partnerCode || initialSelectedOrders.length === 0) return
    let active = true
    void searchPartners(partnerCode, { activeOnly: true, throwOnError: true })
      .then((partners) => {
        if (!active) return
        const partner = partners.find((item) => item.partnerCode === partnerCode)
        if (partner) {
          setSelectedPartner(partner)
          return
        }
        setPartnerSearchError('선택한 주문의 거래처를 확인할 수 없습니다. 거래처 검색 권한과 상태를 확인해 주세요.')
      })
      .catch(() => {
        if (active) setPartnerSearchError('선택한 주문의 거래처를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      })
    return () => {
      active = false
    }
  }, [initialSelectedOrders])

  const searchPartnerOptions = useCallback(async (query: string) => {
    setPartnerSearchError(null)
    try {
      return await searchPartners(query, { activeOnly: true, throwOnError: true })
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        setPartnerSearchError('거래처 검색 권한이 없습니다. 관리자에게 partners.search VIEW 권한을 요청해 주세요.')
      } else {
        setPartnerSearchError('거래처 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      }
      throw error
    }
  }, [])

  const candidateOrdersQuery = useQuery({
    queryKey: [
      'partner-order-merge-candidates',
      selectedPartner?.partnerCode ?? null,
      selectedPartner?.id ?? null,
    ],
    queryFn: () => listAllMergeCandidateOrders(selectedPartner!.partnerCode!, selectedPartner!.id!),
    // 목록에서 넘긴 주문은 이미 선택이 끝났으므로 후보 재조회로 선택을
    // 지우거나 0건으로 덮어쓰지 않는다. 거래처 조회는 헤더 검증에만 쓴다.
    enabled: Boolean(selectedPartner?.partnerCode && selectedPartner?.id) && initialSelectedOrders.length === 0,
    retry: 1,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const candidateOrders = useMemo(
    () => (candidateOrdersQuery.data?.content ?? []).filter((order) =>
      !order.isDeleted && order.mergeEligible !== false && MERGE_SELECTABLE_STATUS.has(order.status),
    ),
    [candidateOrdersQuery.data?.content],
  )

  useEffect(() => {
    if (candidateOrders.length === 0 || selectedOrders.length === 0) return
    const candidateKeys = new Set(candidateOrders.map((order) => order.orderNumber))
    setSelectedOrders((current) => current.filter((order) => candidateKeys.has(order.orderNumber)))
  }, [candidateOrders, selectedOrders.length])

  const ineligibleOrders = useMemo(
    () => (candidateOrdersQuery.data?.content ?? []).filter((order) =>
      !order.isDeleted && order.mergeEligible === false && MERGE_SELECTABLE_STATUS.has(order.status),
    ),
    [candidateOrdersQuery.data?.content],
  )

  const ineligibilityReasons = useMemo(
    () => [...new Set(ineligibleOrders.map((order) => order.mergeIneligibilityReason).filter(Boolean))],
    [ineligibleOrders],
  )

  // 선택 주문 상세 로드 (라인 정보 필요) — useQueries 로 rules-of-hooks 위반 방지
  //
  // 주문번호 표준은 슬래시(`YYYY/MM/DD-{번호}`)이나 게이트웨이가 URL 경로의 `%2F` 를
  // StrictHttpFirewall 로 차단한다. 단일주문 경로와 동일하게 공용 toOrderPathId(슬래시→하이픈)
  // 규약을 적용한다. BE PartnerOrderIdResolver 가 하이픈/슬래시를 모두 처리하며, 화면 노출
  // 번호는 항상 슬래시 표준이 유지된다.
  const orderDetailsQueries = useQueries({
    queries: selectedOrders.map((o) => {
      const normalizedNo = o.orderNumber ? toOrderPathId(o.orderNumber) : undefined
      return {
        queryKey: ['partner-order', normalizedNo],
        queryFn: () => getPartnerOrder(normalizedNo!),
        enabled: !!normalizedNo,
        retry: 1 as const,
        staleTime: 0,
        refetchOnMount: 'always' as const,
      }
    }),
  })

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  // 모든 상세 로드 상태
  const isLoadingDetails = orderDetailsQueries.some((q) => q.isLoading)
  const hasDetailError = orderDetailsQueries.some((q) => q.isError)
  const orderDetails = orderDetailsQueries
    .map((q) => q.data)
    .filter((detail): detail is NonNullable<typeof detail> => Boolean(detail))
  const mergedPreview = useMemo(() => buildMergedPreview(orderDetails), [orderDetails])

  // 라인별 전환수량 맵 — 키: `${orderNumber}-${lineId}`. 주문 추가/삭제 시 인덱스가
  // 재배열되어도 사용자가 조정한 다른 주문의 입력을 재사용하지 않는다.
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({})

  const selectedOrderKey = selectedOrders.map((order) => order.orderNumber).join('|')
  const orderDetailsSnapshotKey = orderDetails
    .map((detail) => `${detail.orderNumber}:${detail.lines.map((line) => `${line.lineId}-${line.quantity}-${line.convertedQuantity ?? 0}`).join(',')}`)
    .join('|')

  // FE P1-1: 새 주문 라인만 잔여 전량으로 추가하고 기존 입력은 보존한다.
  useEffect(() => {
    if (isLoadingDetails || orderDetails.length !== selectedOrders.length) return
    setQtyMap((previous) => {
      const nextMap: Record<string, number> = {}
      orderDetails.forEach((detail) => {
        detail.lines.forEach((line) => {
          const remaining = line.quantity - (line.convertedQuantity ?? 0)
          if (remaining > 0) {
            const key = `${detail.orderNumber}-${line.lineId}`
            nextMap[key] = Math.min(previous[key] ?? remaining, remaining)
          }
        })
      })
      return nextMap
    })
  }, [isLoadingDetails, orderDetails.length, orderDetailsSnapshotKey, selectedOrderKey])

  // 출고 창고
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null)

  /**
   * 헤더 충돌 필드 확정값 — 사용자 입력.
   * 구조: { [key]: 선택된 값 | '__custom__' (직접입력 라디오 선택 시) }
   * 직접입력 실제 텍스트는 customInputs 에 별도 관리.
   */
  const [shippingFields, setShippingFields] = useState<Partial<Record<ShippingFieldKey, string>>>({})
  /** 직접입력 라디오 선택 시 텍스트 인풋 값 — 키: ShippingFieldKey. */
  const [customInputs, setCustomInputs] = useState<Partial<Record<ShippingFieldKey, string>>>({})

  // 창고 포커스는 거래처와 병합 주문을 고른 뒤에만 이동한다. 모달 최초 포커스가
  // 창고로 가면 거래처 우선 선택 단계가 시각적으로 생략되는 회귀가 발생한다.
  const warehouseWrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!selectedPartner || selectedOrders.length < 2) return
    const input = warehouseWrapRef.current?.querySelector<HTMLInputElement>('input[role="combobox"]')
    if (input) {
      // 약간의 지연 — 주문 칩 갱신 및 Modal 애니메이션 완료 후 포커스
      const tid = setTimeout(() => input.focus(), 80)
      return () => clearTimeout(tid)
    }
  }, [selectedOrders.length, selectedPartner])

  // 에러 메시지
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  /** 같은 거래처 재선택은 전환이 아니므로 진행 중인 wizard 입력을 보존한다. */
  const handlePartnerChange = (partner: PartnerOption | null) => {
    const samePartner = partner?.id === selectedPartner?.id && partner?.partnerCode === selectedPartner?.partnerCode
    if (samePartner) return

    setSelectedPartner(partner)
    setPartnerSearchError(null)
    setSelectedOrders([])
    setQtyMap({})
    setSelectedWarehouse(null)
    setShippingFields({})
    setCustomInputs({})
    setErrorMessage(null)
  }

  // 충돌 필드 계산 — 주문마다 값이 다른 필드 목록
  const conflictFields: ShippingFieldKey[] = []
  if (orderDetails.length >= 2) {
    const keys: ShippingFieldKey[] = [
      'partnerName',
      'shippingAddress',
      'receiverPhone',
      'paymentDueLabel',
      'memo',
    ]
    for (const key of keys) {
      const values = orderDetails.map((d) => extractShippingFieldValue(d, key))
      const uniqueValues = new Set(values)
      if (uniqueValues.size > 1) {
        conflictFields.push(key)
      }
    }
  }

  // 충돌 없는 필드는 첫 번째 주문 값으로 자동 채움
  const resolvedShippingInfo: MergeConvertShippingInfo = (() => {
    const keys: ShippingFieldKey[] = [
      'partnerName',
      'shippingAddress',
      'receiverPhone',
      'paymentDueLabel',
      'memo',
    ]
    const result: MergeConvertShippingInfo = {}
    for (const key of keys) {
      const selected = shippingFields[key]
      if (selected !== undefined) {
        // 사용자 라디오 선택 또는 직접입력 값 우선
        const finalVal =
          selected === '__custom__' ? (customInputs[key] ?? '') : selected
        ;(result as Record<string, string | undefined>)[key] = finalVal || undefined
      } else if (orderDetails[0]) {
        // 충돌 없는 필드 — 첫 번째 주문 값 사용
        const val = extractShippingFieldValue(orderDetails[0], key)
        if (val) {
          ;(result as Record<string, string | undefined>)[key] = val
        }
      }
    }
    return result
  })()

  // 전환 수량 유효성 — 1건 이상 수량>0 라인 있어야 함
  const hasSomeQty = Object.values(qtyMap).some((q) => q > 0)

  // {M} 전환 예정 품목 수 — 비가역 경고 카피 (가이드 §2.1)
  const convertItemCount = Object.values(qtyMap).filter((q) => q > 0).length

  // 제출 버튼 활성 기반 조건 — 4-AND (가이드 §2.7, Designer P1-2)
  // mergeMutation.isPending 은 선언 이후 버튼 disabled prop 에서 별도로 처리
  const canSubmitBase =
    selectedOrders.length >= 2 &&
    Boolean(selectedPartner) &&
    !isLoadingDetails &&
    !hasDetailError &&
    hasSomeQty &&
    !!selectedWarehouse
    // 품목 외 헤더는 항상 첫 주문 기준으로 확정한다. 후속 주문의 값은
    // 충돌 선택을 요구하지 않고 아래 미리보기에서 폐기 사실을 알린다.

  // 병합 전환 mutation
  const mergeMutation = useMutation({
    mutationFn: () => {
      if (!selectedWarehouse) throw new Error('창고를 선택해 주세요.')
      // 주문별 items 빌드
      const orders = orderDetails
        .map((detail) => {
          if (!detail) return null
          const items = detail.lines
            .filter((line) => {
              const remaining = line.quantity - (line.convertedQuantity ?? 0)
              const qty = qtyMap[`${detail.orderNumber}-${line.lineId}`] ?? 0
              return remaining > 0 && qty > 0
            })
            .map((line) => ({
              orderLineId: line.lineId,
                quantity: qtyMap[`${detail.orderNumber}-${line.lineId}`]!,
            }))
          if (items.length === 0) return null
          return {
            // BE 확정 (2026-05-31): partnerOrderId 필드 = 주문번호(orderNumber) 또는 UUID —
            // BE PartnerOrderIdResolver 양용 허용. FE 는 orderNumber 를 전달한다.
            partnerOrderId: detail.orderNumber,
            items,
          }
        })
        .filter(Boolean) as { partnerOrderId: string; items: { orderLineId: string; quantity: number }[] }[]

      return mergeConvertToSlip(orders, selectedWarehouse.code, resolvedShippingInfo)
    },
    onSuccess: (result) => {
      setErrorMessage(null)
      // FE P1-4: convertedOrders 의 orderNo 목록을 전달 — 단건 캐시 무효화용
      const convertedOrderNos = result.convertedOrders.map((o) => o.orderNo)
      onSuccess(result.slipNo, convertedOrderNos)
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const respData = error.response?.data as Record<string, unknown> | undefined
        const beMessage = respData?.['message'] as string | undefined
        const safeBeMessage = safeConversionMessage(beMessage)
        if (error.response?.status === 409) {
          // 다른 사용자의 부분전환으로 잔여수량이 바뀐 경우, 5분 캐시를 기다리지 않고
          // 각 주문 상세를 즉시 재조회해 입력 상한과 표를 실제 상태로 회복한다.
          void Promise.all(orderDetailsQueries.map((query) => query.refetch()))
          if (beMessage?.includes('같은 거래처')) {
            setErrorMessage('병합은 같은 거래처 주문만 가능합니다. 선택을 다시 확인해 주세요.')
            return
          }
          if (beMessage?.includes('warehouseCode')) {
            setErrorMessage('출고 창고를 선택해 주세요.')
            return
          }
          // 재고 부족 — 가이드 §2.6 한국어 메시지 (BE 메시지 포함)
          if (beMessage?.includes('재고 부족')) {
            setErrorMessage(
              `재고 부족으로 병합전환할 수 없습니다.\n${beMessage}\n수량을 줄이거나 담당자에게 재고 보충을 요청해 주세요.`,
            )
            return
          }
          setErrorMessage(safeBeMessage ?? '병합 전환에 실패했습니다. 재고 부족이거나 전환 불가 상태를 확인해 주세요.')
          return
        }
        if (error.response?.status === 403) {
          setErrorMessage('병합 전환 권한이 없습니다. 관리자에게 문의해 주세요.')
          return
        }
        setErrorMessage(safeBeMessage ?? '병합전환에 실패했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }
      setErrorMessage('병합전환에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    },
  })

  const warehouseError = warehousesQuery.isError
    ? '창고 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
    : (!selectedWarehouse && hasSomeQty ? '출고 창고를 선택하세요.' : undefined)

  return (
    <Modal
      open
      onClose={() => {
        if (!mergeMutation.isPending) onClose()
      }}
      title="출고전표 병합 전환"
      size="xl"
      closeOnBackdropClick={!mergeMutation.isPending}
      closeOnEsc={!mergeMutation.isPending}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            data-testid="merge-convert-cancel"
            disabled={mergeMutation.isPending}
            onClick={() => {
              if (!mergeMutation.isPending) onClose()
            }}
          >
            취소
          </Button>
          <Button
            type="button"
            variant="primary"
            data-testid="merge-convert-submit"
            disabled={!canSubmitBase || mergeMutation.isPending}
            aria-disabled={!canSubmitBase || mergeMutation.isPending}
            onClick={() => {
              setErrorMessage(null)
              mergeMutation.mutate()
            }}
          >
            {mergeMutation.isPending ? '승인 처리 중…' : '승인'}
          </Button>
        </>
      }
    >
      <div data-testid="merge-convert-dialog-body">
        {/* [A] 비가역 경고 배너 — danger 토큰, 항상 최상단 (가이드 §2.1, Designer P1-1/P1-4) */}
        <div
          className={styles['mergeConvertWarningBanner']}
          role="note"
          data-testid="merge-convert-irreversible-warning"
        >
          <strong>주의:</strong> 병합전환 후에는 출고전표가 즉시 생성되며 재고가 예약됩니다.{' '}
          이 작업은 되돌릴 수 없습니다.
          {convertItemCount > 0
            ? ` (${selectedOrders.length}개 주문, ${convertItemCount}개 품목 전환 예정)`
          : null}
        </div>

        {/* 승인 판단에 필요한 병합 결과를 선택/창고 입력보다 먼저 보여준다. 모달 본문이
            세로로 제한되어도 헤더 카드와 전체 라인 표가 첫 화면에 함께 들어온다. */}
        {!isLoadingDetails && !hasDetailError && initialSelectedOrders.length >= 2 && mergedPreview.header ? (
          <section data-testid="merge-convert-preview" style={{ marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 8px' }}>승인 전 병합 주문서 상세</h3>
            <p data-testid="merge-convert-preview-header" style={{ margin: '0 0 8px' }}>
              헤더는 첫 번째 주문 기준: {mergedPreview.header.orderNumber} · 거래처 {selectedPartner?.name ?? mergedPreview.header.partnerName ?? mergedPreview.header.partnerCode}
            </p>
            <p data-testid="merge-convert-discarded-header-notice" role="note">
              두 번째 이후 주문의 배송지·납기·메모·거래처 등 품목 외 필드는 사용하지 않습니다.
            </p>
            <p data-testid="merge-convert-source-notice" style={{ margin: '0 0 8px', fontSize: 12 }}>
              <span>출처</span>는 각 라인의 모델명 아래에 표시됩니다.
            </p>
            <PartnerOrderDetailReadOnly
              order={{
                ...mergedPreview.header,
                partnerName: selectedPartner?.name ?? mergedPreview.header.partnerName,
                lines: mergedPreview.lines,
                totalAmount: mergedPreview.lines.reduce((total, line) => total + line.subtotal, 0),
                linkedSlipNo: null,
                status: 'DRAFT',
              }}
              renderLineSource={(line) => {
                const sourceOrderNumbers = (line as typeof line & { sourceOrderNumbers?: string[] }).sourceOrderNumbers ?? []
                return sourceOrderNumbers.join(', ')
              }}
            />
          </section>
        ) : null}

        {/* [B] 목록 선택 주문은 고정하고, 구형 직접 진입만 거래처 우선 선택을 허용한다. */}
        <div
          data-testid="merge-convert-partner-selection"
          style={{ marginBottom: 'var(--space-4, 16px)' }}
        >
          {initialSelectedOrders.length > 0 ? (
            <div data-testid="merge-convert-fixed-partner">
              선택 주문 거래처: <span data-testid="merge-convert-partner-input-value">{initialSelectedOrders[0]?.partnerName ?? initialSelectedOrders[0]?.partnerCode}</span>
              <span data-testid="merge-convert-mock-selected-order-count" style={{ display: 'inline-block', marginLeft: 8 }}>{selectedOrders.length}개 선택됨</span>
            </div>
          ) : (
            <PartnerAutocomplete
              value={selectedPartner}
              onChange={handlePartnerChange}
              searchPartners={searchPartnerOptions}
              label="거래처 선택"
              ariaLabel="병합 거래처 검색"
              inputTestId="merge-convert-partner-search"
              placeholder="거래처명·코드·사업자번호 입력…"
              required
              disabled={mergeMutation.isPending}
            />
          )}
          {partnerSearchError ? (
            <div role="alert" data-testid="merge-convert-partner-search-error">
              {partnerSearchError}
            </div>
          ) : null}
          {selectedPartner || initialSelectedOrders.length > 0 ? (
            <p
              data-testid="merge-convert-selected-partner"
              style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-neutral-600)' }}
            >
              선택 거래처: {selectedPartner?.name ?? initialSelectedOrders[0]?.partnerName ?? '-'} ({selectedPartner?.partnerCode ?? initialSelectedOrders[0]?.partnerCode ?? '-'})
            </p>
          ) : (
            <p
              data-testid="merge-convert-partner-required"
              style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-neutral-600)' }}
            >
              먼저 거래처를 선택하면 병합 가능한 주문만 표시됩니다.
            </p>
          )}
        </div>

        {/* [C] 선택 거래처 주문 칩 — 거래처 변경 시 key remount로 이전 선택을 폐기한다. */}
        {selectedPartner && initialSelectedOrders.length === 0 ? (
          <div
            key={selectedPartner.partnerCode}
            data-testid="merge-convert-order-selection"
            style={{ marginBottom: 'var(--space-4, 16px)' }}
          >
            {candidateOrdersQuery.isLoading ? (
              <div data-testid="merge-convert-order-candidates-loading">주문 후보를 불러오는 중…</div>
            ) : candidateOrdersQuery.isError ? (
              <div role="alert" data-testid="merge-convert-order-candidates-error">
                선택 거래처의 주문 후보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
              </div>
            ) : candidateOrders.length === 0 ? (
              <>
                <div data-testid="merge-convert-order-candidates-empty">
                  선택 거래처에 병합 가능한 진행중·보류 주문이 없습니다.
                </div>
                {ineligibilityReasons.length > 0 ? (
                  <div
                    role="status"
                    data-testid="merge-convert-order-ineligible-reason"
                    style={{ marginTop: 6, color: 'var(--color-warning-700, #8a5a00)' }}
                  >
                    {ineligibilityReasons.join(' ')}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <span data-testid="merge-convert-selected-order-count">
                  {selectedOrders.length}건 선택됨
                </span>
                <MergeOrderChipSelector
                  key={selectedPartner.partnerCode}
                  candidates={candidateOrders}
                  selected={selectedOrders}
                  onAdd={(order) => setSelectedOrders((current) => [...current, order])}
                  onRemove={(order) => setSelectedOrders((current) =>
                    current.filter((item) => item.orderNumber !== order.orderNumber),
                  )}
                  disabled={mergeMutation.isPending}
                />
              </>
            )}
            {candidateOrders.length > 0 && ineligibilityReasons.length > 0 ? (
              <div
                role="status"
                data-testid="merge-convert-order-ineligible-reason"
                style={{ marginTop: 6, color: 'var(--color-warning-700, #8a5a00)' }}
              >
                {ineligibilityReasons.join(' ')}
              </div>
            ) : null}
            <p
              data-testid="merge-convert-order-candidate-summary"
              style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-neutral-600)' }}
            >
              {candidateOrders.length}건 후보 · 동일 거래처 주문만 선택할 수 있습니다.
              {ineligibleOrders.length > 0 ? ` ${ineligibleOrders.length}건은 병합에서 제외됨` : ''}
            </p>
          </div>
        ) : null}

        {/* [D] 출고 창고 선택 (필수) — 가이드 §2.2 */}
        <div
          ref={warehouseWrapRef}
          data-testid="merge-convert-warehouse"
          style={{ marginBottom: 16 }}
        >
          <WarehouseAutocomplete
            warehouses={warehousesQuery.data ?? []}
            value={selectedWarehouse?.id ?? null}
            onChange={(_id, warehouse) => setSelectedWarehouse(warehouse)}
            label="출고 창고"
            placeholder={warehousesQuery.isLoading ? '창고 목록 불러오는 중…' : '창고 코드 또는 이름 입력…'}
            hideVirtual
            resultSelectionMode="single"
            autoSelectSingleResult
            resultSelectionTitle="출고 창고 검색 결과"
            required
            disabled={mergeMutation.isPending || warehousesQuery.isLoading}
            error={warehouseError}
          />
        </div>

        {/* [C] 헤더 충돌 필드 — 라디오+직접입력 혼합 패턴 (가이드 §2.3, Designer P1-2) */}
        {conflictFields.length > 0 ? (
          <div
            data-testid="merge-convert-conflict-section"
            style={{
              background: 'var(--color-warning-50, #fef6e7)',
              border: '1px solid var(--color-warning-200, #f8da9a)',
              borderRadius: 6,
              padding: 'var(--space-4, 16px)',
              marginBottom: 'var(--space-4, 16px)',
            }}
          >
            <div
              style={{
                fontSize: 'var(--font-size-sm, 13px)',
                color: 'var(--color-warning-800, #8C5C13)',
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              ⚠ 아래 필드는 주문마다 값이 다릅니다. 최종 출고전표에 기록될 값을 선택하세요.
            </div>
            {conflictFields.map((key) => {
              const orderValueEntries = orderDetails
                .map((detail) => ({ orderNumber: detail.orderNumber, value: extractShippingFieldValue(detail, key) }))
                .filter((entry) => entry.value !== '')
              const selectedVal = shippingFields[key]
              const isCustomSelected = selectedVal === '__custom__'
              return (
                <div
                  key={key}
                  data-testid={`merge-convert-conflict-${key}`}
                  role="radiogroup"
                  aria-labelledby={`conflict-label-${key}`}
                  style={{ marginBottom: 12 }}
                >
                  <div
                    id={`conflict-label-${key}`}
                    style={{
                      fontSize: 'var(--font-size-sm, 13px)',
                      fontWeight: 600,
                      marginBottom: 6,
                      color: 'var(--color-warning-800, #8C5C13)',
                    }}
                  >
                    {SHIPPING_FIELD_LABEL[key]}
                  </div>
                  {/* 주문별 값 라디오 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {orderValueEntries.map(({ orderNumber: orderNo, value: val }) => {
                      return (
                        <label
                          key={`${key}-radio-${orderNo}`}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 6,
                            fontSize: 'var(--font-size-sm, 13px)',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="radio"
                            name={`conflict-${key}`}
                            value={val}
                            data-testid={`merge-convert-conflict-${key}-radio-${orderNo}`}
                            checked={selectedVal === val}
                            onChange={() =>
                              setShippingFields((prev) => ({ ...prev, [key]: val }))
                            }
                            disabled={mergeMutation.isPending}
                            aria-label={`${orderNo} 값 선택`}
                          />
                          <span>
                            주문 {orderNo} 값:{' '}
                            <strong>{val}</strong>
                          </span>
                        </label>
                      )
                    })}
                    {/* 직접 입력 라디오 (세 번째 옵션) */}
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 6,
                        fontSize: 'var(--font-size-sm, 13px)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name={`conflict-${key}`}
                        value="__custom__"
                        data-testid={`merge-convert-conflict-${key}-radio-custom`}
                        checked={isCustomSelected}
                        onChange={() =>
                          setShippingFields((prev) => ({ ...prev, [key]: '__custom__' }))
                        }
                        disabled={mergeMutation.isPending}
                        aria-label={`${SHIPPING_FIELD_LABEL[key]} 직접 입력`}
                      />
                      <span>직접 입력 (/ 병기 등)</span>
                    </label>
                    {/* 직접입력 텍스트 인풋 — 직접입력 라디오 선택 시에만 활성 */}
                    <Input
                      aria-label={`${SHIPPING_FIELD_LABEL[key]} 직접 입력`}
                      aria-disabled={!isCustomSelected}
                      data-testid={`merge-convert-conflict-${key}-input-custom`}
                      value={customInputs[key] ?? ''}
                      placeholder={SHIPPING_FIELD_PLACEHOLDER[key]}
                      disabled={!isCustomSelected || mergeMutation.isPending}
                      onChange={(e) => {
                        const val = e.target.value
                        setCustomInputs((prev) => ({ ...prev, [key]: val }))
                        // 타이핑 시 직접입력 라디오 자동 선택 유지 (라디오 해제 방지)
                        setShippingFields((prev) => ({ ...prev, [key]: '__custom__' }))
                      }}
                      inputSize="sm"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        {/* 로딩 중 */}
        {isLoadingDetails ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0' }}>
            <Spinner size="sm" />
            <span>주문 상세를 불러오는 중…</span>
          </div>
        ) : hasDetailError ? (
          <div className={styles['errorBanner']} role="alert" style={{ marginBottom: 12 }}>
            주문 상세를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        ) : null}

        {/* [D] 주문별 라인 그룹 표 */}
        {!isLoadingDetails && !hasDetailError && initialSelectedOrders.length === 0
          ? orderDetails.map((detail, oi) => {
              if (!detail) return null
              const order = selectedOrders[oi]!
              const statusVariant = order.status === 'ON_HOLD' ? 'neutral' : 'warning'
              return (
                <div
                  key={detail.orderNumber}
                  data-testid={`merge-convert-order-group-${detail.orderNumber}`}
                  style={{ marginBottom: 20 }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 8,
                      fontWeight: 600,
                      fontSize: 'var(--font-size-sm, 13px)',
                      background: 'var(--color-neutral-50, #f7f8fa)',
                      padding: '10px 12px',
                      borderRadius: 4,
                    }}
                  >
                    {/* 주문번호 사용자 노출 (UUID 비노출) */}
                    <span>주문번호: {detail.orderNumber}</span>
                    <span
                      style={{
                        fontWeight: 400,
                        color: 'var(--color-neutral-500, #6b7280)',
                        marginLeft: 4,
                      }}
                    >
                      {order.partnerName ?? order.partnerCode}
                    </span>
                    <Badge variant={statusVariant}>
                      {PARTNER_ORDER_STATUS_LABEL_LOCAL[order.status]}
                    </Badge>
                  </div>
                  <div className={styles['tableWrap']}>
                    <table className={styles['estTable']}>
                      <thead>
                        <tr>
                          <th>품목명</th>
                          <th>모델명</th>
                          <th className={styles['numericTh']}>주문수량</th>
                          <th className={styles['numericTh']}>전환됨</th>
                          <th className={styles['numericTh']}>잔여</th>
                          <th className={`${styles['numericTh']} ${styles['convertQtyTh']}`}>전환수량</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines.map((line, li) => {
                          const remaining = line.quantity - (line.convertedQuantity ?? 0)
                          const qtyKey = `${detail.orderNumber}-${line.lineId}`
                          const currentQty = qtyMap[qtyKey] ?? 0
                          const disabled = remaining <= 0 || mergeMutation.isPending
                          return (
                            <tr
                              key={line.lineId}
                              className={remaining <= 0 ? styles['convertLineDisabled'] : undefined}
                            >
                              <td className={styles['tdLeft']}>
                                {line.productName}
                                {remaining <= 0 ? (
                                  <span className={styles['convertedLabel']}> 전환완료</span>
                                ) : null}
                              </td>
                              <td>{line.modelCode}</td>
                              <td className={styles['numericCol']}>{line.quantity}</td>
                              <td className={styles['numericCol']}>{line.convertedQuantity ?? 0}</td>
                              <td className={styles['numericCol']}>{remaining}</td>
                              <td>
                                <Input
                                  aria-label={`${line.productName} 전환수량`}
                                  type="number"
                                  min={0}
                                  max={remaining}
                                  value={disabled ? 0 : currentQty}
                                  disabled={disabled}
                                  data-testid={`merge-convert-qty-${detail.orderNumber}-${li}`}
                                  onChange={(e) => {
                                    const raw = Number(e.target.value)
                                    const clamped = Math.max(0, Math.min(remaining, raw))
                                    setQtyMap((prev) => ({ ...prev, [qtyKey]: clamped }))
                                  }}
                                  inputSize="sm"
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--color-neutral-500, #6b7280)',
                      marginTop: 4,
                      textAlign: 'right',
                    }}
                  >
                    합계 {krw(detail.totalAmount)}원
                  </div>
                </div>
              )
            })
          : null}

        {/* [F] 오류 배너 — 가이드 §2.6 (비가역 경고 아래, 라인 표 아래) */}
        {errorMessage ? (
          <div
            className={styles['errorBanner']}
            role="alert"
            data-testid="merge-convert-error"
            style={{ whiteSpace: 'pre-line', alignItems: 'flex-start', marginTop: 12 }}
          >
            {errorMessage}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

/** 모달 내 status 한국어 라벨 (순환 import 방지용 로컬 상수). */
const PARTNER_ORDER_STATUS_LABEL_LOCAL: Record<string, string> = {
  DRAFT: '접수',
  ON_HOLD: '보류',
  CONFIRMING: '접수',
  CONFIRMED: '완료',
  CANCELED: '취소',
  CONVERTED: '완료',
}
