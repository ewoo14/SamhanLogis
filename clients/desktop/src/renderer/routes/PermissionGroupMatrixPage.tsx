import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Spinner } from '@samhan/design-system'
import {
  emptyGroupPermissionMatrix,
  fetchPermissionGroupMatrix,
  fetchPermissionGroups,
  updatePermissionGroupMatrix,
} from '../api/permissionGroupsApi'
import {
  PERMISSION_ACTIONS,
  type AccountPermissionMatrix,
  type AccountPermissionUpdate,
  type PageCode,
  type PermissionAction,
  type PermissionActionMatrix,
} from '../api/permissionsApi'
import {
  PAGE_GROUPS,
  PAGE_LABEL,
  PAGES_ORDER,
  type PageGroup,
} from './permissionPageCatalog'
import { usePageTitle } from '../hooks/usePageTitle'

type MatrixState = Record<PageCode, PermissionActionMatrix>
type DirtyKey = `${PageCode}__${PermissionAction}`

const ACTION_LABEL: Record<PermissionAction, string> = {
  view: '보기',
  create: '생성',
  update: '수정',
  delete: '삭제',
  restore: '복원',
  download: '엑셀',
  print: '인쇄',
}

const matrixPageNorm = (page: PageCode): string => page.replace(/\./g, '-')
const dirtyKey = (page: PageCode, action: PermissionAction): DirtyKey => `${page}__${action}`
/** 일반 카탈로그에는 숨기되, 기존 보유 grant를 회수할 수 있게 하는 internal orphan. */
const REVOKABLE_HIDDEN_PAGES: PageCode[] = ['slip.period-lock']

function matrixToState(matrix: AccountPermissionMatrix | undefined): MatrixState {
  const state = {} as MatrixState
  for (const page of [...PAGES_ORDER, ...REVOKABLE_HIDDEN_PAGES]) state[page] = emptyGroupPermissionMatrix()
  for (const cell of matrix?.cells ?? []) {
    state[cell.pageCode] = {
      view: cell.view,
      create: cell.create,
      update: cell.update,
      delete: cell.delete,
      restore: cell.restore,
      download: cell.download,
      print: cell.print,
    }
  }
  return state
}

function dirtyKeys(server: MatrixState | null, current: MatrixState | null): Set<DirtyKey> {
  const dirty = new Set<DirtyKey>()
  if (!server || !current) return dirty
  for (const page of [...PAGES_ORDER, ...REVOKABLE_HIDDEN_PAGES]) {
    for (const action of PERMISSION_ACTIONS) {
      if (server[page]?.[action] !== current[page]?.[action]) dirty.add(dirtyKey(page, action))
    }
  }
  return dirty
}

function filteredGroups(search: string): PageGroup[] {
  const query = search.trim().toLowerCase()
  if (!query) return PAGE_GROUPS
  return PAGE_GROUPS
    .map((group) => ({
      ...group,
      pages: group.pages.filter((page) => {
        const label = PAGE_LABEL[page] ?? page
        return page.toLowerCase().includes(query) || label.toLowerCase().includes(query)
      }),
    }))
    .filter((group) => group.pages.length > 0)
}

function selectStyle(): React.CSSProperties {
  return {
    height: 34,
    minWidth: 220,
    border: '1px solid var(--color-neutral-300)',
    borderRadius: 6,
    padding: '0 8px',
    background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-900)',
    fontSize: 13,
  }
}

function smallButtonStyle(): React.CSSProperties {
  return {
    border: '1px solid var(--color-neutral-300)',
    borderRadius: 6,
    padding: '3px 7px',
    background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    fontSize: 11,
    cursor: 'pointer',
  }
}

function cellStyle(isDirty: boolean, action: PermissionAction): React.CSSProperties {
  const danger = action === 'delete' || action === 'restore'
  return {
    textAlign: 'center',
    borderBottom: '1px solid var(--color-neutral-200)',
    borderLeft: action === 'create' || action === 'restore' || action === 'download'
      ? '2px solid var(--color-neutral-300)'
      : undefined,
    background: isDirty
      ? 'var(--color-warning-50)'
      : danger
        ? 'var(--color-danger-50)'
        : 'var(--color-neutral-0)',
  }
}

export function PermissionGroupMatrixPage() {
  usePageTitle('권한그룹 권한')

  const queryClient = useQueryClient()
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [search, setSearch] = useState('')
  const [editState, setEditState] = useState<MatrixState | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const groupsQuery = useQuery({
    queryKey: ['admin', 'permission-groups'],
    queryFn: fetchPermissionGroups,
  })

  const matrixQuery = useQuery({
    queryKey: ['admin', 'permission-group-matrix', selectedGroupId],
    queryFn: () => fetchPermissionGroupMatrix(selectedGroupId),
    enabled: selectedGroupId.length > 0,
  })

  const selectedGroup = groupsQuery.data?.find((group) => group.id === selectedGroupId)
  const serverState = useMemo(() => matrixToState(matrixQuery.data), [matrixQuery.data])
  const currentState = editState ?? serverState
  const dirty = useMemo(() => dirtyKeys(serverState, currentState), [serverState, currentState])
  const visibleGroups = useMemo(() => filteredGroups(search), [search])
  const visiblePages = useMemo(() => visibleGroups.flatMap((group) => group.pages), [visibleGroups])

  useEffect(() => {
    const firstEditable = groupsQuery.data?.find((group) => !group.isSystemMaster) ?? groupsQuery.data?.[0]
    if (!selectedGroupId && firstEditable) setSelectedGroupId(firstEditable.id)
  }, [groupsQuery.data, selectedGroupId])

  useEffect(() => {
    setEditState(null)
  }, [selectedGroupId, matrixQuery.dataUpdatedAt])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const saveMutation = useMutation({
    mutationFn: (updates: AccountPermissionUpdate[]) => updatePermissionGroupMatrix(selectedGroupId, updates),
    onSuccess: (result) => {
      setEditState(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'permission-group-matrix', selectedGroupId] })
      void queryClient.invalidateQueries({ queryKey: ['permissions', 'my'] })
      setToast({ type: 'success', message: `${result.changedCount}건의 권한 변경을 저장했습니다.` })
    },
    onError: () => setToast({ type: 'error', message: '권한그룹 권한 저장 중 오류가 발생했습니다.' }),
  })

  const setPageActions = useCallback((
    pages: readonly PageCode[],
    actions: readonly PermissionAction[],
    allowed: boolean,
  ) => {
    setEditState((prev) => {
      const base = prev ?? currentState
      if (!base) return prev
      const next: MatrixState = { ...base }
      for (const page of pages) {
        const row = { ...(next[page] ?? emptyGroupPermissionMatrix()) }
        for (const action of actions) row[action] = allowed
        next[page] = row
      }
      return next
    })
  }, [currentState])

  const toggleCell = useCallback((page: PageCode, action: PermissionAction) => {
    setPageActions([page], [action], !(currentState?.[page]?.[action] ?? false))
  }, [currentState, setPageActions])

  const saveChanges = useCallback(() => {
    if (!selectedGroupId || !currentState || dirty.size === 0) return
    const dirtyPages = new Set<PageCode>()
    for (const key of dirty) dirtyPages.add(key.split('__')[0] as PageCode)
    const updates = Array.from(dirtyPages).map((page) => ({
      pageCode: page,
      actions: currentState[page] ?? emptyGroupPermissionMatrix(),
    }))
    saveMutation.mutate(updates)
  }, [currentState, dirty, saveMutation, selectedGroupId])

  const changeGroup = useCallback((groupId: string) => {
    if (dirty.size > 0 && !window.confirm('저장하지 않은 변경이 있습니다. 그룹을 변경할까요?')) return
    setSelectedGroupId(groupId)
  }, [dirty.size])

  if (groupsQuery.isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
  }

  if (groupsQuery.isError) {
    return <div style={{ padding: 48, color: 'var(--color-danger-600)' }}>권한그룹 목록을 불러오지 못했습니다.</div>
  }

  return (
    <div style={{ padding: '0 4px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>권한그룹 권한</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-neutral-500)' }}>
            그룹별 페이지 권한을 7개 액션 단위로 관리합니다.
          </p>
        </div>
        {selectedGroup ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {selectedGroup.isBuiltin ? <Badge variant="warning">잠금</Badge> : <Badge variant="brand">사용자정의</Badge>}
            <span style={{ fontSize: 13 }}>{selectedGroup.name}</span>
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          padding: 10,
          marginBottom: 10,
          border: '1px solid var(--color-neutral-200)',
          borderRadius: 8,
          background: 'var(--color-neutral-0)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <select
          data-testid="perm-group-select"
          aria-label="권한을 편집할 권한그룹"
          value={selectedGroupId}
          onChange={(event) => changeGroup(event.target.value)}
          style={selectStyle()}
        >
          {(groupsQuery.data ?? []).map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}{group.isBuiltin ? ' / 잠금' : ''}
            </option>
          ))}
        </select>

        <Button variant="ghost" onClick={() => setPageActions(PAGES_ORDER, PERMISSION_ACTIONS, true)} disabled={!currentState}>
          전체ON
        </Button>
        <Button variant="ghost" onClick={() => setPageActions(PAGES_ORDER, PERMISSION_ACTIONS, false)} disabled={!currentState}>
          전체OFF
        </Button>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="페이지 검색"
          aria-label="페이지 검색"
          style={{
            height: 34,
            width: 220,
            border: '1px solid var(--color-neutral-300)',
            borderRadius: 6,
            padding: '0 10px',
            fontSize: 13,
          }}
        />
      </div>

      {matrixQuery.isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : null}

      {!matrixQuery.isLoading && !matrixQuery.isError && currentState && REVOKABLE_HIDDEN_PAGES.some((page) =>
        PERMISSION_ACTIONS.some((action) => currentState[page]?.[action]),
      ) ? (
        <section
          aria-label="비노출 권한그룹 권한 회수"
          style={{ marginBottom: 12, padding: 12, border: '1px solid var(--color-warning-300)', borderRadius: 8 }}
        >
          <strong>비노출 권한그룹 권한 회수</strong>
          <p style={{ margin: '6px 0 10px', color: 'var(--color-neutral-600)', fontSize: 12 }}>
            일반 권한 카탈로그에는 표시하지 않지만, 기존 보유 그룹 권한은 여기서 회수할 수 있습니다.
          </p>
          {REVOKABLE_HIDDEN_PAGES.filter((page) => PERMISSION_ACTIONS.some((action) => currentState[page]?.[action])).map((page) => (
            <Button
              key={page}
              variant="ghost"
              onClick={() => setPageActions([page], PERMISSION_ACTIONS, false)}
              data-testid={`perm-group-matrix-revoke-${matrixPageNorm(page)}`}
            >
              {page} 보유 권한 전체 회수
            </Button>
          ))}
        </section>
      ) : null}

      {!matrixQuery.isLoading && !matrixQuery.isError && currentState ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 160px', gap: 12 }}>
          <div
            data-testid="perm-group-matrix-table"
            style={{
              overflow: 'auto',
              maxHeight: 'calc(100vh - 230px)',
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 8,
              background: 'var(--color-neutral-0)',
            }}
          >
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 980, fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 30 }}>
                <tr>
                  <th style={headerStyle('left')}>페이지 ({visiblePages.length})</th>
                  {PERMISSION_ACTIONS.map((action) => (
                    <th key={action} style={headerStyle('center')}>
                      <button
                        type="button"
                        data-testid={`perm-group-matrix-col-all-${action}`}
                        onClick={() => {
                          const shouldEnable = PAGES_ORDER.some((page) => !(currentState[page]?.[action] ?? false))
                          setPageActions(PAGES_ORDER, [action], shouldEnable)
                        }}
                        style={smallButtonStyle()}
                      >
                        {ACTION_LABEL[action]}
                      </button>
                    </th>
                  ))}
                  <th style={headerStyle('center')}>행전체</th>
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((group) => (
                  <GroupRows
                    key={group.label}
                    group={group}
                    currentState={currentState}
                    dirty={dirty}
                    onCellToggle={toggleCell}
                    onRowToggle={(page) => {
                      const row = currentState[page] ?? emptyGroupPermissionMatrix()
                      const shouldEnable = PERMISSION_ACTIONS.some((action) => !row[action])
                      setPageActions([page], PERMISSION_ACTIONS, shouldEnable)
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <aside
            style={{
              position: 'sticky',
              top: 70,
              alignSelf: 'start',
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 8,
              padding: 12,
              background: dirty.size > 0 ? 'var(--color-warning-50)' : 'var(--color-neutral-50)',
            }}
          >
            <div data-testid="perm-group-matrix-change-count" role="status" style={{ fontWeight: 700, marginBottom: 10 }}>
              변경 {dirty.size}건
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button
                variant="primary"
                onClick={saveChanges}
                disabled={dirty.size === 0 || saveMutation.isPending}
                data-testid="perm-group-matrix-save-btn"
              >
                {saveMutation.isPending ? '저장 중' : '저장'}
              </Button>
              <Button variant="ghost" onClick={() => setEditState(null)} disabled={dirty.size === 0 || saveMutation.isPending}>
                취소
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      {toast ? (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 100,
            borderRadius: 8,
            padding: '10px 14px',
            background: toast.type === 'success' ? 'var(--color-success-600)' : 'var(--color-danger-600)',
            color: 'var(--color-neutral-0)',
            boxShadow: 'var(--shadow-lg)',
            fontSize: 13,
          }}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  )
}

function GroupRows({
  group,
  currentState,
  dirty,
  onCellToggle,
  onRowToggle,
}: {
  group: PageGroup
  currentState: MatrixState
  dirty: Set<DirtyKey>
  onCellToggle: (page: PageCode, action: PermissionAction) => void
  onRowToggle: (page: PageCode) => void
}) {
  return (
    <>
      <tr>
        <td colSpan={PERMISSION_ACTIONS.length + 2} style={domainHeaderStyle}>
          {group.label} ({group.pages.length})
        </td>
      </tr>
      {group.pages.map((page) => (
        <tr key={page}>
          <th scope="row" style={rowHeaderStyle}>
            <span>{PAGE_LABEL[page] ?? page}</span>
            <span style={{ color: 'var(--color-neutral-500)', fontSize: 11, fontWeight: 400 }}>{page}</span>
          </th>
          {PERMISSION_ACTIONS.map((action) => (
            <td key={action} style={cellStyle(dirty.has(dirtyKey(page, action)), action)}>
              <input
                type="checkbox"
                data-testid={`perm-group-matrix-cell-${matrixPageNorm(page)}-${action}`}
                checked={currentState[page]?.[action] ?? false}
                onChange={() => onCellToggle(page, action)}
                aria-label={`${PAGE_LABEL[page] ?? page} ${ACTION_LABEL[action]}`}
              />
            </td>
          ))}
          <td style={{ textAlign: 'center', borderBottom: '1px solid var(--color-neutral-200)' }}>
            <button
              type="button"
              data-testid={`perm-group-matrix-row-all-${matrixPageNorm(page)}`}
              onClick={() => onRowToggle(page)}
              style={smallButtonStyle()}
            >
              전부
            </button>
          </td>
        </tr>
      ))}
    </>
  )
}

function headerStyle(align: 'left' | 'center'): React.CSSProperties {
  return {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    padding: '8px 10px',
    textAlign: align,
    background: 'var(--color-neutral-50)',
    borderBottom: '1px solid var(--color-neutral-300)',
    color: 'var(--color-neutral-700)',
    fontWeight: 700,
  }
}

const domainHeaderStyle: React.CSSProperties = {
  padding: '7px 10px',
  background: 'var(--color-brand-50)',
  borderTop: '1px solid var(--color-brand-200)',
  borderBottom: '1px solid var(--color-brand-200)',
  color: 'var(--color-brand-700)',
  fontWeight: 700,
}

const rowHeaderStyle: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 10,
  padding: '7px 10px',
  textAlign: 'left',
  background: 'var(--color-neutral-0)',
  borderBottom: '1px solid var(--color-neutral-200)',
  fontWeight: 600,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}
