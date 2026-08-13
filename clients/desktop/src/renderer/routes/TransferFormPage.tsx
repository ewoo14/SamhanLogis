/**
 * 재고이동 작성 화면 — `/transfers/new`.
 *
 * BE `POST /inventory/transfers` (REQUESTED 상태로 시작) 호출.
 *
 * 라인 입력은 SlipFormPage 와 동일한 모델명 onBlur lookup 패턴 적용.
 * 이동전표는 단가/금액 개념이 없으므로 모델명 + 품목명 + 수량만 입력.
 *
 * 사유 (reason) 는 6종 enum (REBALANCE/URGENT/CONSOLIDATE/MAINTENANCE/SAMSUNG_DIRECT/OTHER).
 *
 * UUID 비공개: 출발/도착 창고 선택은 WarehouseAutocomplete (코드+이름 타이핑 검색),
 * 모델명 onBlur lookup 으로 productId 내부 보유.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  FormField,
  WarehouseAutocomplete,
} from '@samhan/design-system'
import axios from 'axios'
import {
  createTransfer,
  listWarehouses,
  TRANSFER_REASON_LABEL,
  type TransferReason,
} from '../api/inventory'
import { lookupProductByModelName } from '../api/slip'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  appendBlankRowIfLastChanged,
  removeLinePreservingMinimum,
} from '../utils/autoBlankRow'

interface TransferLineDraft {
  uid: string
  productId: string | null
  modelName: string
  productName: string
  requestedQuantity: string
  lookupError: string | null
  lookupLoading: boolean
}

let __lineUidCounter = 0
const nextLineUid = (): string => `transfer-line-${++__lineUidCounter}`

const emptyLine = (): TransferLineDraft => ({
  uid: nextLineUid(),
  productId: null,
  modelName: '',
  productName: '',
  requestedQuantity: '1',
  lookupError: null,
  lookupLoading: false,
})

const REASON_OPTIONS: TransferReason[] = [
  'REBALANCE',
  'URGENT',
  'CONSOLIDATE',
  'MAINTENANCE',
  'SAMSUNG_DIRECT',
  'OTHER',
]

export function TransferFormPage() {
  usePageTitle('새 재고이동')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sourceWh, setSourceWh] = useState<string | null>(null)
  const [destWh, setDestWh] = useState<string | null>(null)
  const [reason, setReason] = useState<TransferReason>('REBALANCE')
  const [reasonDetail, setReasonDetail] = useState('')
  const [lines, setLines] = useState<TransferLineDraft[]>([emptyLine()])

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const mutation = useMutation({
    mutationFn: () =>
      createTransfer({
        sourceWarehouseId: sourceWh!,
        destinationWarehouseId: destWh!,
        reason,
        reasonDetail: reasonDetail.trim() || undefined,
        lines: lines
          .filter((l) => l.productId && Number(l.requestedQuantity) > 0)
          .map((l) => ({
            productId: l.productId!,
            requestedQuantity: Number(l.requestedQuantity),
          })),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transfers'] })
      navigate('/transfers')
    },
  })

  const removeLine = (idx: number) =>
    setLines((ls) => {
      const target = ls[idx]
      return target
        ? removeLinePreservingMinimum(
          ls,
          target.uid,
          (line) => line.uid,
          emptyLine,
          1,
          (line) => Boolean(line.productId),
        )
        : ls
    })
  const updateLine = (idx: number, patch: Partial<TransferLineDraft>, fromUser = false) => {
    setLines((current) => {
      const before = current[idx]
      if (!before) return current
      const after = { ...before, ...patch }
      return fromUser
        ? appendBlankRowIfLastChanged(
          current,
          before,
          after,
          (line) => line.uid,
          emptyLine,
          (a, b) => a.modelName === b.modelName
            && a.productName === b.productName
            && a.requestedQuantity === b.requestedQuantity,
        )
        : current.map((line, index) => (index === idx ? after : line))
    })
  }

  const handleModelNameBlur = async (idx: number, modelName: string) => {
    const trimmed = modelName.trim()
    if (!trimmed) {
      updateLine(idx, { productId: null, lookupError: null, productName: '' })
      return
    }
    updateLine(idx, { lookupLoading: true, lookupError: null })
    try {
      const product = await lookupProductByModelName(trimmed)
      updateLine(idx, {
        productId: product.productId,
        productName: product.productName,
        lookupError: null,
        lookupLoading: false,
      })
    } catch (err) {
      const msg = axios.isAxiosError(err) && err.response?.status === 404
        ? '해당 모델명을 찾을 수 없습니다'
        : '모델명 조회에 실패했습니다'
      updateLine(idx, {
        productId: null,
        productName: '',
        lookupError: msg,
        lookupLoading: false,
      })
    }
  }

  const errorMessage = (() => {
    if (!mutation.isError) return null
    const err = mutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '이동전표 생성에 실패했습니다.'
    }
    return '알 수 없는 오류'
  })()

  const validLines = lines.filter(
    (l) => l.productId && Number(l.requestedQuantity) > 0,
  )
  const canSubmit
    = !!sourceWh
    && !!destWh
    && sourceWh !== destWh
    && validLines.length > 0
    && !mutation.isPending

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: 0 }}>새 이동전표</h3>
        <Button variant="ghost" onClick={() => navigate('/transfers')}>
          목록으로
        </Button>
      </div>

      <Card padding={5} shadow="sm">
        <div className="form-section">
          <div className="form-row">
            <WarehouseAutocomplete
              label="출발 창고"
              required
              warehouses={Array.isArray(warehousesQuery.data) ? warehousesQuery.data : []}
              value={sourceWh}
              onChange={(id) => setSourceWh(id)}
            />
            <WarehouseAutocomplete
              label="도착 창고"
              required
              warehouses={Array.isArray(warehousesQuery.data) ? warehousesQuery.data : []}
              value={destWh}
              onChange={(id) => setDestWh(id)}
              error={
                sourceWh && destWh && sourceWh === destWh
                  ? '출발/도착 창고가 같습니다'
                  : undefined
              }
            />
          </div>

          <div className="form-row">
            <FormField
              label="사유"
              required
              render={({ id }) => (
                <select
                  id={id}
                  value={reason}
                  onChange={(e) => setReason(e.target.value as TransferReason)}
                  style={inputStyle}
                >
                  {REASON_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {TRANSFER_REASON_LABEL[r]}
                    </option>
                  ))}
                </select>
              )}
            />
            <FormField
              label="사유 상세"
              render={({ id }) => (
                <input
                  id={id}
                  value={reasonDetail}
                  onChange={(e) => setReasonDetail(e.target.value)}
                  maxLength={500}
                  style={inputStyle}
                />
              )}
            />
          </div>
        </div>

        <h4 style={{ marginTop: 0 }}>이동 라인</h4>
        {lines.map((line, idx) => (
          <div className="line-row line-row-transfer" key={line.uid}>
            <FormField
              label={`라인 ${idx + 1} - 모델명`}
              required
              error={line.lookupError ?? undefined}
              render={({ id }) => (
                <input
                  id={id}
                  value={line.modelName}
                  onChange={(e) => updateLine(idx, {
                    modelName: e.target.value,
                    productId: null,
                    productName: '',
                  }, true)}
                  onBlur={(e) => void handleModelNameBlur(idx, e.target.value)}
                  placeholder="예: AJ040RXH4BC1"
                  style={inputStyle}
                />
              )}
            />
            <FormField
              label="품목명"
              render={({ id }) => (
                <input
                  id={id}
                  value={line.productName}
                  readOnly
                  placeholder={line.lookupLoading ? '조회중...' : '모델명 조회 후 자동입력'}
                  style={{ ...inputStyle, background: 'var(--color-neutral-50)' }}
                />
              )}
            />
            <FormField
              label="수량"
              required
              render={({ id }) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  value={line.requestedQuantity}
                  onChange={(e) =>
                    updateLine(idx, { requestedQuantity: e.target.value }, true)
                  }
                  style={inputStyle}
                />
              )}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeLine(idx)}
              disabled={lines.length === 1}
            >
              삭제
            </Button>
          </div>
        ))}
        {errorMessage ? (
          <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
            {errorMessage}
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 24,
          }}
        >
          <Button variant="ghost" onClick={() => navigate('/transfers')}>
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
    </>
  )
}

const inputStyle = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--color-neutral-300)',
  fontSize: 14,
  width: '100%',
} as const
