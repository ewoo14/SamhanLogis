import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { listTransfers } from '../../api/inventory'
import { TransferDetailPage } from '../TransferDetailPage'

/** 이동번호만 URL에 남기고 목록에서 내부 상세 키를 해석한다. UUID는 URL에 노출하지 않는다. */
export function StockTransferByNumberPage() {
  const [searchParams] = useSearchParams()
  const transferNo = searchParams.get('transferNo')?.trim() ?? ''
  const query = useQuery({
    queryKey: ['stock-transfer-by-number', transferNo],
    queryFn: () => listTransfers({ page: 0, size: 100 }),
    enabled: transferNo.length > 0,
    retry: false,
  })
  if (!transferNo) return <p role="alert">이동번호가 없습니다.</p>
  if (query.isError) return <p role="alert">이동전표를 찾을 수 없거나 열람 권한이 없습니다.</p>
  if (!query.data) return <p role="status">이동전표를 불러오는 중입니다.</p>
  const transfer = query.data.content.find((row) => row.transferNo === transferNo)
  if (!transfer) return <p role="alert">해당 이동전표를 찾을 수 없습니다.</p>
  return <TransferDetailPage opaqueTransferId={transfer.id} />
}
