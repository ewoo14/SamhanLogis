import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { getSlipByNumber, type SlipType } from '../../api/slip'
import { SlipDetailPage } from '../SlipDetailPage'

/** 전표번호 opaque query만 URL에 남기고 기존 전표 상세 화면으로 진입한다. */
export function StockSlipByNumberPage({ mode }: { mode: SlipType }) {
  const [searchParams] = useSearchParams()
  const slipNo = searchParams.get('slipNo')?.trim() ?? ''
  const query = useQuery({
    queryKey: ['stock-slip-by-number', mode, slipNo],
    queryFn: () => getSlipByNumber(slipNo, mode),
    enabled: slipNo.length > 0,
    retry: false,
  })

  if (!slipNo) return <p role="alert">전표번호가 없습니다.</p>
  if (query.isError) return <p role="alert">전표를 찾을 수 없거나 열람 권한이 없습니다.</p>
  if (!query.data) return <p role="status">전표를 불러오는 중입니다.</p>
  return <SlipDetailPage mode={mode} slipId={query.data.id} />
}
