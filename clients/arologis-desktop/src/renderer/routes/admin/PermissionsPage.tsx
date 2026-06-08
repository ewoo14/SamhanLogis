/**
 * 아로로지스 권한 관리 — 롤×page-code 권한 매트릭스 (Phase A).
 *
 * AROLOGIS_MASTER 전용 화면. arologis.* page-code 의 롤별 조회(view)/편집(edit) 권한을
 * 매트릭스 표로 조회하고, 셀 토글 시 즉시 PUT(updateGrant) → react-query invalidate 로 갱신한다.
 *
 * 표 방향: 행=page-code(displayName 한국어 라벨), 열=롤. 각 셀에 V(조회)/E(편집) 체크박스 2개.
 *
 * 규칙:
 * - 중앙 MASTER 롤 열은 읽기전용(서버가 변경 거부) — 토글 disabled + 안내.
 * - edit=true 면 view 자동 true UX 반영(서버 도메인 규칙과 정합).
 * - UUID 비공개: roleCode/pageCode 비즈니스 키만 노출. 롤/페이지는 한국어 라벨 우선.
 *
 * design-system Checkbox 컴포넌트가 없어 매트릭스 셀은 네이티브 input[type=checkbox]
 * (인라인 스타일)로 구성한다 — 다수 셀 렌더 비용 최소화 + 접근성 라벨 부여.
 */
import axios from 'axios'
import { useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button } from '@samhan/design-system'
import {
  getMatrix,
  updateGrant,
  type PermissionMatrix,
  type RolePagePermissionView,
} from '../../api/arologisPermissions'
import { usePageTitle } from '../../hooks/usePageTitle'
import { canGrantMaster, useAuthStore } from '../../stores/authStore'

/** 중앙 MASTER 롤 코드 — 서버가 변경을 거부하므로 열 전체를 읽기전용 처리. */
const CENTRAL_MASTER_ROLE = 'MASTER'

/**
 * 롤 코드 → 한국어 라벨. **아로로지스 6-롤**(2026-06-08, 개발책임자) — arologis JWT 롤(AROLOGIS_*)이
 * 중앙 코드로 정규화되어 매트릭스 열로 등장한다. V53 시드가 무관 5롤(DISPATCH/INVENTORY/PARTNER/
 * STAFF/WAREHOUSE) arologis.* grant 를 제거하므로 getRoleMatrix 는 아래 6 중앙 코드만 반환.
 * 매핑 없으면 코드 그대로 노출(방어적).
 */
const ROLE_LABELS: Record<string, string> = {
  MASTER: '마스터',
  MANAGER: '매니저',
  DEVELOPER: '개발자',
  SALES: '영업사원',
  ACCOUNTANT: '회계사원',
  DRIVER: '배송기사',
}

/** 권한 매트릭스 react-query 키 — 조회/낙관갱신/무효화에서 공유. */
const MATRIX_QUERY_KEY = ['arologis', 'permissions', 'matrix'] as const

/** 변경 진행 중인 셀 식별(roleCode + pageCode) — 토글 중 disabled 처리용. */
type PendingKey = string

function cellKey(roleCode: string, pageCode: string): PendingKey {
  return `${roleCode}::${pageCode}`
}

function roleLabel(roleCode: string): string {
  return ROLE_LABELS[roleCode] ?? roleCode
}

export function PermissionsPage(): JSX.Element {
  usePageTitle('권한 관리')

  const queryClient = useQueryClient()
  const auth = useAuthStore((s) => s.auth)
  const isMaster = canGrantMaster(auth?.role)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Set<PendingKey>>(new Set())

  const matrixQuery = useQuery({
    queryKey: MATRIX_QUERY_KEY,
    queryFn: getMatrix,
    enabled: isMaster,
  })

  const matrix: PermissionMatrix = matrixQuery.data ?? {}

  // 열(롤) 목록 — 매트릭스 key 순서 안정화(중앙 → 아로로지스 → 기타 알파벳).
  const roleCodes = useMemo(() => sortRoles(Object.keys(matrix)), [matrix])

  // 행(page-code) 목록 + displayName — 모든 롤의 page-code 를 합집합으로 모은다.
  const pages = useMemo(() => collectPages(matrix), [matrix])

  const mutation = useMutation({
    mutationFn: (vars: {
      roleCode: string
      pageCode: string
      displayName: string
      canView: boolean
      canEdit: boolean
    }) => updateGrant(vars.roleCode, vars.pageCode, vars.canView, vars.canEdit),
    // 낙관적 갱신 — 토글 즉시 화면 반영(edit→view 자동 등). onError 시 스냅샷 롤백.
    onMutate: async (vars) => {
      setError(null)
      setPending((prev) => new Set(prev).add(cellKey(vars.roleCode, vars.pageCode)))
      // 진행 중 refetch 가 낙관 데이터를 덮어쓰지 않도록 취소(다중 셀 동시 토글 시 깜빡임 방지).
      await queryClient.cancelQueries({ queryKey: MATRIX_QUERY_KEY })
      const snapshot = queryClient.getQueryData<PermissionMatrix>(MATRIX_QUERY_KEY)
      queryClient.setQueryData<PermissionMatrix>(MATRIX_QUERY_KEY, (prev) => {
        const base = prev ?? {}
        const roleMap = { ...(base[vars.roleCode] ?? {}) }
        roleMap[vars.pageCode] = {
          roleCode: vars.roleCode,
          pageCode: vars.pageCode,
          displayName: vars.displayName,
          canView: vars.canView,
          canEdit: vars.canEdit,
        }
        return { ...base, [vars.roleCode]: roleMap }
      })
      return { snapshot }
    },
    onError: (err, _vars, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(MATRIX_QUERY_KEY, context.snapshot)
      }
      setError(toPermissionError(err))
    },
    onSettled: (_data, _err, vars) => {
      setPending((prev) => {
        const next = new Set(prev)
        next.delete(cellKey(vars.roleCode, vars.pageCode))
        return next
      })
      void queryClient.invalidateQueries({ queryKey: MATRIX_QUERY_KEY })
    },
  })

  // 비마스터 진입(직접 URL) 방어 — 네비/라우트 게이트와 별개의 화면 자체 가드.
  if (!isMaster) {
    return (
      <section style={pageStyle}>
        <header style={headerStyle}>
          <h1 style={titleStyle}>권한 관리</h1>
        </header>
        <div role="alert" style={errorStyle}>
          권한 관리는 아로로지스 마스터 계정만 접근할 수 있습니다.
        </div>
      </section>
    )
  }

  const applyGrant = (
    cell: RolePagePermissionView,
    nextView: boolean,
    nextEdit: boolean,
  ): void => {
    // edit=true 면 view 자동 true (서버 도메인 규칙과 정합).
    const view = nextEdit ? true : nextView
    if (view === cell.canView && nextEdit === cell.canEdit) return
    mutation.mutate({
      roleCode: cell.roleCode,
      pageCode: cell.pageCode,
      displayName: cell.displayName,
      canView: view,
      canEdit: nextEdit,
    })
  }

  return (
    <section style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>권한 관리</h1>
          <p style={descStyle}>
            아로로지스 page-code 별 롤 권한(조회·편집)을 관리합니다. 토글하면 즉시 저장됩니다.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={matrixQuery.isFetching}
          onClick={() => void matrixQuery.refetch()}
        >
          새로고침
        </Button>
      </header>

      <div style={legendStyle}>
        <span><strong>V</strong> = 조회(view)</span>
        <span><strong>E</strong> = 편집(edit)</span>
        <span style={legendMutedStyle}>편집을 켜면 조회가 자동으로 켜집니다.</span>
        <span style={legendMutedStyle}>중앙 마스터 권한은 변경할 수 없습니다.</span>
      </div>

      {(() => {
        // 조회 실패와 변경 실패를 단일 배너로 통합(중복 노출 방지). 변경 실패(error state)를 우선.
        const banner = error ?? (matrixQuery.error ? toPermissionError(matrixQuery.error) : null)
        return banner ? <div role="alert" style={errorStyle}>{banner}</div> : null
      })()}

      {matrixQuery.isLoading ? (
        <div style={mutedBoxStyle}>권한 매트릭스를 불러오는 중...</div>
      ) : pages.length === 0 || roleCodes.length === 0 ? (
        <div style={mutedBoxStyle}>표시할 권한 데이터가 없습니다.</div>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle} data-testid="arologis-permission-matrix">
            <thead>
              <tr>
                <th style={pageHeaderCellStyle}>페이지</th>
                {roleCodes.map((roleCode) => {
                  const readOnly = roleCode === CENTRAL_MASTER_ROLE
                  return (
                    <th key={roleCode} style={roleHeaderCellStyle}>
                      <div style={roleHeaderInnerStyle}>
                        <Badge
                          variant={roleCode.endsWith('MASTER') ? 'brand' : 'neutral'}
                        >
                          {roleLabel(roleCode)}
                        </Badge>
                        {readOnly ? <span style={readOnlyTagStyle}>읽기전용</span> : null}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => (
                <tr key={page.pageCode}>
                  <th scope="row" style={pageRowCellStyle}>
                    <div style={pageNameStyle}>{page.displayName || page.pageCode}</div>
                    <div style={pageCodeStyle}>{page.pageCode}</div>
                  </th>
                  {roleCodes.map((roleCode) => {
                    const readOnly = roleCode === CENTRAL_MASTER_ROLE
                    const key = cellKey(roleCode, page.pageCode)
                    const isPending = pending.has(key)
                    // 행 없는 (롤×페이지) 조합도 가상 false 셀로 렌더 → 토글 시 신규 grant 생성
                    // (BE upsert 지원). 희소 매트릭스에서 미부여 셀이 토글 불가하던 문제 해소.
                    const cell: RolePagePermissionView = matrix[roleCode]?.[page.pageCode] ?? {
                      roleCode,
                      pageCode: page.pageCode,
                      displayName: page.displayName,
                      canView: false,
                      canEdit: false,
                    }
                    const readOnlyHint = readOnly ? '중앙 마스터 권한은 변경할 수 없습니다.' : undefined
                    return (
                      <td key={key} style={dataCellStyle}>
                        <div style={toggleGroupStyle}>
                          <ToggleBox
                            label="V"
                            ariaLabel={`${roleLabel(roleCode)} ${page.displayName || page.pageCode} 조회`}
                            checked={cell.canView}
                            // edit 가 켜져 있으면 view 는 끌 수 없음(자동 true 유지).
                            disabled={readOnly || isPending || cell.canEdit}
                            title={readOnlyHint ?? (cell.canEdit ? '편집이 켜져 있어 조회를 끌 수 없습니다.' : undefined)}
                            testId={`arologis-perm-${roleCode}-${page.pageCode}-view`}
                            onChange={(checked) => applyGrant(cell, checked, cell.canEdit)}
                          />
                          <ToggleBox
                            label="E"
                            ariaLabel={`${roleLabel(roleCode)} ${page.displayName || page.pageCode} 편집`}
                            checked={cell.canEdit}
                            disabled={readOnly || isPending}
                            title={readOnlyHint}
                            testId={`arologis-perm-${roleCode}-${page.pageCode}-edit`}
                            onChange={(checked) => applyGrant(cell, cell.canView, checked)}
                          />
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ToggleBox({
  label,
  ariaLabel,
  checked,
  disabled,
  title,
  testId,
  onChange,
}: {
  label: string
  ariaLabel: string
  checked: boolean
  disabled: boolean
  title?: string
  testId: string
  onChange: (checked: boolean) => void
}): JSX.Element {
  return (
    <label style={disabled ? toggleLabelDisabledStyle : toggleLabelStyle} title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        data-testid={testId}
        onChange={(e) => onChange(e.target.checked)}
        style={checkboxStyle}
      />
      <span>{label}</span>
    </label>
  )
}

/**
 * 모든 롤의 page-code 합집합 + displayName 수집(롤별 표시 차이 없이 동일 page 1행).
 * displayName 은 처음 만난 non-blank 값을 사용하고, pageCode 알파벳 순으로 정렬한다.
 */
function collectPages(
  matrix: PermissionMatrix,
): Array<{ pageCode: string; displayName: string }> {
  const map = new Map<string, string>()
  for (const pageMap of Object.values(matrix)) {
    if (!pageMap) continue
    for (const view of Object.values(pageMap)) {
      if (!view) continue
      const existing = map.get(view.pageCode)
      if (existing === undefined || (existing === '' && view.displayName)) {
        map.set(view.pageCode, view.displayName ?? '')
      }
    }
  }
  return Array.from(map.entries())
    .map(([pageCode, displayName]) => ({ pageCode, displayName }))
    .sort((a, b) => a.pageCode.localeCompare(b.pageCode))
}

/** 롤 열 정렬 — 아로로지스 6-롤 위계순(마스터>매니저>개발자>영업사원>회계사원>배송기사), 그 외 알파벳. */
const ROLE_ORDER = ['MASTER', 'MANAGER', 'DEVELOPER', 'SALES', 'ACCOUNTANT', 'DRIVER']
function sortRoles(roles: string[]): string[] {
  const rank = (role: string): number => {
    const idx = ROLE_ORDER.indexOf(role)
    return idx === -1 ? ROLE_ORDER.length : idx
  }
  return [...roles].sort((a, b) => {
    const diff = rank(a) - rank(b)
    return diff !== 0 ? diff : a.localeCompare(b)
  })
}

function toPermissionError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const data = err.response?.data as { message?: unknown } | undefined
    const message = typeof data?.message === 'string' ? data.message : undefined
    if (status === 403) {
      return message ?? '권한 관리 작업 권한이 없습니다. (아로로지스 마스터 전용)'
    }
    if (message) return message
  }
  return '권한 작업에 실패했습니다.'
}

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  alignItems: 'flex-start',
}
const titleStyle: CSSProperties = { fontSize: 'var(--font-size-xl)', margin: 0 }
const descStyle: CSSProperties = { color: 'var(--color-text-muted)', margin: '6px 0 0' }
const legendStyle: CSSProperties = {
  display: 'flex',
  gap: 16,
  flexWrap: 'wrap',
  alignItems: 'center',
  fontSize: 13,
  color: 'var(--color-text-secondary, #595959)',
}
const legendMutedStyle: CSSProperties = { color: 'var(--color-text-muted)' }
const tableWrapStyle: CSSProperties = { overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 6 }
const tableStyle: CSSProperties = { borderCollapse: 'collapse', width: '100%', minWidth: 640 }
const pageHeaderCellStyle: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  textAlign: 'left',
  padding: '10px 14px',
  background: 'var(--color-surface-muted, #f8fafc)',
  borderBottom: '1px solid var(--color-border)',
  fontSize: 13,
}
const roleHeaderCellStyle: CSSProperties = {
  padding: '10px 14px',
  background: 'var(--color-surface-muted, #f8fafc)',
  borderBottom: '1px solid var(--color-border)',
  borderLeft: '1px solid var(--color-border)',
  textAlign: 'center',
  whiteSpace: 'nowrap',
}
const roleHeaderInnerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  alignItems: 'center',
}
const readOnlyTagStyle: CSSProperties = { fontSize: 11, color: 'var(--color-text-muted)' }
const pageRowCellStyle: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  textAlign: 'left',
  padding: '10px 14px',
  background: 'var(--color-surface)',
  borderBottom: '1px solid var(--color-border)',
  whiteSpace: 'nowrap',
}
const pageNameStyle: CSSProperties = { fontWeight: 600, fontSize: 14 }
const pageCodeStyle: CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)' }
const dataCellStyle: CSSProperties = {
  padding: '8px 14px',
  borderBottom: '1px solid var(--color-border)',
  borderLeft: '1px solid var(--color-border)',
  textAlign: 'center',
}
const toggleGroupStyle: CSSProperties = { display: 'flex', gap: 12, justifyContent: 'center' }
const toggleLabelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}
const toggleLabelDisabledStyle: CSSProperties = {
  ...toggleLabelStyle,
  cursor: 'not-allowed',
  opacity: 0.5,
}
const checkboxStyle: CSSProperties = { width: 16, height: 16, cursor: 'inherit' }
const mutedBoxStyle: CSSProperties = {
  padding: 24,
  textAlign: 'center',
  color: 'var(--color-text-muted)',
  border: '1px dashed var(--color-border)',
  borderRadius: 6,
}
const errorStyle: CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--state-danger, #dc2626)',
  borderRadius: 4,
  background: 'var(--state-danger-bg, #fee2e2)',
  color: 'var(--state-danger, #b91c1c)',
}
