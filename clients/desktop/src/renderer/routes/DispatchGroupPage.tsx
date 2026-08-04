import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, DataTable, FormField, Input, type DataTableColumn } from '@samhan/design-system'
import { carrierApi, dispatchGroupApi, type DispatchGroup } from '../api/dispatchGroupApi'
import { searchSlips, type SlipSearchResult } from '../api/slipSearch'
import { usePageTitle } from '../hooks/usePageTitle'

function today() { return new Date().toISOString().slice(0, 10) }

export function DispatchGroupPage() {
  usePageTitle('배차 그룹')
  const client = useQueryClient()
  const [date, setDate] = useState(today)
  const [groupNo, setGroupNo] = useState('')
  const [vehicleLabel, setVehicleLabel] = useState('')
  const [purchaseQuery, setPurchaseQuery] = useState('')
  const [purchaseResults, setPurchaseResults] = useState<SlipSearchResult[]>([])
  const [purchaseSearched, setPurchaseSearched] = useState(false)
  const groups = useQuery({ queryKey: ['dispatch-groups', date], queryFn: () => dispatchGroupApi.list(date) })
  const carriers = useQuery({ queryKey: ['admin-carriers'], queryFn: carrierApi.list })
  const create = useMutation({
    mutationFn: () => dispatchGroupApi.create({ groupNo, dispatchDate: date, vehicleLabel }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['dispatch-groups', date] }); setGroupNo(''); setVehicleLabel('') },
  })
  const searchPurchase = async () => {
    setPurchaseSearched(true)
    setPurchaseResults(await searchSlips(purchaseQuery, 20, 'INBOUND'))
  }
  const columns: DataTableColumn<DispatchGroup>[] = [
    { key: 'groupNo', header: '그룹 번호', render: (row) => row.groupNo },
    { key: 'vehicle', header: '차량', render: (row) => row.vehicleLabel },
    { key: 'carrier', header: '운송사', render: (row) => row.carrierCode ? `${row.carrierCode} · ${row.carrierName ?? ''}` : <span>운송사 미지정 — 지정 후 현장 편입</span> },
    { key: 'slips', header: '현장', render: (row) => <span>{row.slips.length}건</span> },
    { key: 'transferStatus', header: '전송 상태', render: (row) => <Badge variant="neutral">{row.transferStatus === 'NOT_SENT' ? '미전송' : row.transferStatus}</Badge> },
  ]
  return <main data-testid="dispatch-group-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
    <header><h1>배차 그룹</h1><p>가배차 판매전표와 검색한 구매전표를 차량 단위 그룹에 담습니다. 전송 상태는 읽기 전용입니다.</p></header>
    <Card><div style={{ display: 'flex', gap: 12, alignItems: 'end' }}><FormField label="배차 지정일" render={() => <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />} /><span>활성 운송사 {carriers.data?.filter((carrier) => carrier.isActive).length ?? 0}개</span></div></Card>
    <Card><form onSubmit={(e) => { e.preventDefault(); create.mutate() }} style={{ display: 'flex', gap: 12, alignItems: 'end' }}><FormField label="그룹 번호" render={() => <Input value={groupNo} onChange={(e) => setGroupNo(e.target.value)} required />} /><FormField label="차량 표시명" render={() => <Input value={vehicleLabel} onChange={(e) => setVehicleLabel(e.target.value)} required placeholder="예: 1톤 냉동 01" />} /><Button type="submit">그룹 생성</Button></form></Card>
    <Card><h2>구매전표 검색</h2><p>구매전표는 가배차 결과에 섞지 않고 검색으로만 조회합니다.</p><div style={{ display: 'flex', gap: 12 }}><Input aria-label="구매전표 검색어" value={purchaseQuery} onChange={(e) => setPurchaseQuery(e.target.value)} placeholder="전표번호 또는 거래처명" /><Button type="button" onClick={searchPurchase} disabled={!purchaseQuery.trim()}>검색</Button></div>{purchaseSearched && purchaseResults.length === 0 && <p>검색된 활성 구매전표가 없습니다.</p>}{purchaseResults.length > 0 && <ul>{purchaseResults.map((slip) => <li key={slip.slipNo}>{slip.slipNo} · {slip.partnerName ?? '거래처 미상'} <span title="S1 응답의 내부 mutation 식별자 보완 필요">그룹 편입 대기 — S1 그룹 식별자 계약 보완 필요</span></li>)}</ul>}</Card>
    <Card>{groups.isError ? <p role="alert">배차 그룹을 불러오지 못했습니다.</p> : <DataTable<DispatchGroup> columns={columns} rows={groups.data ?? []} rowKey={(row) => row.groupNo} emptyMessage="해당 지정일의 배차 그룹이 없습니다." />}</Card>
    <p style={{ color: '#667085' }}>그룹 수정·삭제·운송사 지정·현장 편입은 S1 응답에 내부 mutation 식별자가 추가된 뒤 활성화됩니다. 현재 그룹 번호와 전송 상태를 확인할 수 있습니다.</p>
  </main>
}
