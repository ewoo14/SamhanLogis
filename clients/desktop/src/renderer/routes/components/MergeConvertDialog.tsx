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
 *   <li>{@code merge-convert-dialog}                 — Modal root</li>
 *   <li>{@code merge-convert-dialog-body}             — 본문 div</li>
 *   <li>{@code merge-convert-order-{orderNumber}}     — 주문 그룹 섹션</li>
 *   <li>{@code merge-convert-qty-{orderIndex}-{lineIndex}} — 라인별 전환수량 input</li>
 *   <li>{@code merge-convert-warehouse}               — 창고 선택 wrapper</li>
 *   <li>{@code merge-convert-shipping-field-{key}}    — 충돌 헤더 필드</li>
 *   <li>{@code merge-convert-submit}                  — 발행 버튼</li>
 *   <li>{@code merge-convert-modal-error}             — 모달 내 에러 배너</li>
 * </ul>
 */
import { useState } from 'react'
import { useQueries, useQuery, useMutation } from '@tanstack/react-query'
import axios from 'axios'
import {
  Button,
  Input,
  Modal,
  Spinner,
  WarehouseAutocomplete,
} from '@samhan/design-system'
import type { Warehouse } from '@samhan/design-system'
import {
  getPartnerOrder,
  mergeConvertToSlip,
  type MergeConvertShippingInfo,
  type PartnerOrderSummary,
} from '../../api/sales'
import { listWarehouses } from '../../api/inventory'
import styles from '../../components/sales/sales.module.css'

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

interface MergeConvertDialogProps {
  /** 목록에서 선택된 주문 요약 목록 (2건 이상, 같은 partnerCode 보장). */
  selectedOrders: PartnerOrderSummary[]
  onClose: () => void
  /** 발행 성공 후 호출 — slipNo 를 전달하여 목록 페이지에서 토스트 표시 + invalidate 처리. */
  onSuccess: (slipNo: string) => void
}

/**
 * 헤더 충돌 필드 — 주문마다 다른 값이 있을 수 있는 배송 정보 키.
 * FE 가 사용자에게 선택 또는 '/' 병기 텍스트 입력을 요청하는 대상.
 */
type ShippingFieldKey =
  | 'partnerName'
  | 'shippingAddress'
  | 'receiverPhone'
  | 'paymentDueLabel'
  | 'discountInfo'
  | 'memo'

/** 헤더 충돌 필드 한국어 라벨. */
const SHIPPING_FIELD_LABEL: Record<ShippingFieldKey, string> = {
  partnerName: '거래처명',
  shippingAddress: '배송지',
  receiverPhone: '수령인 연락처',
  paymentDueLabel: '납기',
  discountInfo: '할인 정보',
  memo: '요청사항',
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
    case 'discountInfo':
      // PartnerOrderDetail 에는 discountInfo 필드가 없음 — BE MergeConvertToSlipRequest.ShippingInfo 에 있으나
      // 단일주문 상세에는 노출 안 됨 → 공백 처리
      return ''
    case 'memo':
      return order.memo ?? ''
    default:
      return ''
  }
}

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

export function MergeConvertDialog({
  selectedOrders,
  onClose,
  onSuccess,
}: MergeConvertDialogProps) {
  // 선택 주문 상세 로드 (라인 정보 필요) — useQueries 로 rules-of-hooks 위반 방지
  const orderDetailsQueries = useQueries({
    queries: selectedOrders.map((o) => ({
      queryKey: ['partner-order', o.orderNumber],
      queryFn: () => getPartnerOrder(o.orderNumber!),
      enabled: !!o.orderNumber,
      retry: 1 as const,
    })),
  })

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  // 모든 상세 로드 상태
  const isLoadingDetails = orderDetailsQueries.some((q) => q.isLoading)
  const hasDetailError = orderDetailsQueries.some((q) => q.isError)
  const orderDetails = orderDetailsQueries.map((q) => q.data).filter(Boolean)

  // 라인별 전환수량 맵 — 키: `${orderIndex}-${lineId}`
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({})

  // 초기화: 모든 상세 로드 완료 후 잔여 전량으로 초기화
  // (useEffect 없이 메모이제이션 — 상세 로드 완료 시 1회만 설정)
  const [qtyInitialized, setQtyInitialized] = useState(false)
  if (!qtyInitialized && orderDetails.length === selectedOrders.length && !isLoadingDetails) {
    const initMap: Record<string, number> = {}
    orderDetails.forEach((detail, oi) => {
      if (!detail) return
      detail.lines.forEach((line) => {
        const remaining = line.quantity - (line.convertedQuantity ?? 0)
        if (remaining > 0) {
          initMap[`${oi}-${line.lineId}`] = remaining
        }
      })
    })
    setQtyMap(initMap)
    setQtyInitialized(true)
  }

  // 출고 창고
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null)

  // 헤더 충돌 필드 확정값 — 사용자 입력 (선택/병기)
  const [shippingFields, setShippingFields] = useState<Partial<Record<ShippingFieldKey, string>>>({})

  // 에러 메시지
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
      const values = orderDetails
        .filter(Boolean)
        .map((d) => extractShippingFieldValue(d!, key))
        .filter((v) => v !== '')
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
      'discountInfo',
      'memo',
    ]
    const result: MergeConvertShippingInfo = {}
    for (const key of keys) {
      if (shippingFields[key] !== undefined) {
        // 사용자가 직접 입력한 값 우선
        ;(result as Record<string, string | undefined>)[key] = shippingFields[key] || undefined
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

  // 제출 버튼 활성 조건
  const canSubmit = hasSomeQty && !!selectedWarehouse

  // 병합 전환 mutation
  const mergeMutation = useMutation({
    mutationFn: () => {
      if (!selectedWarehouse) throw new Error('창고를 선택해 주세요.')
      // 주문별 items 빌드
      const orders = orderDetails
        .map((detail, oi) => {
          if (!detail) return null
          const items = detail.lines
            .filter((line) => {
              const remaining = line.quantity - (line.convertedQuantity ?? 0)
              const qty = qtyMap[`${oi}-${line.lineId}`] ?? 0
              return remaining > 0 && qty > 0
            })
            .map((line) => ({
              orderLineId: line.lineId,
              quantity: qtyMap[`${oi}-${line.lineId}`]!,
            }))
          if (items.length === 0) return null
          return {
            // BE 확정 (2026-05-31): partnerOrderId 필드 = 주문번호(orderNo) 를 받는다.
            // UUID 가 아닌 orderNumber(사용자 식별자) 를 전달 — 이미 정상 동작.
            partnerOrderId: detail.orderNumber,
            items,
          }
        })
        .filter(Boolean) as { partnerOrderId: string; items: { orderLineId: string; quantity: number }[] }[]

      return mergeConvertToSlip(orders, selectedWarehouse.code, resolvedShippingInfo)
    },
    onSuccess: (result) => {
      setErrorMessage(null)
      // slipNo 를 onSuccess 콜백으로 위임 — 목록 페이지에서 토스트 표시 + invalidate 처리
      onSuccess(result.slipNo)
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const respData = error.response?.data as Record<string, unknown> | undefined
        const beMessage = respData?.['message'] as string | undefined
        if (error.response?.status === 409) {
          if (beMessage?.includes('같은 거래처')) {
            setErrorMessage('병합은 같은 거래처 주문만 가능합니다.')
            return
          }
          if (beMessage?.includes('warehouseCode')) {
            setErrorMessage('출고 창고를 선택해 주세요.')
            return
          }
          setErrorMessage(
            beMessage ?? '병합 전환에 실패했습니다. 재고 부족이거나 전환 불가 상태를 확인해 주세요.',
          )
          return
        }
        if (error.response?.status === 403) {
          setErrorMessage('병합 전환 권한이 없습니다. 관리자에게 문의해 주세요.')
          return
        }
        setErrorMessage(beMessage ?? '전환에 실패했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }
      setErrorMessage('전환에 실패했습니다. 잠시 후 다시 시도해 주세요.')
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
      title="출고전표로 병합 전환"
      size="xl"
      closeOnBackdropClick={!mergeMutation.isPending}
      closeOnEsc={!mergeMutation.isPending}
      data-testid="merge-convert-dialog"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
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
            disabled={!canSubmit || mergeMutation.isPending || isLoadingDetails}
            onClick={() => {
              setErrorMessage(null)
              mergeMutation.mutate()
            }}
          >
            {mergeMutation.isPending ? '발행 중…' : '병합 발행'}
          </Button>
        </>
      }
    >
      <div data-testid="merge-convert-dialog-body">
        {/* 에러 배너 */}
        {errorMessage ? (
          <div
            className={styles['errorBanner']}
            role="alert"
            data-testid="merge-convert-modal-error"
            style={{ whiteSpace: 'pre-line', alignItems: 'flex-start', marginBottom: 12 }}
          >
            {errorMessage}
          </div>
        ) : null}

        {/* 비가역 경고 */}
        <div
          className={styles['convertWarningBanner']}
          role="note"
          style={{ marginBottom: 16 }}
        >
          <strong>주의:</strong> 병합 발행 시 출고전표가 즉시 발행됩니다. 이 작업은 되돌릴 수 없습니다.
          {selectedOrders.length >= 2
            ? ` (${selectedOrders.length}개 주문을 단일 전표로 병합)`
            : null}
        </div>

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

        {/* 출고 창고 선택 (필수) */}
        <div
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
            required
            disabled={mergeMutation.isPending || warehousesQuery.isLoading}
            error={warehouseError}
          />
        </div>

        {/* 헤더 충돌 필드 — 주문마다 다른 값이 있는 경우 사용자에게 확정 요청 */}
        {conflictFields.length > 0 ? (
          <div
            style={{
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 6,
              padding: '10px 14px',
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 12, color: '#92400E', marginBottom: 8, fontWeight: 600 }}>
              아래 필드는 주문마다 값이 다릅니다. 최종 출고전표에 기록될 값을 입력하거나 선택하세요.
            </div>
            {conflictFields.map((key) => {
              const orderValues = orderDetails
                .filter(Boolean)
                .map((d) => extractShippingFieldValue(d!, key))
                .filter((v) => v !== '')
              return (
                <div
                  key={key}
                  data-testid={`merge-convert-shipping-field-${key}`}
                  style={{ marginBottom: 10 }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    {SHIPPING_FIELD_LABEL[key]}
                  </div>
                  {/* 각 주문의 값 라디오 선택 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
                    {orderValues.map((val, vi) => (
                      <label
                        key={`${key}-radio-${vi}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}
                      >
                        <input
                          type="radio"
                          name={`shipping-${key}`}
                          value={val}
                          checked={shippingFields[key] === val}
                          onChange={() => setShippingFields((prev) => ({ ...prev, [key]: val }))}
                          disabled={mergeMutation.isPending}
                        />
                        <span>
                          {/* 주문번호 표시 — UUID 비노출 */}
                          주문 {orderDetails.filter(Boolean)[vi]?.orderNumber ?? `#${vi + 1}`} :{' '}
                          <strong>{val}</strong>
                        </span>
                      </label>
                    ))}
                  </div>
                  {/* '/' 병기 직접 입력 */}
                  <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>
                    또는 직접 입력 ('/' 병기 가능 — 예: {orderValues.join(' / ')}):
                  </div>
                  <Input
                    aria-label={`${SHIPPING_FIELD_LABEL[key]} 직접 입력`}
                    value={shippingFields[key] ?? ''}
                    placeholder={`예: ${orderValues.join(' / ')}`}
                    onChange={(e) =>
                      setShippingFields((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    disabled={mergeMutation.isPending}
                    inputSize="sm"
                  />
                </div>
              )
            })}
          </div>
        ) : null}

        {/* 주문별 라인 표 */}
        {!isLoadingDetails && !hasDetailError
          ? orderDetails.map((detail, oi) => {
              if (!detail) return null
              const order = selectedOrders[oi]!
              return (
                <div
                  key={detail.orderNumber}
                  data-testid={`merge-convert-order-${detail.orderNumber}`}
                  style={{ marginBottom: 20 }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 8,
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    {/* 주문번호 사용자 노출 (UUID 비노출) */}
                    <span>주문 {detail.orderNumber}</span>
                    <span style={{ fontWeight: 400, color: '#6B7280' }}>
                      {order.partnerName ?? order.partnerCode}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '1px 6px',
                        borderRadius: 10,
                        background: '#EFF6FF',
                        color: '#1E40AF',
                      }}
                    >
                      {PARTNER_ORDER_STATUS_LABEL_LOCAL[order.status]}
                    </span>
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
                          const qtyKey = `${oi}-${line.lineId}`
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
                                  data-testid={`merge-convert-qty-${oi}-${li}`}
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
                    style={{ fontSize: 11, color: '#6B7280', marginTop: 4, textAlign: 'right' }}
                  >
                    합계 {krw(detail.totalAmount)}원
                  </div>
                </div>
              )
            })
          : null}
      </div>
    </Modal>
  )
}

/** 모달 내 status 한국어 라벨 (순환 import 방지용 로컬 상수). */
const PARTNER_ORDER_STATUS_LABEL_LOCAL: Record<string, string> = {
  DRAFT: '진행중',
  ON_HOLD: '보류',
  CONFIRMING: '확인중',
  CONFIRMED: '완료',
  CANCELED: '취소',
  CONVERTED: '전환완료',
}
