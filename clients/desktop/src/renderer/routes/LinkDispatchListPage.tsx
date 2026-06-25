/**
 * 링크발송 (배송 묶음) 목록 — link-dispatch-slice FE 메인 화면.
 *
 * 라우트: `/sales/link-dispatch` (사이드바 메뉴 "링크발송").
 *
 * Designer wireframes.md § 1 + ux-flow.md § 1 충실 반영:
 * - 상단 액션 바: 날짜 입력 + [날짜 자동 그룹] primary 버튼
 * - 표 6 컬럼 (배송일/기사명/연락처/전표수/링크/SMS발송완료)
 * - 행 클릭 → BatchDetailModal (전표 N건 + 추가/제거)
 * - sent 행은 옅은 파랑 배경 (--batch-list-row-sent-bg #F0F9FF)
 *
 * 사용자 노출 식별자: driverName / slipCount / 날짜 / signUrl 만 (UUID 미노출).
 *
 * 회귀 가드:
 * - usePageTitle('링크발송') — AppHeader 동적 화면명
 * - rowKey 는 batch.id 사용 (React key 전용, 화면 미노출 — UUID 가드 준수)
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  CopyButton,
  DataTable,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  autoGroup,
  listBatches,
  sendBatchSms,
  type DeliveryBatchSummary,
} from '../api/delivery'
import { usePageTitle } from '../hooks/usePageTitle'
import { BatchStatusCell } from './components/BatchStatusCell'
import { BatchDetailModal } from './components/BatchDetailModal'

/** 오늘 날짜 (YYYY-MM-DD) — 기본 필터값. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function LinkDispatchListPage() {
  usePageTitle('링크발송')
  const queryClient = useQueryClient()

  const [date, setDate] = useState<string>(today())
  /** 행 클릭 시 모달이 여는 대상 배치 — null 이면 모달 닫힘. */
  const [openBatchId, setOpenBatchId] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['delivery-batches', date],
    queryFn: () => listBatches({ date }),
  })

  const autoGroupMutation = useMutation({
    mutationFn: () => autoGroup(date),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-batches'] })
    },
  })

  const sendSmsMutation = useMutation({
    mutationFn: (batchId: string) => sendBatchSms(batchId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-batches'] })
    },
  })

  const handleAutoGroup = () => {
    if (!date) {
      alert('날짜를 선택해주세요.')
      return
    }
    autoGroupMutation.mutate()
  }

  const handleSendSms = (batch: DeliveryBatchSummary) => {
    const action = batch.smsSentAt ? '재발송' : '발송'
    const msg = `${batch.driverName} (${batch.driverPhone}) 에게 SMS ${action} 합니다.\n\n전표 ${batch.slipCount}건 e-sign URL 을 포함합니다.\n진행할까요?`
    if (!window.confirm(msg)) return
    sendSmsMutation.mutate(batch.id)
  }

  const columns = useMemo<DataTableColumn<DeliveryBatchSummary>[]>(
    () => [
      {
        key: 'driverName',
        header: '기사명',
        width: '120px',
        mobilePriority: 'primary',
      },
      {
        key: 'deliveryDate',
        header: '배송일',
        width: '120px',
        mobilePriority: 'secondary',
      },
      {
        key: 'driverPhone',
        header: '연락처',
        width: '140px',
        mobilePriority: 'hidden',
      },
      {
        key: 'slipCount',
        header: '전표수',
        width: '80px',
        align: 'right',
        mobilePriority: 'secondary',
        render: (row) => `${row.slipCount}건`,
      },
      {
        key: 'signUrl',
        header: '링크',
        mobilePriority: 'hidden',
        render: (row) => (
          <span className="link-cell" onClick={(e) => e.stopPropagation()}>
            <span className="link-cell-url" title={row.signUrl}>
              {row.signUrl}
            </span>
            <CopyButton text={row.signUrl} label="복사" />
          </span>
        ),
      },
      {
        key: 'smsSentAt',
        header: 'SMS 발송완료',
        width: '160px',
        mobilePriority: 'hidden',
        render: (row) => (
          <BatchStatusCell
            smsSentAt={row.smsSentAt}
            onSendClick={() => handleSendSms(row)}
          />
        ),
      },
    ],
    // handleSendSms 는 클로저 — 매 렌더 새로 생성되지만 cell render 자체가 inline 이라
    // 컬럼 정의 재생성 비용이 의미있지 않음. mount 시 한 번 고정.
    [],
  )

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0 }}>링크발송 (배송 묶음)</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>
              배송일
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="batch-date-input"
            />
          </label>
          <Button
            variant="primary"
            onClick={handleAutoGroup}
            loading={autoGroupMutation.isPending}
            disabled={!date}
          >
            날짜 자동 그룹
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={Array.isArray(query.data) ? query.data : []}
        loading={query.isLoading}
        rowKey={(b) => b.id}
        rowClassName={(b) => (b.smsSentAt ? 'batch-row-sent' : undefined)}
        onRowClick={(b) => setOpenBatchId(b.id)}
        emptyMessage="해당 날짜의 배송 묶음이 없습니다. [날짜 자동 그룹] 으로 생성하세요."
      />

      {query.isError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          배송 묶음 목록을 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : null}

      {autoGroupMutation.isError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          자동 그룹에 실패했습니다.
        </div>
      ) : null}

      {sendSmsMutation.isError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          SMS 발송에 실패했습니다.
        </div>
      ) : null}

      <BatchDetailModal
        open={!!openBatchId}
        batchId={openBatchId}
        onClose={() => setOpenBatchId(null)}
      />
    </>
  )
}
