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
  const [selectedGroupNo, setSelectedGroupNo] = useState('')
  const groups = useQuery({ queryKey: ['dispatch-groups', date], queryFn: () => dispatchGroupApi.list(date) })
  const carriers = useQuery({ queryKey: ['admin-carriers'], queryFn: carrierApi.list })
  const create = useMutation({
    mutationFn: () => dispatchGroupApi.create({ groupNo, dispatchDate: date, vehicleLabel }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['dispatch-groups', date] }); setGroupNo(''); setVehicleLabel('') },
  })
  const update = useMutation({ mutationFn: ({ groupNo, vehicleLabel }: { groupNo: string; vehicleLabel: string }) => dispatchGroupApi.update(groupNo, { dispatchDate: date, vehicleLabel }), onSuccess: () => client.invalidateQueries({ queryKey: ['dispatch-groups', date] }) })
  const remove = useMutation({ mutationFn: (groupNo: string) => dispatchGroupApi.remove(groupNo), onSuccess: () => client.invalidateQueries({ queryKey: ['dispatch-groups', date] }) })
  const assignCarrier = useMutation({ mutationFn: ({ groupNo, code }: { groupNo: string; code: string }) => dispatchGroupApi.assignCarrier(groupNo, code), onSuccess: () => client.invalidateQueries({ queryKey: ['dispatch-groups', date] }) })
  const clearCarrier = useMutation({ mutationFn: (groupNo: string) => dispatchGroupApi.clearCarrier(groupNo), onSuccess: () => client.invalidateQueries({ queryKey: ['dispatch-groups', date] }) })
  const addSlip = useMutation({ mutationFn: ({ groupNo, slipNo, inclusionType }: { groupNo: string; slipNo: string; inclusionType: 'OUTBOUND' | 'INBOUND' }) => dispatchGroupApi.addSlip(groupNo, slipNo, inclusionType), onSuccess: () => client.invalidateQueries({ queryKey: ['dispatch-groups', date] }) })
  const transfer = useMutation({ mutationFn: (groupNo: string) => dispatchGroupApi.transfer(groupNo), onSuccess: () => client.invalidateQueries({ queryKey: ['dispatch-groups', date] }) })
  const mutationError = [update, remove, assignCarrier, clearCarrier, addSlip, transfer].find((mutation) => mutation.isError)?.error
  const searchPurchase = async () => {
    setPurchaseSearched(true)
    setPurchaseResults(await searchSlips(purchaseQuery, 20, 'INBOUND'))
  }
  const columns: DataTableColumn<DispatchGroup>[] = [
    { key: 'groupNo', header: '그룹 번호', render: (row) => row.groupNo },
    { key: 'vehicle', header: '차량', render: (row) => row.vehicleLabel },
    { key: 'carrier', header: '운송사', render: (row) => <span>{row.carrierCode ? `${row.carrierCode} · ${row.carrierName ?? ''}` : '운송사 미지정'} {row.transferStatus !== 'SENT' && row.carrierCode && <Button type="button" onClick={() => clearCarrier.mutate(row.groupNo)}>지정 해제</Button>} {row.transferStatus !== 'SENT' && carriers.data?.filter((carrier) => carrier.isActive && carrier.code !== row.carrierCode).map((carrier) => <Button key={carrier.code} type="button" onClick={() => assignCarrier.mutate({ groupNo: row.groupNo, code: carrier.code })}>{carrier.code} 지정</Button>)} {row.transferStatus !== 'SENT' && row.carrierCode && !row.carrierArologis && <small>아로로지스 운송사가 아니므로 전송하지 않습니다.</small>}</span> },
    { key: 'slips', header: '현장', render: (row) => <span>{row.slips.length}건</span> },
    { key: 'transferStatus', header: '전송 상태', render: (row) => <Badge variant="neutral">{row.transferStatus === 'NOT_SENT' ? '미전송' : row.transferStatus}</Badge> },
    { key: 'actions', header: '조작', render: (row) => <span>{row.transferStatus === 'SENT' ? <small>전송 완료 그룹은 수정·삭제·현장 변경이 잠깁니다.</small> : <><Button type="button" onClick={() => update.mutate({ groupNo: row.groupNo, vehicleLabel: window.prompt('차량 표시명', row.vehicleLabel) ?? row.vehicleLabel })}>그룹 수정</Button> <Button type="button" onClick={() => remove.mutate(row.groupNo)}>그룹 삭제</Button>{row.carrierArologis && row.carrierCode && row.slips.length > 0 && <Button type="button" onClick={() => { if (window.confirm('아로로지스로 전송합니다. 전송 후 그룹은 수정할 수 없습니다. 계속할까요?')) transfer.mutate(row.groupNo) }}>{row.transferStatus === 'FAILED' ? '전송 재시도' : '아로로지스로 전송'}</Button>}</>}</span> },
  ]
  return <main data-testid="dispatch-group-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
    <header><h1>배차 그룹</h1><p>가배차 판매전표와 검색한 구매전표를 차량 단위 그룹에 담습니다. 전송 상태는 읽기 전용입니다.</p></header>
    <Card><div style={{ display: 'flex', gap: 12, alignItems: 'end' }}><FormField label="배차 지정일" render={() => <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />} /><span>활성 운송사 {carriers.data?.filter((carrier) => carrier.isActive).length ?? 0}개</span></div></Card>
    <Card><form onSubmit={(e) => { e.preventDefault(); create.mutate() }} style={{ display: 'flex', gap: 12, alignItems: 'end' }}><FormField label="그룹 번호" render={() => <Input value={groupNo} onChange={(e) => setGroupNo(e.target.value)} required />} /><FormField label="차량 표시명" render={() => <Input value={vehicleLabel} onChange={(e) => setVehicleLabel(e.target.value)} required placeholder="예: 1톤 냉동 01" />} /><Button type="submit">그룹 생성</Button></form></Card>
    <Card><h2>구매전표 검색</h2><p>구매전표는 가배차 결과에 섞지 않고 검색으로만 조회합니다.</p><div style={{ display: 'flex', gap: 12 }}><Input aria-label="구매전표 검색어" value={purchaseQuery} onChange={(e) => setPurchaseQuery(e.target.value)} placeholder="전표번호 또는 거래처명" /><select aria-label="편입 대상 그룹" value={selectedGroupNo} onChange={(e) => setSelectedGroupNo(e.target.value)}><option value="">편입 대상 선택</option>{(groups.data ?? []).map((group, index) => <option key={group.groupNo} value={group.groupNo} aria-label={group.groupNo}>그룹 {index + 1}</option>)}</select><Button type="button" onClick={searchPurchase} disabled={!purchaseQuery.trim()}>검색</Button></div>{purchaseSearched && purchaseResults.length === 0 && <p>검색된 활성 구매전표가 없습니다.</p>}{purchaseResults.length > 0 && <ul>{purchaseResults.map((slip) => <li key={slip.slipNo}>{slip.slipNo} · {slip.partnerName ?? '거래처 미상'} <Button type="button" disabled={!selectedGroupNo} onClick={() => addSlip.mutate({ groupNo: selectedGroupNo, slipNo: slip.slipNo, inclusionType: 'INBOUND' })}>그룹에 편입</Button></li>)}</ul>}</Card>
    <Card>{groups.isError ? <p role="alert">배차 그룹을 불러오지 못했습니다.</p> : <DataTable<DispatchGroup> columns={columns} rows={groups.data ?? []} rowKey={(row) => row.groupNo} emptyMessage="해당 지정일의 배차 그룹이 없습니다." />}</Card>
    {mutationError && <p role="alert">조작을 저장하지 못했습니다. 다른 사용자가 먼저 변경했거나 현재 상태가 바뀌었을 수 있습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.</p>}
  </main>
}
