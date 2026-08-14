import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { getOutboundSlipScanContextByNumber, getSlipByNumber, type SlipType } from '../../api/slip'
import { SlipQrScanPanel } from '../components/SlipQrScanPanel'
import { SlipDetailPage } from '../SlipDetailPage'

/** 전표번호 opaque query만 URL에 남기고 기존 전표 상세 화면으로 진입한다. */
export function StockSlipByNumberPage({ mode }: { mode: SlipType }) {
  const [searchParams] = useSearchParams()
  const slipNo = searchParams.get('slipNo')?.trim() ?? ''
  const detailQuery = useQuery({
    queryKey: ['stock-slip-by-number', mode, slipNo],
    queryFn: () => getSlipByNumber(slipNo, mode),
    enabled: mode === 'INBOUND' && slipNo.length > 0,
    retry: false,
  })
  const scanQuery = useQuery({
    queryKey: ['stock-slip-scan-context-by-number', slipNo],
    queryFn: () => getOutboundSlipScanContextByNumber(slipNo),
    enabled: mode === 'OUTBOUND' && slipNo.length > 0,
    retry: false,
  })

  if (!slipNo) return <p role="alert">전표번호가 없습니다.</p>
  if (mode === 'OUTBOUND') {
    if (scanQuery.isError) return <p role="alert">출고전표를 찾을 수 없거나 스캔 권한이 없습니다.</p>
    if (!scanQuery.data) return <p role="status">출고전표를 불러오는 중입니다.</p>
    return (
      <section aria-label="출고전표 QR 스캔">
        <h1>출고전표 {scanQuery.data.slipNo}</h1>
        <p>상태: {scanQuery.data.status}</p>
        <SlipQrScanPanel slipNo={scanQuery.data.slipNo} canScan={scanQuery.data.canScan} />
      </section>
    )
  }
  if (detailQuery.isError) return <p role="alert">전표를 찾을 수 없거나 열람 권한이 없습니다.</p>
  if (!detailQuery.data) return <p role="status">전표를 불러오는 중입니다.</p>
  return <SlipDetailPage mode={mode} slipId={detailQuery.data.id} />
}
