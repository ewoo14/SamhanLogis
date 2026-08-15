import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  Button,
  Modal,
  Spinner,
  WarehouseAutocomplete,
} from '@samhan/design-system'
import type { Warehouse } from '@samhan/design-system'
import { listWarehouses } from '../../api/inventory'
import {
  convertPartnerOrderToSlip,
  getPartnerOrder,
  type PartnerOrderDetail,
  type PartnerOrderSummary,
} from '../../api/sales'
import { toOrderPathId } from '../../utils/orderNo'
import {
  runIndividualConversions,
  type IndividualConversionResult,
} from './individualConversion'

interface IndividualConvertDialogProps {
  selectedOrders: PartnerOrderSummary[]
  onClose: () => void
  onMerge: () => void
  onCompleted: (results: IndividualConversionResult[]) => void
  mergeError?: string | null
  mergeDisabled?: boolean
  mergeDisabledReason?: string
}

const SELECTABLE_STATUSES = new Set<PartnerOrderSummary['status']>(['DRAFT', 'ON_HOLD'])

export function IndividualConvertDialog({
  selectedOrders,
  onClose,
  onMerge,
  onCompleted,
  mergeError,
  mergeDisabled = false,
  mergeDisabledReason,
}: IndividualConvertDialogProps) {
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<IndividualConversionResult[] | null>(null)

  const detailQueries = useQueries({
    queries: selectedOrders.map((order) => ({
      queryKey: ['partner-order', toOrderPathId(order.orderNumber)],
      queryFn: () => getPartnerOrder(toOrderPathId(order.orderNumber)),
      retry: 1,
      staleTime: 0,
      refetchOnMount: 'always' as const,
    })),
  })
  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const details = detailQueries
    .map((query) => query.data)
    .filter((detail): detail is PartnerOrderDetail => Boolean(detail))
  const loading = detailQueries.some((query) => query.isLoading) || warehousesQuery.isLoading
  const hasError = detailQueries.some((query) => query.isError) || warehousesQuery.isError
  const invalidDetails = details.filter((detail) => !SELECTABLE_STATUSES.has(detail.status))
  const convertibleDetails = details.filter((detail) => SELECTABLE_STATUSES.has(detail.status))
  const payloadPreview = useMemo(() => convertibleDetails.map((detail) => ({
    orderNumber: detail.orderNumber,
    itemCount: detail.lines.filter((line) => line.quantity - (line.convertedQuantity ?? 0) > 0).length,
  })), [convertibleDetails])
  const canExecute = !loading && !hasError && invalidDetails.length === 0 &&
    convertibleDetails.length === selectedOrders.length && Boolean(selectedWarehouse) && !running

  const handleExecute = async () => {
    if (!selectedWarehouse || !canExecute) return
    setRunning(true)
    const nextResults = await runIndividualConversions(
      convertibleDetails,
      selectedWarehouse.code,
      convertPartnerOrderToSlip,
    )
    setResults(nextResults)
    setRunning(false)
    onCompleted(nextResults)
  }

  const successCount = results?.filter((result) => result.status === 'success').length ?? 0
  const failureResults = results?.filter((result) => result.status === 'failed') ?? []

  return (
    <Modal
      open
      onClose={() => { if (!running) onClose() }}
      title="출고전표 개별 전환"
      size="lg"
      closeOnBackdropClick={!running}
      closeOnEsc={!running}
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={running}>
            닫기
          </Button>
        </>
      )}
    >
      <div data-testid="individual-convert-dialog-body">
        <div role="note" data-testid="individual-convert-warning">
          개별전환은 주문마다 별도 출고전표를 만들고, 병합전환은 한 거래처 주문을 하나의 출고전표로 만듭니다.
        </div>
        {loading ? <div data-testid="individual-convert-loading"><Spinner size="sm" label="주문 정보를 확인하는 중" /></div> : null}
        {hasError ? <div role="alert" data-testid="individual-convert-load-error">주문 또는 창고 정보를 불러오지 못했습니다.</div> : null}
        {mergeError ? <div role="alert" data-testid="individual-convert-merge-error">{mergeError}</div> : null}
        {invalidDetails.length > 0 ? (
          <div role="alert" data-testid="individual-convert-invalid-status">
            이미 전환됐거나 전환할 수 없는 주문이 포함되어 있습니다: {invalidDetails.map((detail) => detail.orderNumber).join(', ')}
          </div>
        ) : null}
        <div data-testid="individual-convert-payload-preview">
          {payloadPreview.map((item) => (
            <div key={item.orderNumber} data-testid={`individual-convert-payload-${item.orderNumber}`}>
              {item.orderNumber} → 출고전표 1건 ({item.itemCount}개 품목)
            </div>
          ))}
        </div>
        {!results ? (
          <>
          <WarehouseAutocomplete
            warehouses={warehousesQuery.data ?? []}
            value={selectedWarehouse?.id ?? null}
            onChange={(_id, warehouse) => setSelectedWarehouse(warehouse)}
            label="출고 창고"
            placeholder="창고 코드 또는 이름 입력"
            hideVirtual
            resultSelectionMode="single"
            autoSelectSingleResult
            required
            disabled={running || loading}
          />
          <div data-testid="individual-convert-choice-buttons" style={{ display: 'grid', gap: 12, marginTop: 20 }}>
            <Button
              type="button"
              variant="primary"
              data-testid="individual-convert-action"
              disabled={!canExecute}
              onClick={() => void handleExecute()}
              style={{ width: '100%', minHeight: 64, fontSize: 20 }}
            >
              개별전환
            </Button>
            <Button
              type="button"
              variant="secondary"
              data-testid="merge-convert-action"
              disabled={running || mergeDisabled}
              title={mergeDisabled ? mergeDisabledReason : undefined}
              onClick={onMerge}
              style={{ width: '100%', minHeight: 64, fontSize: 20 }}
            >
              병합전환
            </Button>
            {mergeDisabled && mergeDisabledReason ? (
              <span role="alert" data-testid="individual-convert-merge-permission-hint">
                {mergeDisabledReason}
              </span>
            ) : null}
          </div>
          </>
        ) : (
          <div data-testid="individual-convert-results">
            <strong>개별 전환 결과: 성공 {successCount}건 / 실패 {failureResults.length}건</strong>
            {results.map((result) => (
              <div key={result.orderNumber} data-testid={`individual-convert-result-${result.orderNumber}`}>
                {result.orderNumber}: {result.status === 'success' ? `성공 (${result.slipNo})` : `실패 (${result.reason})`}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
