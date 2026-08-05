import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, DataTable, FormField, Input, type DataTableColumn } from '@samhan/design-system'
import { carrierApi, type Carrier } from '../api/dispatchGroupApi'
import { usePageTitle } from '../hooks/usePageTitle'

type Draft = { code: string; name: string; isArologis: boolean }
const emptyDraft: Draft = { code: '', name: '', isArologis: false }

export function CarrierListPage() {
  usePageTitle('운송사 목록')
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editing, setEditing] = useState<Carrier | null>(null)
  const carriers = useQuery({ queryKey: ['admin-carriers'], queryFn: carrierApi.list })
  const save = useMutation({
    mutationFn: () => editing
      ? carrierApi.update(editing.code, { code: draft.code, name: draft.name, isArologis: draft.isArologis })
      : carrierApi.create({ code: draft.code, name: draft.name, isArologis: draft.isArologis }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-carriers'] }); setDraft(emptyDraft); setEditing(null) },
  })
  const toggle = useMutation({
    mutationFn: (carrier: Carrier) => carrierApi.update(carrier.code, { isActive: !carrier.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-carriers'] }),
  })
  const columns: DataTableColumn<Carrier>[] = [
    { key: 'code', header: '코드', render: (row) => row.code },
    { key: 'name', header: '운송사명', render: (row) => row.name },
    { key: 'arologis', header: '아로로지스', render: (row) => <Badge variant={row.isArologis ? 'success' : 'neutral'}>{row.isArologis ? '대상' : '아님'}</Badge> },
    { key: 'partner', header: '정산 거래처', render: () => <span>운송사 코드 기준</span> },
    { key: 'active', header: '사용 여부', render: (row) => <Badge variant={row.isActive ? 'success' : 'neutral'}>{row.isActive ? '사용' : '중지'}</Badge> },
    { key: 'actions', header: '관리', render: (row) => <span style={{ display: 'flex', gap: 8 }}><Button size="sm" variant="secondary" onClick={() => { setEditing(row); setDraft({ code: row.code, name: row.name, isArologis: row.isArologis }) }}>수정</Button><Button size="sm" variant="secondary" onClick={() => toggle.mutate(row)}>{row.isActive ? '사용 중지' : '사용 재개'}</Button></span> },
  ]
  return <main data-testid="carrier-list-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
    <header><h1>운송사 목록</h1><p>인사 마스터에서 배차 운송사와 정산 거래처 연결 상태를 관리합니다.</p></header>
    <Card><form onSubmit={(event) => { event.preventDefault(); save.mutate() }} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: 12, alignItems: 'end' }}>
      <FormField label="운송사 코드" render={() => <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} required />} />
      <FormField label="운송사명" render={() => <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />} />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 10 }}><input type="checkbox" checked={draft.isArologis} onChange={(e) => setDraft({ ...draft, isArologis: e.target.checked })} /> 아로로지스</label>
      <span style={{ display: 'flex', gap: 8 }}><Button type="submit">{editing ? '수정 저장' : '운송사 등록'}</Button>{editing && <Button type="button" variant="secondary" onClick={() => { setEditing(null); setDraft(emptyDraft) }}>취소</Button>}</span>
    </form></Card>
    <Card>{carriers.isError ? <p role="alert">운송사 목록을 불러오지 못했습니다.</p> : <DataTable<Carrier> columns={columns} rows={carriers.data ?? []} rowKey={(row) => row.code} emptyMessage="등록된 운송사가 없습니다." />}</Card>
  </main>
}
