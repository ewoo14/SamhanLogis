/**
 * 관리자 — 창고 관리 (`/admin/warehouses`).
 *
 * Phase 10 P0-5 슬라이스 4. BE `GET /inventory/warehouses/search?q=` backing.
 * 신규 창고 등록은 기존 `/warehouses` 화면 유지 — 본 화면은 관리자용 검색/조회.
 *
 * UUID 비공개 — 화면에는 code / name / type / address / displayOrder 만 표시.
 *
 * <h2>PR-H4c FE-C 보강 — 실시간 동기화</h2>
 * <ul>
 *   <li>30초 polling — 신규 창고 등록 / 정보 변경 결과 자동 반영.</li>
 *   <li>inventory-service SSE (PR-H4b BE-B) audit/edit-request 채널 합류 시 SSE 직접 구독 가능.</li>
 * </ul>
 *
 * data-testid:
 * - admin-warehouses-table
 * - admin-warehouses-search-input
 * - admin-warehouses-row-{code}
 * - admin-warehouses-edit-{code}
 * - admin-warehouses-delete-{code}           — soft-delete 트리거 (창고 비활성화)
 * - admin-warehouses-delete-confirm-{code}   — modal 확인 버튼
 * - admin-warehouses-delete-error            — 실패 시 빨간 배너
 * - admin-warehouses-view-mode               — view-mode 토글 컨테이너
 * - admin-warehouses-view-active             — '활성 창고' 탭
 * - admin-warehouses-view-deleted            — '비활성화된 창고' 탭
 * - admin-warehouses-restore-{code}          — 복구 트리거 (deleted view)
 * - admin-warehouses-restore-confirm-{code}  — modal 확인 버튼
 * - admin-warehouses-restore-error           — 실패 시 빨간 배너
 * - admin-warehouses-realtime-indicator
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  Modal,
  type DataTableColumn,
} from '@samhan/design-system'
import axios from 'axios'
import {
  deleteAdminWarehouse,
  listAdminWarehouses,
  listDeletedAdminWarehouses,
  restoreAdminWarehouse,
  type AdminWarehouse,
} from '../../api/adminApi'
import { usePageTitle } from '../../hooks/usePageTitle'
import { EditWarehouseModal } from '../../components/EditWarehouseModal'

const TYPE_LABEL: Record<AdminWarehouse['type'], string> = {
  HEADQUARTERS: '본사',
  VEHICLE: '차량',
  CONSIGNMENT: '위탁',
  VIRTUAL: '가상',
}

const TYPE_VARIANT: Record<
  AdminWarehouse['type'],
  'brand' | 'neutral' | 'success' | 'warning' | 'danger'
> = {
  HEADQUARTERS: 'brand',
  VEHICLE: 'success',
  CONSIGNMENT: 'neutral',
  VIRTUAL: 'warning',
}

export function WarehousesPage() {
  usePageTitle('창고관리')

  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [editTarget, setEditTarget] = useState<AdminWarehouse | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminWarehouse | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<AdminWarehouse | null>(null)
  /** 'active' = 활성 창고 (default), 'deleted' = 비활성화된 창고 (복구 화면). */
  const [viewMode, setViewMode] = useState<'active' | 'deleted'>('active')
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['admin', 'warehouses', q, page],
    queryFn: () =>
      listAdminWarehouses({
        q: q || undefined,
        page,
        size: 20,
      }),
    enabled: viewMode === 'active',
    // PR-H4c FE-C: 30초 polling — 멀티 워크스테이션 동기화 안전망.
    refetchInterval: 30_000,
  })

  /** 비활성화된 창고 — 복구 화면. */
  const deletedQuery = useQuery({
    queryKey: ['admin', 'warehouses-deleted'],
    queryFn: () => listDeletedAdminWarehouses(),
    enabled: viewMode === 'deleted',
  })

  /** soft-delete mutation — DELETE /inventory/warehouses/{id} (backend `WarehouseService.delete`). */
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminWarehouse(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'warehouses'] })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'warehouses-deleted'] })
      // listWarehouses (활성 창고) 도 invalidate — 사이드바 / dropdown 동기화
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      setDeleteTarget(null)
    },
  })

  /** 복구 mutation — POST /inventory/warehouses/{id}/restore. */
  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreAdminWarehouse(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'warehouses'] })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'warehouses-deleted'] })
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      setRestoreTarget(null)
    },
  })

  const deleteErrorMessage = (() => {
    if (!deleteMutation.isError) return null
    const err = deleteMutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '창고 비활성화에 실패했습니다.'
    }
    return '알 수 없는 오류'
  })()

  const restoreErrorMessage = (() => {
    if (!restoreMutation.isError) return null
    const err = restoreMutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '창고 복구에 실패했습니다.'
    }
    return '알 수 없는 오류'
  })()

  const totalPages = query.data
    ? Math.max(1, Math.ceil(query.data.total / query.data.size))
    : 1

  const isActiveView = viewMode === 'active'

  const columns: DataTableColumn<AdminWarehouse>[] = [
    {
      key: 'code',
      header: '코드',
      width: '120px',
      mobilePriority: 'primary',
      render: (w) => (
        <span data-testid={`admin-warehouses-row-${w.code}`}>{w.code}</span>
      ),
    },
    { key: 'name', header: '창고명', mobilePriority: 'secondary' },
    {
      key: 'type',
      header: '분류',
      width: '110px',
      mobilePriority: 'secondary',
      render: (w) => (
        <Badge variant={TYPE_VARIANT[w.type]}>{TYPE_LABEL[w.type]}</Badge>
      ),
    },
    {
      key: 'displayOrder',
      header: '표시 순서',
      width: '110px',
      align: 'right',
      mobilePriority: 'hidden',
    },
    {
      key: 'address',
      header: '주소',
      mobilePriority: 'hidden',
      render: (w) => w.address ?? '—',
    },
    {
      key: 'id',
      header: '액션',
      width: '160px',
      mobilePriority: 'hidden',
      render: (w) =>
        isActiveView ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setEditTarget(w)
              }}
              data-testid={`admin-warehouses-edit-${w.code}`}
              style={{
                padding: '4px 10px',
                border: '1px solid #d1d5db',
                borderRadius: 4,
                background: '#fff',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              편집
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setDeleteTarget(w)
              }}
              data-testid={`admin-warehouses-delete-${w.code}`}
              style={{
                padding: '4px 10px',
                border: '1px solid var(--color-danger-300)',
                borderRadius: 4,
                background: '#fff',
                color: 'var(--color-danger-700)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              비활성화
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setRestoreTarget(w)
            }}
            data-testid={`admin-warehouses-restore-${w.code}`}
            style={{
              padding: '4px 10px',
              border: '1px solid var(--color-brand-300)',
              borderRadius: 4,
              background: 'var(--color-brand-50)',
              color: 'var(--color-brand-700)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            복구
          </button>
        ),
    },
  ]

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: 0 }}>창고관리</h3>
        <span
          data-testid="admin-warehouses-realtime-indicator"
          style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
        >
          실시간 자동 갱신 · 30초
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {/* [view-mode toggle] 활성/비활성화 창고 view 전환 */}
        <div
          role="tablist"
          aria-label="창고 view 모드"
          data-testid="admin-warehouses-view-mode"
          style={{ display: 'inline-flex', border: '1px solid #d1d5db', borderRadius: 6 }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={isActiveView}
            onClick={() => setViewMode('active')}
            data-testid="admin-warehouses-view-active"
            style={{
              padding: '6px 14px',
              border: 'none',
              borderRight: '1px solid #d1d5db',
              background: isActiveView ? '#2563eb' : '#fff',
              color: isActiveView ? '#fff' : '#374151',
              cursor: 'pointer',
              fontSize: 13,
              borderRadius: '6px 0 0 6px',
            }}
          >
            활성 창고
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isActiveView}
            onClick={() => setViewMode('deleted')}
            data-testid="admin-warehouses-view-deleted"
            style={{
              padding: '6px 14px',
              border: 'none',
              background: !isActiveView ? '#2563eb' : '#fff',
              color: !isActiveView ? '#fff' : '#374151',
              cursor: 'pointer',
              fontSize: 13,
              borderRadius: '0 6px 6px 0',
            }}
          >
            비활성화된 창고
          </button>
        </div>

        {isActiveView ? (
          <input
            type="search"
            placeholder="코드 / 창고명 / 주소 검색"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(0)
            }}
            data-testid="admin-warehouses-search-input"
            style={{
              flex: '1 1 280px',
              minWidth: 240,
              height: 32,
              padding: '0 10px',
              border: '1px solid #D1D5DB',
              borderRadius: 6,
              fontSize: 13,
            }}
          />
        ) : (
          <div style={{ flex: 1 }} />
        )}
        {isActiveView ? (
          <a
            href="#/warehouses"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 14px',
              height: 32,
              border: '1px solid var(--color-brand-300)',
              borderRadius: 6,
              color: 'var(--color-brand-700)',
              background: 'var(--color-brand-50)',
              fontSize: 13,
            }}
          >
            신규 등록 (창고 화면)
          </a>
        ) : null}
      </div>

      <div data-testid="admin-warehouses-table">
        <DataTable
          columns={columns}
          rows={isActiveView ? (query.data?.items ?? []) : (deletedQuery.data ?? [])}
          loading={isActiveView ? query.isLoading : deletedQuery.isLoading}
          rowKey={(w) => w.id}
          emptyMessage={
            isActiveView
              ? '조건에 맞는 창고가 없습니다.'
              : '비활성화된 창고가 없습니다.'
          }
        />
      </div>

      {isActiveView && query.data && totalPages > 1 ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            marginTop: 16,
            fontSize: 13,
          }}
        >
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => p - 1)}
            style={pagerBtnStyle}
          >
            이전
          </button>
          <span>
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={pagerBtnStyle}
          >
            다음
          </button>
        </div>
      ) : null}

      <EditWarehouseModal
        warehouse={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['admin', 'warehouses'] })
          queryClient.invalidateQueries({ queryKey: ['warehouses'] })
        }}
      />

      {/* [창고 soft-delete UI] backend WarehouseService.delete 호출 — is_deleted=true 마킹.
          실제 row 는 보존되며 @SQLRestriction 가드로 활성 목록에서 자동 제외. 복구는 backend
          별도 endpoint (현재 미노출 — 데이터 직접 수정 필요) 로 가능. */}
      {deleteTarget ? (
        <Modal
          open
          onClose={() => {
            if (deleteMutation.isPending) return
            setDeleteTarget(null)
            deleteMutation.reset()
          }}
          title="창고 비활성화 확인"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setDeleteTarget(null)
                  deleteMutation.reset()
                }}
                disabled={deleteMutation.isPending}
              >
                취소
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                loading={deleteMutation.isPending}
                data-testid={`admin-warehouses-delete-confirm-${deleteTarget.code}`}
              >
                비활성화
              </Button>
            </>
          }
        >
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 8px' }}>
              <strong>{deleteTarget.name}</strong> ({deleteTarget.code}) 창고를
              비활성화합니다.
            </p>
            <ul style={{ margin: '8px 0 0 18px', padding: 0, fontSize: 13, color: 'var(--color-neutral-700)' }}>
              <li>활성 창고 목록 / 사이드바 / 드롭다운에서 제외됩니다.</li>
              <li>실제 데이터는 보존되며 (soft-delete), 기존 전표/이동 이력은 영향 받지 않습니다.</li>
              <li>복구는 backend 데이터 직접 수정 또는 별도 마이그레이션이 필요합니다.</li>
            </ul>
            {deleteErrorMessage ? (
              <div
                className="error-banner"
                role="alert"
                style={{ marginTop: 12 }}
                data-testid="admin-warehouses-delete-error"
              >
                {deleteErrorMessage}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {/* [복구 confirm modal] backend POST /inventory/warehouses/{id}/restore 호출.
          동일 code 의 활성 창고 존재 시 409 → error banner. */}
      {restoreTarget ? (
        <Modal
          open
          onClose={() => {
            if (restoreMutation.isPending) return
            setRestoreTarget(null)
            restoreMutation.reset()
          }}
          title="창고 복구 확인"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setRestoreTarget(null)
                  restoreMutation.reset()
                }}
                disabled={restoreMutation.isPending}
              >
                취소
              </Button>
              <Button
                variant="primary"
                onClick={() => restoreMutation.mutate(restoreTarget.id)}
                loading={restoreMutation.isPending}
                data-testid={`admin-warehouses-restore-confirm-${restoreTarget.code}`}
              >
                복구
              </Button>
            </>
          }
        >
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 8px' }}>
              <strong>{restoreTarget.name}</strong> ({restoreTarget.code}) 창고를
              다시 활성화합니다.
            </p>
            <ul style={{ margin: '8px 0 0 18px', padding: 0, fontSize: 13, color: 'var(--color-neutral-700)' }}>
              <li>활성 창고 목록 / 사이드바 / 드롭다운에 즉시 다시 노출됩니다.</li>
              <li>비활성화 이전의 정보 (이름 / 분류 / 주소 등) 그대로 복원됩니다.</li>
              <li>복구 사실은 변경 이력 (audit log) 에 1행 기록됩니다.</li>
            </ul>
            {restoreErrorMessage ? (
              <div
                className="error-banner"
                role="alert"
                style={{ marginTop: 12 }}
                data-testid="admin-warehouses-restore-error"
              >
                {restoreErrorMessage}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}

const pagerBtnStyle: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  border: '1px solid #D1D5DB',
  borderRadius: 4,
  background: '#fff',
  cursor: 'pointer',
  fontSize: 13,
}
