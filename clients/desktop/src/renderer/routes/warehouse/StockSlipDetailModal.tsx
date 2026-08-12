import { Modal } from '@samhan/design-system'
import { useQuery } from '@tanstack/react-query'
import { getSlipByNumber, type SlipType } from '../../api/slip'

export function StockSlipDetailModal({ slipNo, slipType, onClose }: { slipNo: string; slipType: SlipType; onClose: () => void }) {
  const query = useQuery({ queryKey: ['stock-slip-detail', slipNo, slipType], queryFn: () => getSlipByNumber(slipNo, slipType) })
  const slip = query.data
  return <Modal open onClose={onClose} title={slip ? `${slipType === 'INBOUND' ? '입고' : '출고'}전표 ${slip.slipNo}` : '전표 상세'}>
    {query.isError ? <p role="alert">전표를 불러오지 못했습니다.</p> : !slip ? <p>전표를 불러오는 중입니다.</p> : <div>
      <p>전표번호: {slip.slipNo}</p>
      <p>일자: {slip.slipDate}</p>
      <p>거래처: {slip.partnerName ?? '—'}</p>
      <ul>{slip.lines.map((line, index) => <li key={index}>{line.modelName ?? line.productName ?? '품목'} × {line.quantity}</li>)}</ul>
    </div>}
  </Modal>
}
