/**
 * 분류 관리 페이지 (`/products/classifications`) — F1-b catL/catM/catS 계층 마스터 관리.
 *
 * 분류는 견적 카테고리별로 독립 관리한다. 좌측은 3단계 트리, 우측은 선택 노드 상세와 자식 목록이다.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  Input,
  Select,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  type EstimateCategory,
} from '../api/productCatalogApi'
import {
  createClassification,
  deleteClassification,
  listClassifications,
  updateClassification,
  updateClassificationFixedDiscount,
  type Classification,
  type ClassificationLevel,
} from '../api/classificationApi'
import { usePermissions } from '../hooks/usePermissions'
import { usePageTitleStore } from '../stores/pageTitle'
import { filterClassificationsByParent } from './ProductCatalogPageModel'

const ESTIMATE_CATEGORY_TABS = [
  { value: 'HOME_MULTI', label: '홈멀티' },
  { value: 'SINGLE_SET', label: '싱글중대형' },
  { value: 'COMMERCIAL_MULTI', label: '상업멀티' },
  { value: 'LEGACY', label: '구형' },
] as const satisfies ReadonlyArray<{ value: EstimateCategory; label: string }>

const LEVEL_LABEL: Record<ClassificationLevel, string> = {
  L: '대분류',
  M: '중분류',
  S: '소분류',
}

function errorMsg(err: unknown): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    typeof (err as { response?: unknown }).response === 'object' &&
    (err as { response?: { data?: { message?: unknown } } }).response?.data?.message
  ) {
    const msg = (err as { response: { data: { message: unknown } } }).response.data.message
    if (typeof msg === 'string' && msg.length > 0) return msg
  }
  if (err instanceof Error) return err.message
  return '처리 중 오류가 발생했습니다. 다시 시도해 주세요.'
}

async function fetchClassificationTree(estimateCategory: EstimateCategory): Promise<Classification[]> {
  const roots = await listClassifications({ estimateCategory })
  const midsByRoot = await Promise.all(
    roots.map((root) => listClassifications({ estimateCategory, parentId: root.id })),
  )
  const mids = midsByRoot.flat()
  const subsByMid = await Promise.all(
    mids.map((mid) => listClassifications({ estimateCategory, parentId: mid.id })),
  )
  return [...roots, ...mids, ...subsByMid.flat()]
}

function childLevel(level: ClassificationLevel): ClassificationLevel | null {
  if (level === 'L') return 'M'
  if (level === 'M') return 'S'
  return null
}

function parentLevel(level: ClassificationLevel): ClassificationLevel | null {
  if (level === 'M') return 'L'
  if (level === 'S') return 'M'
  return null
}

function TreeNodeLabel({ item }: { item: Classification }) {
  return (
    <span style={treeNodeLabelStyle}>
      <span>{item.name}</span>
      {!item.active ? (
        <Badge variant="neutral" data-testid={`classification-tree-node-${item.id}-inactive-badge`}>
          중지
        </Badge>
      ) : null}
    </span>
  )
}

export function ProductClassificationsPage() {
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canEdit = canAccess('products.admin', 'update')
  const canCreate = canAccess('products.admin', 'create')
  const canDelete = canAccess('products.admin', 'delete')

  const [category, setCategory] = useState<EstimateCategory>('HOME_MULTI')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftActive, setDraftActive] = useState(true)
  const [draftParentId, setDraftParentId] = useState<string | null>(null)
  const [draftFixedDiscountRate, setDraftFixedDiscountRate] = useState('')
  const [newName, setNewName] = useState('')
  const [newLevel, setNewLevel] = useState<ClassificationLevel>('L')
  const [newParentId, setNewParentId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setPageTitle({ title: '분류 관리', meta: '품목' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  const treeQuery = useQuery({
    queryKey: ['classifications-tree', category],
    queryFn: () => fetchClassificationTree(category),
    staleTime: 30_000,
  })

  const classifications = treeQuery.data ?? []
  const selected = classifications.find((item) => item.id === selectedId) ?? null
  const selectedChildLevel = selected ? childLevel(selected.catLevel) : null
  const selectedChildren = selected
    ? selectedChildLevel
      ? filterClassificationsByParent(classifications, selectedChildLevel, selected.id, { activeOnly: false })
      : []
    : filterClassificationsByParent(classifications, 'L', null, { activeOnly: false })

  useEffect(() => {
    if (!selected) {
      setDraftName('')
      setDraftActive(true)
      setDraftParentId(null)
      setDraftFixedDiscountRate('')
      return
    }
    setDraftName(selected.name)
    setDraftActive(selected.active)
    setDraftParentId(selected.parentId)
    setDraftFixedDiscountRate(selected.fixedDiscountRate == null ? '' : String(selected.fixedDiscountRate))
  }, [selected])

  useEffect(() => {
    setSelectedId(null)
    setMessage(null)
    setNewLevel('L')
    setNewParentId(null)
  }, [category])

  const parentOptions = useMemo(() => {
    const level = parentLevel(newLevel)
    if (!level) return []
    return classifications
      .filter((item) => item.catLevel === level)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'ko-KR'))
  }, [classifications, newLevel])

  const selectedParentOptions = useMemo(() => {
    if (!selected) return []
    const level = parentLevel(selected.catLevel)
    if (!level) return []
    return classifications
      .filter((item) => item.catLevel === level)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'ko-KR'))
  }, [classifications, selected])

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['classifications-tree'] })
    void queryClient.invalidateQueries({ queryKey: ['estimate-items-catalog'] })
  }, [queryClient])

  const createMutation = useMutation({
    mutationFn: () =>
      createClassification({
        estimateCategory: category,
        catLevel: newLevel,
        parentId: newLevel === 'L' ? null : newParentId,
        name: newName.trim(),
        active: true,
      }),
    onSuccess: (created) => {
      setMessage('분류를 추가했습니다.')
      setNewName('')
      setSelectedId(created.id)
      invalidate()
    },
    onError: (err) => setMessage(errorMsg(err)),
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('선택된 분류가 없습니다.')
      return Promise.all([
        updateClassification(selected.id, {
          name: draftName.trim(),
          parentId: selected.catLevel === 'L' ? null : draftParentId,
          active: draftActive,
        }),
        updateClassificationFixedDiscount(selected.id, draftFixedDiscountRate.trim() || null),
      ])
    },
    onSuccess: () => {
      setMessage('분류를 저장했습니다.')
      invalidate()
    },
    onError: (err) => setMessage(errorMsg(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('선택된 분류가 없습니다.')
      return deleteClassification(selected.id)
    },
    onSuccess: () => {
      setSelectedId(null)
      setMessage('분류를 삭제했습니다.')
      invalidate()
    },
    onError: (err) => setMessage(errorMsg(err)),
  })

  const moveMutation = useMutation({
    mutationFn: async ({ item, target }: { item: Classification; target: Classification }) => {
      await Promise.all([
        updateClassification(item.id, { displayOrder: target.displayOrder }),
        updateClassification(target.id, { displayOrder: item.displayOrder }),
      ])
    },
    onSuccess: () => {
      setMessage('순서를 변경했습니다.')
      invalidate()
    },
    onError: (err) => setMessage(errorMsg(err)),
  })

  const columns: DataTableColumn<Classification>[] = [
    {
      key: 'name',
      header: '분류명',
      width: '180px',
      mobilePriority: 'primary',
      render: (row) => (
        <span style={row.active ? undefined : inactiveTextStyle}>
          {row.name}
        </span>
      ),
    },
    {
      key: 'catLevel',
      header: '단계',
      width: '80px',
      mobilePriority: 'secondary',
      render: (row) => LEVEL_LABEL[row.catLevel],
    },
    {
      key: 'displayOrder',
      header: '순서',
      width: '70px',
      mobilePriority: 'hidden',
      render: (row) => String(row.displayOrder),
    },
    {
      key: 'fixedDiscountRate',
      header: '정액DC%',
      width: '90px',
      mobilePriority: 'secondary',
      render: (row) => row.fixedDiscountRate == null ? '미지정' : `${row.fixedDiscountRate}%`,
    },
    {
      key: 'active',
      header: '상태',
      width: '70px',
      mobilePriority: 'secondary',
      render: (row) => (
        <Badge variant={row.active ? 'success' : 'neutral'} data-testid={`classification-active-badge-${row.id}`}>
          {row.active ? '사용' : '중지'}
        </Badge>
      ),
    },
    {
      key: '_actions' as const,
      header: '관리',
      width: '110px',
      mobilePriority: 'hidden',
      render: (row) => {
        if (!canEdit) return null
        const index = selectedChildren.findIndex((item) => item.id === row.id)
        const previous = index > 0 ? selectedChildren[index - 1] : null
        const next = index >= 0 && index < selectedChildren.length - 1 ? selectedChildren[index + 1] : null
        return (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <button
              type="button"
              style={smallIconButtonStyle}
              onClick={() => previous && moveMutation.mutate({ item: row, target: previous })}
              disabled={!previous || moveMutation.isPending}
              data-testid={`classification-order-up-${row.id}`}
              aria-label="순서 올리기"
            >
              ↑
            </button>
            <button
              type="button"
              style={smallIconButtonStyle}
              onClick={() => next && moveMutation.mutate({ item: row, target: next })}
              disabled={!next || moveMutation.isPending}
              data-testid={`classification-order-down-${row.id}`}
              aria-label="순서 내리기"
            >
              ↓
            </button>
          </span>
        )
      },
    },
  ]

  return (
    <div style={pageStyle}>
      <div style={headerRowStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>분류 관리</h3>
          <span style={subtitleStyle}>견적 카테고리별 대/중/소 분류 마스터를 관리합니다.</span>
        </div>
      </div>

      <section role="tablist" aria-label="견적 카테고리" style={tabsStyle} data-testid="classification-category-tabs">
        {ESTIMATE_CATEGORY_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={category === tab.value}
            style={{ ...tabButtonStyle, ...(category === tab.value ? tabButtonSelectedStyle : {}) }}
            onClick={() => setCategory(tab.value)}
            data-testid={`classification-category-tab-${tab.value}`}
          >
            {tab.label}
          </button>
        ))}
      </section>

      {message ? (
        <div role="status" style={statusBannerStyle} data-testid="classification-status">
          {message}
        </div>
      ) : null}

      <div className="mobile-form-grid" style={contentGridStyle}>
        <aside style={treePanelStyle} data-testid="classification-tree">
          <div style={panelHeaderStyle}>분류 트리</div>
          {treeQuery.isLoading ? <p style={mutedStyle}>불러오는 중…</p> : null}
          {filterClassificationsByParent(classifications, 'L', null, { activeOnly: false }).map((catL) => (
            <div key={catL.id} style={treeGroupStyle}>
              <button
                type="button"
                style={{
                  ...treeButtonStyle,
                  ...(!catL.active ? inactiveTreeButtonStyle : {}),
                  ...(selectedId === catL.id ? treeButtonSelectedStyle : {}),
                }}
                onClick={() => setSelectedId(catL.id)}
                data-testid={`classification-tree-node-${catL.id}`}
              >
                <TreeNodeLabel item={catL} />
              </button>
              {filterClassificationsByParent(classifications, 'M', catL.id, { activeOnly: false }).map((catM) => (
                <div key={catM.id} style={treeChildStyle}>
                  <button
                    type="button"
                    style={{
                      ...treeButtonStyle,
                      ...(!catM.active ? inactiveTreeButtonStyle : {}),
                      ...(selectedId === catM.id ? treeButtonSelectedStyle : {}),
                    }}
                    onClick={() => setSelectedId(catM.id)}
                    data-testid={`classification-tree-node-${catM.id}`}
                  >
                    <TreeNodeLabel item={catM} />
                  </button>
                  {filterClassificationsByParent(classifications, 'S', catM.id, { activeOnly: false }).map((catS) => (
                    <button
                      key={catS.id}
                      type="button"
                      style={{
                        ...treeButtonStyle,
                        ...treeGrandChildStyle,
                        ...(!catS.active ? inactiveTreeButtonStyle : {}),
                        ...(selectedId === catS.id ? treeButtonSelectedStyle : {}),
                      }}
                      onClick={() => setSelectedId(catS.id)}
                      data-testid={`classification-tree-node-${catS.id}`}
                    >
                      <TreeNodeLabel item={catS} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </aside>

        <main style={detailPanelStyle}>
          <section style={formSectionStyle} data-testid="classification-create-panel">
            <div style={panelHeaderStyle}>분류 추가</div>
            <div style={formRowStyle}>
              <Select
                value={newLevel}
                onChange={(e) => {
                  const level = e.target.value as ClassificationLevel
                  setNewLevel(level)
                  setNewParentId(null)
                }}
                selectSize="sm"
                fullWidth={false}
                data-testid="classification-create-level"
                style={{ width: 110 }}
              >
                <option value="L">대분류</option>
                <option value="M">중분류</option>
                <option value="S">소분류</option>
              </Select>
              {newLevel !== 'L' ? (
                <Select
                  value={newParentId ?? ''}
                  onChange={(e) => setNewParentId(e.target.value || null)}
                  selectSize="sm"
                  fullWidth={false}
                  data-testid="classification-create-parent"
                  style={{ width: 160 }}
                >
                  <option value="">부모 선택</option>
                  {parentOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </Select>
              ) : null}
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="분류명"
                inputSize="sm"
                fullWidth={false}
                data-testid="classification-create-name"
                style={{ minWidth: 180 }}
              />
              {canCreate ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => createMutation.mutate()}
                  disabled={!newName.trim() || (newLevel !== 'L' && !newParentId) || createMutation.isPending}
                  loading={createMutation.isPending}
                  data-testid="classification-create-button"
                >
                  추가
                </Button>
              ) : null}
            </div>
          </section>

          <section style={formSectionStyle} data-testid="classification-detail-panel">
            <div style={panelHeaderStyle}>상세</div>
            {selected ? (
              <div className="mobile-form-grid" style={detailFormStyle}>
                <Input
                  label="분류명"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  inputSize="sm"
                  data-testid="classification-detail-name"
                />
                <Select
                  label="상태"
                  value={draftActive ? 'true' : 'false'}
                  onChange={(e) => setDraftActive(e.target.value === 'true')}
                  selectSize="sm"
                  data-testid="classification-detail-active"
                >
                  <option value="true">사용</option>
                  <option value="false">중지</option>
                </Select>
                {selected.catLevel !== 'L' ? (
                  <Select
                    label="부모"
                    value={draftParentId ?? ''}
                    onChange={(e) => setDraftParentId(e.target.value || null)}
                    selectSize="sm"
                    data-testid="classification-detail-parent"
                  >
                    <option value="">부모 선택</option>
                    {selectedParentOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </Select>
                ) : null}
                <Input
                  label="정액DC율(%)"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={draftFixedDiscountRate}
                  onChange={(e) => setDraftFixedDiscountRate(e.target.value)}
                  inputSize="sm"
                  disabled={!canEdit}
                  data-testid="classification-detail-fixed-discount"
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  {canEdit ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => updateMutation.mutate()}
                      loading={updateMutation.isPending}
                      disabled={!draftName.trim() || updateMutation.isPending}
                      data-testid="classification-detail-save"
                    >
                      저장
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        if (window.confirm('선택한 분류를 삭제할까요?')) {
                          deleteMutation.mutate()
                        }
                      }}
                      loading={deleteMutation.isPending}
                      disabled={deleteMutation.isPending}
                      data-testid="classification-detail-delete"
                    >
                      삭제
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <p style={mutedStyle}>왼쪽 트리에서 분류를 선택하세요.</p>
            )}
          </section>

          <section style={formSectionStyle} data-testid="classification-children-panel">
            <div style={panelHeaderStyle}>{selected ? `${selected.name} 하위 분류` : '대분류 목록'}</div>
            <DataTable<Classification>
              columns={columns}
              rows={selectedChildren}
              rowKey={(row) => row.id}
              loading={treeQuery.isFetching}
              emptyMessage="표시할 하위 분류가 없습니다."
            />
          </section>
        </main>
      </div>
    </div>
  )
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  height: '100%',
}

const headerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const subtitleStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-neutral-500, #6B7280)',
}

const tabsStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  flexWrap: 'nowrap',
  gap: 4,
  padding: 2,
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 6,
  background: 'var(--color-neutral-50, #F7F8FA)',
  alignSelf: 'flex-start',
  maxWidth: '100%',
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
}

const tabButtonStyle: CSSProperties = {
  appearance: 'none',
  border: '1px solid transparent',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--color-neutral-600, #4B5563)',
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const tabButtonSelectedStyle: CSSProperties = {
  borderColor: 'var(--color-primary-200, #BFDBFE)',
  background: 'var(--color-bg, #FFFFFF)',
  color: 'var(--color-primary-700, #1D4ED8)',
}

const contentGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '280px minmax(0, 1fr)',
  gap: 12,
  minHeight: 0,
  flex: 1,
}

const treePanelStyle: CSSProperties = {
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 8,
  background: 'var(--color-bg, #FFFFFF)',
  padding: 12,
  overflow: 'auto',
}

const detailPanelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
  overflow: 'auto',
}

const formSectionStyle: CSSProperties = {
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 8,
  background: 'var(--color-bg, #FFFFFF)',
  padding: 12,
}

const panelHeaderStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--color-neutral-700, #363D49)',
  marginBottom: 10,
}

const formRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 8,
  flexWrap: 'wrap',
}

const detailFormStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(180px, 1fr) 140px minmax(160px, 220px) auto',
  gap: 8,
  alignItems: 'end',
}

const treeGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  marginBottom: 6,
}

const treeChildStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  marginLeft: 14,
}

const treeButtonStyle: CSSProperties = {
  appearance: 'none',
  border: '1px solid transparent',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--color-neutral-700, #363D49)',
  padding: '4px 6px',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 12,
}

const inactiveTreeButtonStyle: CSSProperties = {
  color: 'var(--color-neutral-400, #9CA3AF)',
  background: 'var(--color-neutral-50, #F7F8FA)',
}

const treeButtonSelectedStyle: CSSProperties = {
  borderColor: 'var(--color-primary-200, #BFDBFE)',
  background: 'var(--color-primary-50, #EFF6FF)',
  color: 'var(--color-primary-700, #1D4ED8)',
  fontWeight: 700,
}

const treeGrandChildStyle: CSSProperties = {
  marginLeft: 14,
}

const treeNodeLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
  width: '100%',
}

const inactiveTextStyle: CSSProperties = {
  color: 'var(--color-neutral-400, #9CA3AF)',
}

const smallIconButtonStyle: CSSProperties = {
  appearance: 'none',
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 4,
  background: 'var(--color-bg, #FFFFFF)',
  cursor: 'pointer',
  width: 24,
  height: 24,
  fontSize: 12,
}

const mutedStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: 'var(--color-neutral-500, #6B7280)',
}

const statusBannerStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--color-neutral-700, #363D49)',
  background: 'var(--color-neutral-50, #F7F8FA)',
  border: '1px solid var(--color-border, #E5E7EB)',
  borderRadius: 4,
  padding: '6px 10px',
}
