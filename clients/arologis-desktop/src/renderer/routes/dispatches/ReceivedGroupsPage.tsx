import { useQuery } from '@tanstack/react-query'
import { Card, DataTable, Input, type DataTableColumn } from '@samhan/design-system'
import { useState } from 'react'
import { receivedDispatchGroupsApi, type ReceivedDispatchGroup } from '../../api/receivedDispatchGroups'
import { usePageTitle } from '../../hooks/usePageTitle'

/** 수신 표시 정본 — 삼한 퍼블릭이 보낸 그룹 snapshot만 표시하고 수정·재분류하지 않는다. */
export function ReceivedGroupsPage() {
  usePageTitle('수신 배차 그룹')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const groups = useQuery({ queryKey: ['received-dispatch-groups', date], queryFn: () => receivedDispatchGroupsApi.list(date) })
  const columns: DataTableColumn<ReceivedDispatchGroup>[] = [
    { key: 'groupNo', header: '그룹 번호', render: row => row.groupNo },
    { key: 'vehicle', header: '차량', render: row => row.vehicleLabel },
    { key: 'carrier', header: '운송사', render: row => `${row.carrierCode} · ${row.carrierName}` },
    { key: 'slips', header: '전표', render: row => row.slips },
    { key: 'mode', header: '운영', render: () => '수신 전용' },
  ]
  return <main data-testid="arologis-received-groups-page" style={{ padding: 24, display: 'grid', gap: 16 }}><header><h1>수신 배차 그룹</h1><p>삼한 퍼블릭에서 전송받은 배차 그룹을 표시합니다. 아로로지스에서는 그룹을 수정하거나 재분류할 수 없습니다.</p></header><Card><label>배차 지정일 <Input aria-label="배차 지정일" type="date" value={date} onChange={e => setDate(e.target.value)} /></label></Card><Card>{groups.isError ? <p role="alert">수신 그룹을 불러오지 못했습니다.</p> : <DataTable columns={columns} rows={groups.data ?? []} rowKey={row => row.groupNo} emptyMessage="수신된 배차 그룹이 없습니다." />}</Card></main>
}
