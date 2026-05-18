/**
 * 권한 매트릭스 관리 화면 — SP-D1 슬라이스.
 *
 * MASTER 전용 (`/admin/permission-matrix`).
 * 역할(행) × 페이지(열) 체크박스 그리드로 권한을 시각적으로 관리.
 *
 * 기능:
 * - 7 역할 × 12 페이지 코드 = 최대 84 셀 (view / edit 체크박스 2개)
 * - 셀 변경 시 dirty 상태 강조 (노란 배경)
 * - "저장" 버튼 → 변경된 셀만 batch update API 호출 + toast
 * - "초기화" 버튼 → 서버 데이터로 롤백 (dirty 취소)
 *
 * data-testid:
 * - permission-matrix-table          — 매트릭스 표 wrapper
 * - permission-cell-{role}-{page}    — 개별 셀 td
 * - permission-view-{role}-{page}    — view 체크박스
 * - permission-edit-{role}-{page}    — edit 체크박스
 * - permission-save-btn              — 저장 버튼
 * - permission-reset-btn             — 초기화 버튼
 */
import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Badge, Spinner } from '@samhan/design-system'
import {
  fetchPermissionMatrix,
  updatePermissionBatch,
  type PermissionCell,
  type PermissionMatrix,
  type PermissionUpdateItem,
  type RbacRole,
  type PageCode,
} from '../api/permissionsApi'
import { usePageTitle } from '../hooks/usePageTitle'

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** 표시 순서 고정 역할 7개 (MASTER 제외 — MASTER 는 항상 전권이므로 편집 불가). */
const ROLES_ORDER: RbacRole[] = [
  'DEVELOPER',
  'MANAGER',
  'DISPATCH',
  'SALES',
  'ACCOUNTANT',
  'WAREHOUSE',
  'INVENTORY',
]

/** 역할 한국어 라벨. */
const ROLE_LABEL: Record<RbacRole, string> = {
  MASTER: '마스터',
  DEVELOPER: '개발자',
  MANAGER: '매니저',
  DISPATCH: '배차담당자',
  SALES: '영업원',
  ACCOUNTANT: '회계원',
  WAREHOUSE: '창고원',
  INVENTORY: '재고원',
}

/** 페이지 코드 12개 표시 순서. */
const PAGES_ORDER: PageCode[] = [
  'DASHBOARD',
  'WAREHOUSES',
  'SALES',
  'PURCHASES',
  'TRANSFERS',
  'ACCOUNTING',
  'AROLOGIS',
  'WAREHOUSE_OPS',
  'DISPATCH_BOARD',
  'REPORTS',
  'ADMIN',
  'PERMISSION_MATRIX',
]

/** 페이지 코드 한국어 라벨. */
const PAGE_LABEL: Record<PageCode, string> = {
  DASHBOARD: '대시보드',
  WAREHOUSES: '창고 관리',
  SALES: '판매관리',
  PURCHASES: '구매관리',
  TRANSFERS: '재고이동',
  ACCOUNTING: '회계',
  AROLOGIS: 'arologis',
  WAREHOUSE_OPS: '창고 운영',
  DISPATCH_BOARD: '배차 메뉴',
  REPORTS: '재무 보고서',
  ADMIN: '인사 관리',
  PERMISSION_MATRIX: '권한 관리',
}

/** edit 액션이 의미 있는 페이지 코드 목록. 나머지는 view 만 표시. */
const PAGES_WITH_EDIT: Set<PageCode> = new Set([
  'WAREHOUSES',
  'SALES',
  'PURCHASES',
  'TRANSFERS',
  'ACCOUNTING',
  'WAREHOUSE_OPS',
  'ADMIN',
  'PERMISSION_MATRIX',
])

// ---------------------------------------------------------------------------
// 내부 상태 타입
// ---------------------------------------------------------------------------

/** 셀 편집 상태 키. */
type CellKey = `${RbacRole}__${PageCode}`

function cellKey(role: RbacRole, page: PageCode): CellKey {
  return `${role}__${page}`
}

/** 편집 중인 매트릭스 상태 (서버 데이터 + 로컬 변경 오버레이). */
type EditState = Record<CellKey, PermissionCell>

/** 서버 응답을 EditState 로 변환. */
function matrixToEditState(matrix: PermissionMatrix): EditState {
  const state: EditState = {} as EditState
  for (const cell of matrix.cells) {
    state[cellKey(cell.roleCode, cell.pageCode)] = cell
  }
  // 매트릭스에 없는 셀은 기본값 false 로 채움.
  for (const role of ROLES_ORDER) {
    for (const page of PAGES_ORDER) {
      const k = cellKey(role, page)
      if (!state[k]) {
        state[k] = { roleCode: role, pageCode: page, view: false, edit: false }
      }
    }
  }
  return state
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

export function PermissionMatrixPage() {
  usePageTitle('권한 매트릭스 관리')

  const queryClient = useQueryClient()

  const matrixQuery = useQuery({
    queryKey: ['admin', 'permission-matrix'],
    queryFn: fetchPermissionMatrix,
  })

  /** 로컬 편집 상태 (서버 데이터 기반, 변경사항 오버레이). */
  const [editState, setEditState] = useState<EditState | null>(null)

  /** 변경된 셀 key 집합 — dirty 강조 + batch 전송에 사용. */
  const [dirtyKeys, setDirtyKeys] = useState<Set<CellKey>>(new Set())

  /** 저장 toast 메시지. */
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  /** 서버 데이터가 로드되면 editState 초기화 (한 번만). */
  const serverState = useMemo(() => {
    if (!matrixQuery.data) return null
    return matrixToEditState(matrixQuery.data)
  }, [matrixQuery.data])

  /** 현재 표시 상태 — editState 우선, 없으면 serverState. */
  const currentState = editState ?? serverState

  const saveMutation = useMutation({
    mutationFn: (updates: PermissionUpdateItem[]) => updatePermissionBatch(updates),
    onSuccess: () => {
      setDirtyKeys(new Set())
      setEditState(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'permission-matrix'] })
      void queryClient.invalidateQueries({ queryKey: ['permissions', 'my'] })
      showToast('success', '권한 매트릭스가 저장되었습니다.')
    },
    onError: () => {
      showToast('error', '저장 중 오류가 발생했습니다. 다시 시도해 주세요.')
    },
  })

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  /** 체크박스 토글 핸들러. */
  const handleToggle = useCallback(
    (role: RbacRole, page: PageCode, field: 'view' | 'edit') => {
      const base = currentState
      if (!base) return

      const k = cellKey(role, page)
      const prev = base[k] ?? { roleCode: role, pageCode: page, view: false, edit: false }
      const updated: PermissionCell = { ...prev, [field]: !prev[field] }

      // view 를 끄면 edit 도 강제로 끔 (edit 은 view 의 상위 집합).
      if (field === 'view' && !updated.view) {
        updated.edit = false
      }
      // edit 을 켜면 view 도 강제 활성.
      if (field === 'edit' && updated.edit) {
        updated.view = true
      }

      setEditState((prev) => {
        const next: EditState = { ...(prev ?? base) }
        next[k] = updated
        return next
      })

      setDirtyKeys((prev) => {
        const next = new Set(prev)
        next.add(k)
        return next
      })
    },
    [currentState],
  )

  /** 저장 — dirty 셀만 batch update. */
  const handleSave = useCallback(() => {
    if (!currentState || dirtyKeys.size === 0) return

    const updates: PermissionUpdateItem[] = []
    for (const k of dirtyKeys) {
      const cell = currentState[k]
      if (!cell) continue
      const serverCell = serverState?.[k]

      // view 변경 여부
      if (!serverCell || cell.view !== serverCell.view) {
        updates.push({
          roleCode: cell.roleCode,
          pageCode: cell.pageCode,
          action: 'view',
          allowed: cell.view,
        })
      }
      // edit 변경 여부
      if (!serverCell || cell.edit !== serverCell.edit) {
        updates.push({
          roleCode: cell.roleCode,
          pageCode: cell.pageCode,
          action: 'edit',
          allowed: cell.edit,
        })
      }
    }

    if (updates.length > 0) {
      saveMutation.mutate(updates)
    }
  }, [currentState, dirtyKeys, serverState, saveMutation])

  /** 초기화 — 서버 상태로 롤백. */
  const handleReset = useCallback(() => {
    setEditState(null)
    setDirtyKeys(new Set())
  }, [])

  if (matrixQuery.isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spinner />
      </div>
    )
  }

  if (matrixQuery.isError || !currentState) {
    return (
      <div style={{ padding: 48, color: 'var(--color-danger-600)' }}>
        권한 매트릭스를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.
      </div>
    )
  }

  return (
    <div style={{ padding: '0 4px' }}>
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 12,
          gap: 8,
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>권한 매트릭스 관리</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-neutral-500)' }}>
            역할별 페이지 접근 권한을 체크박스로 관리합니다. MASTER 역할은 항상 전 권한입니다.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Button
            variant="ghost"
            onClick={handleReset}
            disabled={dirtyKeys.size === 0}
            data-testid="permission-reset-btn"
          >
            초기화
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={dirtyKeys.size === 0 || saveMutation.isPending}
            data-testid="permission-save-btn"
          >
            {saveMutation.isPending ? '저장 중…' : `저장${dirtyKeys.size > 0 ? ` (${dirtyKeys.size}건)` : ''}`}
          </Button>
        </div>
      </div>

      {/* dirty 경고 배너 */}
      {dirtyKeys.size > 0 && (
        <div
          style={{
            background: 'var(--color-warning-50)',
            border: '1px solid var(--color-warning-200)',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 13,
            color: 'var(--color-warning-800)',
          }}
        >
          {dirtyKeys.size}개 셀이 변경되었습니다. 저장하지 않으면 변경이 유실됩니다.
        </div>
      )}

      {/* toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            background: toast.type === 'success' ? 'var(--color-success-600)' : 'var(--color-danger-600)',
            color: 'var(--color-neutral-0)',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 13,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {toast.message}
        </div>
      )}

      {/* 매트릭스 표 */}
      <div
        data-testid="permission-matrix-table"
        style={{ overflowX: 'auto' }}
      >
        <table
          style={{
            borderCollapse: 'collapse',
            width: '100%',
            fontSize: 12,
            tableLayout: 'fixed',
          }}
        >
          <colgroup>
            <col style={{ width: 100 }} />
            {PAGES_ORDER.map((page) => (
              <col key={page} style={{ width: PAGES_WITH_EDIT.has(page) ? 88 : 60 }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  background: 'var(--color-neutral-50)',
                  border: '1px solid var(--color-neutral-200)',
                  fontWeight: 600,
                  position: 'sticky',
                  left: 0,
                  zIndex: 1,
                }}
              >
                역할 \ 페이지
              </th>
              {PAGES_ORDER.map((page) => (
                <th
                  key={page}
                  style={{
                    padding: '6px 4px',
                    textAlign: 'center',
                    background: 'var(--color-neutral-50)',
                    border: '1px solid var(--color-neutral-200)',
                    fontWeight: 600,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'keep-all',
                  }}
                >
                  {PAGE_LABEL[page]}
                </th>
              ))}
            </tr>
            {/* 액션 서브헤더 */}
            <tr>
              <th
                style={{
                  padding: '4px 8px',
                  background: 'var(--color-neutral-50)',
                  border: '1px solid var(--color-neutral-200)',
                  position: 'sticky',
                  left: 0,
                  zIndex: 1,
                  fontSize: 11,
                  color: 'var(--color-neutral-400)',
                }}
              >
                액션
              </th>
              {PAGES_ORDER.map((page) => (
                <th
                  key={page}
                  style={{
                    padding: '4px 2px',
                    background: 'var(--color-neutral-50)',
                    border: '1px solid var(--color-neutral-200)',
                    fontSize: 11,
                    color: 'var(--color-neutral-400)',
                    textAlign: 'center',
                  }}
                >
                  {PAGES_WITH_EDIT.has(page) ? '조회/변경' : '조회'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLES_ORDER.map((role) => (
              <tr key={role}>
                <td
                  style={{
                    padding: '6px 8px',
                    border: '1px solid var(--color-neutral-200)',
                    fontWeight: 600,
                    background: 'var(--color-neutral-50)',
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>{role}</span>
                    <span>{ROLE_LABEL[role]}</span>
                  </div>
                </td>
                {PAGES_ORDER.map((page) => {
                  const k = cellKey(role, page)
                  const cell = currentState[k]
                  const isDirty = dirtyKeys.has(k)
                  const hasEdit = PAGES_WITH_EDIT.has(page)

                  return (
                    <td
                      key={page}
                      data-testid={`permission-cell-${role}-${page}`}
                      style={{
                        padding: '6px 4px',
                        border: '1px solid var(--color-neutral-200)',
                        textAlign: 'center',
                        background: isDirty
                          ? 'var(--color-warning-50)'
                          : 'var(--color-neutral-0)',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'center',
                          gap: hasEdit ? 6 : 0,
                          alignItems: 'center',
                        }}
                      >
                        {/* view 체크박스 */}
                        <label
                          style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}
                          title="조회 권한"
                        >
                          <input
                            type="checkbox"
                            data-testid={`permission-view-${role}-${page}`}
                            checked={cell?.view ?? false}
                            onChange={() => handleToggle(role, page, 'view')}
                            style={{ cursor: 'pointer', accentColor: 'var(--color-brand-500)' }}
                          />
                          {hasEdit && (
                            <span style={{ fontSize: 10, color: 'var(--color-neutral-500)' }}>
                              조회
                            </span>
                          )}
                        </label>
                        {/* edit 체크박스 — edit 이 있는 페이지만 */}
                        {hasEdit && (
                          <label
                            style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}
                            title="변경 권한"
                          >
                            <input
                              type="checkbox"
                              data-testid={`permission-edit-${role}-${page}`}
                              checked={cell?.edit ?? false}
                              onChange={() => handleToggle(role, page, 'edit')}
                              style={{ cursor: 'pointer', accentColor: 'var(--color-brand-500)' }}
                            />
                            <span style={{ fontSize: 10, color: 'var(--color-neutral-500)' }}>
                              변경
                            </span>
                          </label>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
            {/* MASTER 행 — 항상 전권, 편집 불가 */}
            <tr>
              <td
                style={{
                  padding: '6px 8px',
                  border: '1px solid var(--color-neutral-200)',
                  fontWeight: 600,
                  background: 'var(--color-brand-50)',
                  position: 'sticky',
                  left: 0,
                  zIndex: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>MASTER</span>
                  <Badge variant="brand">마스터</Badge>
                </div>
              </td>
              {PAGES_ORDER.map((page) => (
                <td
                  key={page}
                  style={{
                    padding: '6px 4px',
                    border: '1px solid var(--color-neutral-200)',
                    textAlign: 'center',
                    background: 'var(--color-brand-50)',
                  }}
                  title="MASTER는 항상 전 권한"
                >
                  <span style={{ fontSize: 16, color: 'var(--color-brand-600)' }}>●</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          gap: 16,
          fontSize: 12,
          color: 'var(--color-neutral-500)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div
            style={{
              width: 14,
              height: 14,
              background: 'var(--color-warning-50)',
              border: '1px solid var(--color-warning-200)',
              borderRadius: 2,
            }}
          />
          변경된 셀
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div
            style={{
              width: 14,
              height: 14,
              background: 'var(--color-brand-50)',
              border: '1px solid var(--color-brand-200)',
              borderRadius: 2,
            }}
          />
          MASTER (편집 불가)
        </div>
        <span>조회: 화면 접근 허용 / 변경: 등록·수정·삭제 허용</span>
      </div>
    </div>
  )
}
