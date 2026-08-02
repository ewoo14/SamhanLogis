import { useMemo, useState, type ReactNode } from 'react'
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
 * 거래처를 ACTIVE 로 확인한 경우에만 옵션을 만들고, 그 외 — stale(삭제/비활성,
 * staleTarget=true)이거나 일시 조회 불가(targetStatus='UNAVAILABLE') — 는 null 을 반환해
 * 수정 모달이 빈 거래처로 열리게 한다. partnerCode 는 stale 매핑이어도 BE 가
 * partnerCodeSnapshot 을 반환할 수 있어 null 검사만으로 stale 을 판정하지 않는다.
 */
function partnerOptionOf(row: DepositorMappingResponse): PartnerOption | null {
  if (!row.partnerCode || row.staleTarget || row.targetStatus !== 'ACTIVE') return null
  return {
    partnerCode: row.partnerCode,
    name: row.partnerName ?? '',
  }
}

/** UNAVAILABLE 판정 — 거래처 서비스 일시장애로 조회만 실패한 상태(#810 R3 계약: staleTarget=false). */
function isPartnerLookupUnavailable(row: DepositorMappingResponse): boolean {
  return !row.staleTarget && row.targetStatus === 'UNAVAILABLE'
}

/**
 * 거래처 코드 셀 — 세 가지 비정상 상태를 구분해 표시한다(#810 적대검증 R3 계약 pin).
 * ① staleTarget=true(거래처 삭제/비활성) → "거래처 재선택 필요" ② targetStatus='UNAVAILABLE'
 * (일시장애 중 조회 실패·staleTarget=false) → "거래처 조회 불가(일시)" — 재선택 강요가 아닌
 * 일시 상태 안내 ③ 코드 자체 부재 → "거래처 삭제됨". UUID 는 노출하지 않는다.
 */
export function partnerCodeCell(row: DepositorMappingResponse): ReactNode {
  if (row.staleTarget) {
    return <Badge variant="warning">거래처 재선택 필요{row.targetStatus ? ` (${row.targetStatus})` : ''}</Badge>
  }
  if (isPartnerLookupUnavailable(row)) {
    return <Badge variant="warning">거래처 조회 불가(일시)</Badge>
  }
  return row.partnerCode ?? <Badge variant="warning">거래처 삭제됨</Badge>
}

/** 거래처명 셀 — stale(재선택 필요)과 일시 조회 불가를 구분해 표시한다(#810 R3 계약 pin). */
export function partnerNameCell(row: DepositorMappingResponse): ReactNode {
  if (row.staleTarget) {
    return <span role="alert">비활성 거래처 — 재선택 필요</span>
  }
  if (isPartnerLookupUnavailable(row)) {
    return <span role="status">거래처 일시 조회 불가</span>
  }
  return row.partnerName ?? '—'
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
        // stale 매핑은 snapshot 코드가 있어도 재선택 필요, UNAVAILABLE 은 일시 조회 불가로 구분 표시.
        render: partnerCodeCell,
      },
      {
        key: 'partnerName',
        header: '거래처명',
        width: '180px',
        render: partnerNameCell,
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
          {editingMapping && isPartnerLookupUnavailable(editingMapping) ? (
            // #810 R3 계약 pin: 일시장애(UNAVAILABLE)는 "거래처 삭제됨"(stale)과 구분해 안내한다.
            <div className="warning-banner" role="status">
              거래처 조회 불가(일시) — 거래처 정보를 일시적으로 확인할 수 없어 거래처 칸을 비워 두었습니다.
              잠시 후 다시 시도해 주세요.
            </div>
          ) : null}
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
            searchPartners={(query) => searchPartners(query, { activeOnly: true, limit: 10000 })}
            required
            minChars={1}
            resultSelectionMode="single"
            resultSelectionTitle="거래처 검색 결과"
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
        // #832 R1 UX1: 작업/세대 컬럼 추가로 lg(720px)에서 값 컬럼이 ~59px 로 눌려 CJK 가
        // 글자단위로 래핑됐다. xl(≈980~1080px)로 넓혀 이전/변경 값 컬럼 가독성을 회복한다.
        size="xl"
      >
        <HistoryTable rows={historyQuery.data ?? []} loading={historyQuery.isLoading} />
      </Modal>
    </div>
  )
}

/**
 * 매핑 변경 이력 테이블 — BE 반환 순서를 재정렬 없이 그대로 신뢰한다(#810 적대검증 R3 L4-M1).
 *
 * BE 가 changedAt total-order(동시각 내 revisionNo desc·fieldName asc·entryKey tiebreak)로
 * 정렬해 반환하며, revisionNo 는 entity 단위 채번이라 같은 키의 삭제+재생성/rename 시 전역
 * 유일·단조가 아니다. FE 가 revisionNo 를 1차 정렬 키로 재정렬하면 구 entity 의 높은 회차가
 * 신 entity 위로 올라와 시간순이 뒤섞인다 — 회차(revisionNo)는 표시 전용이고 정렬 키가 아니다.
 *
 * rowKey 는 BE opaque entryKey(#810 R3 S4-M3) — revisionNo+changedAt+fieldName 조합은
 * 서로 다른 entity 가 같은 회차·시각·필드를 가질 수 있어(같은 초 삭제+재생성) React key 가
 * 충돌한다. entryKey 는 화면에 노출하지 않는다.
 *
 * 표시(#832 R1 fix): '작업'(operationOrdinal)과 '세대'(generation)는 한 셀로 병합해
 * 값 컬럼 폭을 확보하고(UX1), 같은 작업의 연속 필드행에는 첫 행에만 표기하고 나머지는
 * 공란+상단 구분선으로 작업 경계를 유지한다(UX2). 상단 범례로 두 용어의 뜻을 안내한다(UX3).
 * 그룹 경계 판정은 BE 순서(newest-first)를 재정렬 없이 순회하며 "직전 행과 동일 작업"
 * (operationOrdinal+generation 동일)인지로만 결정한다 — 정렬 키가 아니다.
 */
export function HistoryTable({ rows, loading }: { rows: DepositorMappingHistoryResponse[]; loading: boolean }) {
  const fieldLabels: Record<string, string> = {
    'mapping.rawName': '원본 입금자명',
    'mapping.normalizedName': '정규화 입금자명',
    'mapping.partnerCode': '거래처 코드',
    'mapping.reason': '변경 사유',
  }
  // 작업 그룹 경계 계산 — BE 순서(newest-first)를 재정렬 없이 순회하며 "직전 행과 동일 작업"
  // (operationOrdinal+generation 동일)이면 연속 필드행으로 본다.
  //  - groupFirstKeys: 각 작업 그룹의 첫 행 = '작업 N / N세대' 표기 대상(나머지는 공란)
  //  - groupBorderKeys: 그룹 첫 행 중 표 최상단(index 0) 제외 = 상단 구분선 대상
  // operationOrdinal 이 없거나 0 이하인 비정상 행은 그룹핑하지 않고 각자 단독 표기('—').
  const { groupFirstKeys, groupBorderKeys } = useMemo(() => {
    const first = new Set<string>()
    const border = new Set<string>()
    let prevOpKey: string | null = null
    rows.forEach((row, index) => {
      const opKey =
        row.operationOrdinal != null && row.operationOrdinal > 0
          ? `${row.operationOrdinal}/${row.generation}`
          : `__row_${row.entryKey}`
      if (opKey !== prevOpKey) {
        first.add(row.entryKey)
        if (index > 0) border.add(row.entryKey)
        prevOpKey = opKey
      }
    })
    return { groupFirstKeys: first, groupBorderKeys: border }
  }, [rows])

  const columns: DataTableColumn<DepositorMappingHistoryResponse>[] = [
    {
      key: 'operation',
      header: '작업 / 세대',
      width: '110px',
      // UX2: 같은 작업의 연속 필드행은 공란 처리(첫 행만 표기)해 작업 경계를 유지한다.
      render: (row) => {
        if (!groupFirstKeys.has(row.entryKey)) return null
        // UX4 null/0 가드 — "작업 undefined"/"작업 0"/"0세대" 를 방지한다.
        const opValid = row.operationOrdinal != null && row.operationOrdinal > 0
        const genValid = row.generation != null && row.generation > 0
        if (!opValid) return '—'
        return (
          <div className="depositor-history-op-cell">
            <span className="depositor-history-op-ordinal">작업 {row.operationOrdinal}</span>
            {genValid ? <span className="depositor-history-op-generation">{row.generation}세대</span> : null}
          </div>
        )
      },
    },
    { key: 'fieldName', header: '변경 항목', width: '150px', render: (row) => fieldLabels[row.fieldName] ?? row.fieldName },
    { key: 'oldValue', header: '이전 값', render: (row) => historyValue(row.oldValue) },
    { key: 'newValue', header: '변경 값', render: (row) => historyValue(row.newValue) },
    { key: 'actor', header: '수정자', width: '100px' },
    { key: 'changedAt', header: '변경일시', width: '150px', render: (row) => formatDateTime(row.changedAt) },
  ]
  return (
    <div>
      {/* UX3: '작업'(내부 순번)·'세대'(비표준어) 의도를 상단 범례로 안내한다. */}
      <p className="depositor-history-legend">
        <strong>작업</strong> = 한 번의 변경 단위(같은 작업의 여러 항목은 첫 행에만 표기) · <strong>세대</strong> = 삭제 후 재생성으로 새로 만든 매핑 구분
      </p>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage="변경 이력이 없습니다."
        rowKey={(row) => row.entryKey}
        // UX2: 작업 그룹 첫 행(최상단 제외) 상단에 구분선을 그어 경계를 강조한다.
        rowClassName={(row) => (groupBorderKeys.has(row.entryKey) ? 'depositor-history-group-start' : undefined)}
        tableLayout="fixed"
      />
    </div>
  )
}
