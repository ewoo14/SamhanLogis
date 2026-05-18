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
 * data-testid (SP-D1 cycle 2 fix: Playwright spec 기준으로 통일):
 * - permission-matrix-table                        — 매트릭스 표 wrapper
 * - permission-matrix-role-{role}                  — 역할 헤더 th
 * - permission-matrix-cell-{role}-{page}           — 개별 셀 td
 * - permission-matrix-cell-{role}-{page}-view      — view 체크박스 (pageCode 를 '-' 로 normalize)
 * - permission-matrix-cell-{role}-{page}-edit      — edit 체크박스
 * - permission-matrix-save-btn                     — 저장 버튼
 * - permission-matrix-reset-btn                    — 초기화 버튼
 * - permission-matrix-change-count                 — 변경 건수 배지
 * - sidebar-purchases-receipt-ocr (AppLayout)      — 영수증 OCR 사이드바 링크 (SP-D1 동적 권한 연동)
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

/**
 * 표시 순서 고정 역할 6개 (MASTER 제외 — 항상 전권이므로 편집 불가).
 * SP-D1 cycle 2 fix: BE allRoles 목록 기준 (DEVELOPER 제거 — BE 미지원).
 */
const ROLES_ORDER: RbacRole[] = [
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
  MANAGER: '매니저',
  DISPATCH: '배차담당자',
  SALES: '영업원',
  ACCOUNTANT: '회계원',
  WAREHOUSE: '창고원',
  INVENTORY: '재고원',
}

/**
 * 페이지 코드 12개 표시 순서 — BE PageCode enum dot-separated code 와 1:1.
 * SP-D1 cycle 2 fix: 대문자 상수에서 BE dot-separated 코드로 교체.
 */
const PAGES_ORDER: PageCode[] = [
  'accounting.tax-invoice.emit-nts',
  'accounting.tax-invoice.list',
  'accounting.deposit-match',
  'accounting.daily-closing',
  'accounting.general-ledger',
  'notification.dispatch-sms.send-audit',
  'purchases.receipt-ocr',
  'purchases.slip.list',
  'sales.slip.list',
  'inbound.inspection',
  'dispatch.board',
  'admin.permissions',
]

/** 페이지 코드 한국어 라벨. */
const PAGE_LABEL: Record<PageCode, string> = {
  'accounting.tax-invoice.emit-nts': 'NTS 발행',
  'accounting.tax-invoice.list': '세금계산서 목록',
  'accounting.deposit-match': '입금 매칭',
  'accounting.daily-closing': '일마감',
  'accounting.general-ledger': '원장',
  'notification.dispatch-sms.send-audit': 'SMS 이력',
  'purchases.receipt-ocr': '영수증 OCR',
  'purchases.slip.list': '매입 슬립',
  'sales.slip.list': '매출 슬립',
  'inbound.inspection': '입고 검수',
  'dispatch.board': '배차 보드',
  'admin.permissions': '권한 관리',
}

/** edit 액션이 의미 있는 페이지 코드 목록. 나머지는 view 만 표시. */
const PAGES_WITH_EDIT: Set<PageCode> = new Set([
  'accounting.tax-invoice.emit-nts',
  'accounting.deposit-match',
  'accounting.daily-closing',
  'notification.dispatch-sms.send-audit',
  'purchases.receipt-ocr',
  'purchases.slip.list',
  'sales.slip.list',
  'inbound.inspection',
  'dispatch.board',
  'admin.permissions',
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
            data-testid="permission-matrix-reset-btn"
          >
            초기화
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={dirtyKeys.size === 0 || saveMutation.isPending}
            data-testid="permission-matrix-save-btn"
          >
            {saveMutation.isPending
              ? '저장 중…'
              : (
                <>
                  저장
                  {dirtyKeys.size > 0 && (
                    <span data-testid="permission-matrix-change-count">
                      {' '}({dirtyKeys.size}건)
                    </span>
                  )}
                </>
              )}
          </Button>
        </div>
      </div>

      {/* dirty 경고 배너 — role="alert" aria-live="assertive" (D-4 접근성) */}
      {dirtyKeys.size > 0 && (
        <div
          role="alert"
          aria-live="assertive"
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

      {/* 변경 카운트 live region — role="status" aria-live="polite" (D-4 접근성) */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
      >
        {dirtyKeys.size > 0 ? `${dirtyKeys.size}개 항목 변경됨` : '변경 사항 없음'}
      </div>

      {/* toast — role="alert" (D-4 접근성) */}
      {toast && (
        <div
          role="alert"
          aria-live="assertive"
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
          {/* D-3: thead sticky top:0 z-index:30, 교차 th z-index:40 */}
          <thead style={{ position: 'sticky', top: 0, zIndex: 30 }}>
            <tr>
              {/* D-3/D-4: 교차 셀 z-index:40, scope="col" */}
              <th
                scope="col"
                style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  background: 'var(--color-neutral-50)',
                  border: '1px solid var(--color-neutral-200)',
                  fontWeight: 600,
                  position: 'sticky',
                  left: 0,
                  zIndex: 40,
                }}
              >
                역할 \ 페이지
              </th>
              {PAGES_ORDER.map((page) => (
                <th
                  key={page}
                  scope="col"
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
                scope="col"
                style={{
                  padding: '4px 8px',
                  background: 'var(--color-neutral-50)',
                  border: '1px solid var(--color-neutral-200)',
                  position: 'sticky',
                  left: 0,
                  zIndex: 40,
                  fontSize: 11,
                  color: 'var(--color-neutral-400)',
                }}
              >
                액션
              </th>
              {PAGES_ORDER.map((page) => (
                <th
                  key={page}
                  scope="col"
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
                {/* D-4: scope="row" 역할 열 헤더, D-3: z-index:20
                    SP-D1 cycle 2: data-testid="permission-matrix-role-{role}" 추가 (Playwright spec 정합) */}
                <td
                  scope="row"
                  data-testid={`permission-matrix-role-${role}`}
                  style={{
                    padding: '6px 8px',
                    border: '1px solid var(--color-neutral-200)',
                    fontWeight: 600,
                    background: 'var(--color-neutral-50)',
                    position: 'sticky',
                    left: 0,
                    zIndex: 20,
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
                  // Playwright spec 기준 testid: pageCode 의 '.' 를 '-' 로 normalize
                  const pageNorm = page.replace(/\./g, '-')

                  return (
                    <td
                      key={page}
                      data-testid={`permission-matrix-cell-${role}-${pageNorm}`}
                      style={{
                        padding: '6px 4px',
                        border: '1px solid var(--color-neutral-200)',
                        textAlign: 'center',
                        position: 'relative',
                        /* D-1: dirty 셀 amber 배경 + 좌측 3px 마커 (::before 는 CSS-in-JS 미지원 → borderLeft 직접) */
                        background: isDirty
                          ? 'var(--color-warning-50)'
                          : 'var(--color-neutral-0)',
                        borderLeft: isDirty
                          ? '3px solid var(--color-warning-400)'
                          : '1px solid var(--color-neutral-200)',
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
                        {/* view 체크박스 — data-testid: permission-matrix-cell-{role}-{page}-view */}
                        <label
                          style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}
                          title="조회 권한"
                        >
                          <input
                            type="checkbox"
                            data-testid={`permission-matrix-cell-${role}-${pageNorm}-view`}
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
                        {/* edit 체크박스 — data-testid: permission-matrix-cell-{role}-{page}-edit */}
                        {hasEdit && (
                          <label
                            style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}
                            title="변경 권한"
                          >
                            <input
                              type="checkbox"
                              data-testid={`permission-matrix-cell-${role}-${pageNorm}-edit`}
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
