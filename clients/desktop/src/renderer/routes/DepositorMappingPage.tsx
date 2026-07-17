import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Input,
  Modal,
  PartnerAutocomplete,
  Spinner,
  type DataTableColumn,
  type PartnerOption,
} from '@samhan/design-system'
import {
  createDepositorMapping,
  deleteDepositorMapping,
  listDepositorMappingHistory,
  listDepositorMappings,
  updateDepositorMapping,
  type DepositorMappingHistoryResponse,
  type DepositorMappingRequest,
  type DepositorMappingResponse,
} from '../api/accounting'
import { searchPartners } from '../api/partnerApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

interface MappingFormState {
  rawName: string
  reason: string
}

const EMPTY_FORM: MappingFormState = { rawName: '', reason: '' }

function formatDateTime(value: string): string {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 16)
}

/**
 * 매핑 행의 거래처를 자동완성 옵션으로 변환한다.
 * 거래처가 삭제/유실된 stale 매핑(partnerCode null)은 옵션을 만들 수 없어 null 을 반환한다
 * — 수정 모달은 빈 거래처로 열려 재선택을 유도한다.
 */
function partnerOptionOf(row: DepositorMappingResponse): PartnerOption | null {
  if (!row.partnerCode) return null
  return {
    partnerCode: row.partnerCode,
    name: row.partnerName ?? '',
  }
}

function historyValue(value: string | null | undefined): string {
  return value || '—'
}

export function DepositorMappingPage() {
  usePageTitle('입금자명 매핑', '입금자명 자동매칭 규칙')

  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canView = canAccess('accounting.deposit-mapping', 'view')
  const canCreate = canAccess('accounting.deposit-mapping', 'create')
  const canUpdate = canAccess('accounting.deposit-mapping', 'update')
  const canDelete = canAccess('accounting.deposit-mapping', 'delete')

  const [formOpen, setFormOpen] = useState(false)
  const [editingMapping, setEditingMapping] = useState<DepositorMappingResponse | null>(null)
  const [form, setForm] = useState<MappingFormState>(EMPTY_FORM)
  const [selectedPartner, setSelectedPartner] = useState<PartnerOption | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DepositorMappingResponse | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [historyTarget, setHistoryTarget] = useState<DepositorMappingResponse | null>(null)
  const [toast, setToast] = useState<{ type: 'error' | 'success'; message: string } | null>(null)

  const mappingsQuery = useQuery({
    queryKey: ['accounting', 'deposit-mappings'],
    queryFn: listDepositorMappings,
    enabled: canView,
  })

  const historyQuery = useQuery({
    queryKey: ['accounting', 'deposit-mappings', 'history', historyTarget?.normalizedName],
    queryFn: () => listDepositorMappingHistory(historyTarget!.normalizedName),
    enabled: canView && historyTarget !== null,
  })

  const closeForm = () => {
    setFormOpen(false)
    setEditingMapping(null)
    setForm(EMPTY_FORM)
    setSelectedPartner(null)
  }

  const openCreate = () => {
    setEditingMapping(null)
    setForm(EMPTY_FORM)
    setSelectedPartner(null)
    setFormOpen(true)
  }

  const openEdit = (row: DepositorMappingResponse) => {
    setEditingMapping(row)
    setForm({ rawName: row.rawName, reason: '' })
    setSelectedPartner(partnerOptionOf(row))
    setFormOpen(true)
  }

  const mutationOptions = {
    onSuccess: async () => {
      closeForm()
      setToast({ type: 'success', message: editingMapping ? '입금자명 매핑을 수정했습니다.' : '입금자명 매핑을 등록했습니다.' })
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'deposit-mappings'] })
    },
    onError: (error: Error) => setToast({ type: 'error', message: error.message || '입금자명 매핑 저장에 실패했습니다.' }),
  }

  const createMutation = useMutation({
    mutationFn: createDepositorMapping,
    ...mutationOptions,
  })

  const updateMutation = useMutation({
    mutationFn: ({ normalizedName, request }: { normalizedName: string; request: DepositorMappingRequest }) =>
      updateDepositorMapping(normalizedName, request),
    ...mutationOptions,
  })

  const deleteMutation = useMutation({
    mutationFn: ({ normalizedName, reason }: { normalizedName: string; reason?: string }) =>
      deleteDepositorMapping(normalizedName, reason),
    onSuccess: async () => {
      setDeleteTarget(null)
      setDeleteReason('')
      setToast({ type: 'success', message: '입금자명 매핑을 삭제했습니다.' })
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'deposit-mappings'] })
    },
    onError: (error: Error) => setToast({ type: 'error', message: error.message || '입금자명 매핑 삭제에 실패했습니다.' }),
  })

  const savePending = createMutation.isPending || updateMutation.isPending
  const rows = mappingsQuery.data ?? []

  const columns = useMemo<DataTableColumn<DepositorMappingResponse>[]>(() => {
    const base: DataTableColumn<DepositorMappingResponse>[] = [
      { key: 'rawName', header: '원본 입금자명', width: '180px' },
      { key: 'normalizedName', header: '정규화 입금자명', width: '180px' },
      {
        key: 'partnerCode',
        header: '거래처 코드',
        width: '150px',
        // stale 매핑(거래처 삭제/유실 — BE 가 partnerCode null 반환)은 공백 대신 경고 배지로 알린다.
        render: (row) => row.partnerCode ?? <Badge variant="warning">거래처 삭제됨</Badge>,
      },
      {
        key: 'partnerName',
        header: '거래처명',
        width: '180px',
        render: (row) => row.partnerName ?? '—',
      },
      { key: 'modifiedAt', header: '수정일시', width: '150px', render: (row) => formatDateTime(row.modifiedAt) },
      { key: 'actor', header: '수정자', width: '100px' },
      {
        key: 'active',
        header: '활성',
        width: '80px',
        render: (row) => <Badge variant={row.active ? 'success' : 'neutral'}>{row.active ? '활성' : '비활성'}</Badge>,
      },
      {
        key: 'actions',
        header: '관리',
        width: '230px',
        render: (row) => (
          <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
            <Button type="button" size="sm" variant="ghost" onClick={() => setHistoryTarget(row)}>
              이력
            </Button>
            {canUpdate ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => openEdit(row)}>
                수정
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => {
                  setDeleteReason('')
                  setDeleteTarget(row)
                }}
              >
                삭제
              </Button>
            ) : null}
          </div>
        ),
      },
    ]
    return base
  }, [canDelete, canUpdate])

  const submitForm = () => {
    const rawName = form.rawName.trim()
    // 옵셔널 체이닝 이중 적용 — stale 매핑 등으로 partnerCode 가 비어 있는 옵션이 들어와도 크래시하지 않는다.
    const partnerCode = selectedPartner?.partnerCode?.trim() ?? ''
    if (!rawName) {
      setToast({ type: 'error', message: '입금자명을 입력하세요.' })
      return
    }
    if (!partnerCode) {
      setToast({ type: 'error', message: '거래처를 선택하세요. 삭제된 거래처 매핑은 거래처를 다시 지정해야 저장할 수 있습니다.' })
      return
    }
    const request: DepositorMappingRequest = {
      rawName,
      partnerCode,
      reason: form.reason.trim() || undefined,
    }
    if (editingMapping) {
      updateMutation.mutate({ normalizedName: editingMapping.normalizedName, request })
    } else {
      createMutation.mutate(request)
    }
  }

  if (!canView) {
    return <Card><div role="alert">입금자명 매핑 조회 권한이 없습니다.</div></Card>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>입금자명 매핑</h3>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--color-neutral-500)' }}>
            동일한 입금자명이 들어오면 지정한 거래처로 자동 매칭됩니다.
          </div>
        </div>
        {canCreate ? (
          <Button type="button" variant="primary" onClick={openCreate} data-testid="depositor-mapping-create">
            매핑 등록
          </Button>
        ) : null}
      </div>

      {toast ? (
        <div role={toast.type === 'error' ? 'alert' : 'status'} className={`bank-transaction-toast bank-transaction-toast--${toast.type}`}>
          {toast.message}
        </div>
      ) : null}

      <Card style={{ padding: 16 }}>
        <DataTable
          columns={columns}
          rows={rows}
          loading={mappingsQuery.isLoading}
          emptyMessage={mappingsQuery.isError ? '매핑 목록을 불러오지 못했습니다.' : '등록된 입금자명 매핑이 없습니다.'}
          rowKey={(row) => row.normalizedName}
          tableLayout="fixed"
          rowTestId={(row) => `depositor-mapping-row-${row.normalizedName}`}
        />
        {mappingsQuery.isFetching && !mappingsQuery.isLoading ? <Spinner size="sm" label="매핑 목록 갱신 중" /> : null}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => { if (!savePending) closeForm() }}
        title={editingMapping ? '입금자명 매핑 수정' : '입금자명 매핑 등록'}
        size="md"
        closeOnBackdropClick={!savePending}
        closeOnEsc={!savePending}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={closeForm} disabled={savePending}>취소</Button>
            <Button type="button" variant="primary" onClick={submitForm} loading={savePending} data-testid="depositor-mapping-save">
              저장
            </Button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <Input
            label="원본 입금자명"
            value={form.rawName}
            maxLength={120}
            required
            onChange={(event) => setForm((prev) => ({ ...prev, rawName: event.target.value }))}
            data-testid="depositor-mapping-raw-name"
          />
          <PartnerAutocomplete
            label="거래처"
            ariaLabel="입금자명 매핑 거래처 검색"
            placeholder="거래처명/코드"
            value={selectedPartner}
            onChange={setSelectedPartner}
            searchPartners={searchPartners}
            required
            minChars={1}
            debounceMs={200}
            inputTestId="depositor-mapping-partner"
          />
          <Input
            label="변경 사유(선택)"
            value={form.reason}
            maxLength={500}
            onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
            data-testid="depositor-mapping-reason"
          />
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => { if (!deleteMutation.isPending) setDeleteTarget(null) }}
        title="입금자명 매핑 삭제"
        size="sm"
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>취소</Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate({ normalizedName: deleteTarget.normalizedName, reason: deleteReason.trim() || undefined })
              }}
              data-testid="depositor-mapping-delete-confirm"
            >
              삭제
            </Button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="warning-banner" role="alert">
            <strong>{deleteTarget?.rawName}</strong> 매핑을 삭제합니다. 이후 동일 입금자명은 자동매칭되지 않습니다.
          </div>
          <Input
            label="삭제 사유(선택)"
            value={deleteReason}
            maxLength={500}
            onChange={(event) => setDeleteReason(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={historyTarget !== null}
        onClose={() => setHistoryTarget(null)}
        title="입금자명 매핑 이력"
        size="lg"
      >
        <HistoryTable rows={historyQuery.data ?? []} loading={historyQuery.isLoading} />
      </Modal>
    </div>
  )
}

function HistoryTable({ rows, loading }: { rows: DepositorMappingHistoryResponse[]; loading: boolean }) {
  const columns: DataTableColumn<DepositorMappingHistoryResponse>[] = [
    { key: 'fieldName', header: '변경 항목', width: '150px' },
    { key: 'oldValue', header: '이전 값', render: (row) => historyValue(row.oldValue) },
    { key: 'newValue', header: '변경 값', render: (row) => historyValue(row.newValue) },
    { key: 'actor', header: '수정자', width: '100px' },
    { key: 'changedAt', header: '변경일시', width: '150px', render: (row) => formatDateTime(row.changedAt) },
  ]
  return (
    <DataTable
      columns={columns}
      rows={rows}
      loading={loading}
      emptyMessage="변경 이력이 없습니다."
      rowKey={(row) => `${row.changedAt}-${row.fieldName}-${row.newValue}`}
      tableLayout="fixed"
    />
  )
}
