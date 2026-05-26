/**
 * 권한 매트릭스 관리 화면 — SP-D1 슬라이스.
 *
 * MASTER 전용 (`/admin/permission-matrix`).
 * 역할(행) × 페이지(열) 체크박스 그리드로 권한을 시각적으로 관리.
 *
 * 기능:
 * - 역할 × 페이지 코드 매트릭스 (view / edit 체크박스 2개)
 * - 셀 변경 시 dirty 상태 강조 (노란 배경)
 * - "저장" 버튼 → 변경된 셀만 batch update API 호출 + toast
 * - "초기화" 버튼 → 서버 데이터로 롤백 (dirty 취소)
 * - 카테고리 그룹 헤더 행: 회계/매입·매출·배차·알림/관리(SP-D1~D3) +
 *   견적/거래처주문/재고/직원·계정/거래처/상품/아로로지스(SP-D4) 총 13 그룹
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
 * 표시 순서 고정 역할 10개 (MASTER 제외 — 항상 전권이므로 편집 불가).
 */
const ROLES_ORDER: RbacRole[] = [
  'MANAGER',
  'DISPATCH',
  'SALES',
  'ACCOUNTANT',
  'WAREHOUSE',
  'INVENTORY',
  'DEVELOPER',
  'PARTNER',
  'STAFF',
  'DRIVER',
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
  PARTNER: '파트너',
  STAFF: '스태프',
  DRIVER: '운전기사',
}

// ---------------------------------------------------------------------------
// 카테고리 그룹 정의 — SP-D1~D3 기존 + SP-D4 신규 7 그룹
// ---------------------------------------------------------------------------

/**
 * 페이지 카테고리 그룹.
 * label: 그룹 헤더 한국어 명칭.
 * pages: 그룹 내 PageCode 목록 (순서 고정).
 *
 * 그룹 배치 순서 (사용자 업무 흐름 기준):
 *   회계 → 매입 → 매출 → 배차 → 알림 → 관리 (SP-D1~D3 기존)
 *   → 시스템 관리 (SP-D6-1)
 *   → 견적 → 거래처주문 → 재고 → 직원·계정 → 거래처 → 상품 → 아로로지스 (SP-D4 신규)
 */
interface PageGroup {
  label: string
  pages: PageCode[]
}

/**
 * 전체 카테고리 그룹 13개.
 * SP-D1: 회계·매입·매출·배차·알림·관리 (6 그룹 / 12 코드)
 * SP-D2: 회계 그룹 내 7 코드 추가 (그룹 수 유지)
 * SP-D3: 그룹 수 유지
 * SP-D4: 7 신규 그룹 + 22 코드 추가
 * SP-D6-1: system.* 3종 + dc-config.import/dashboard.admin + sales.partner-dc-config 추가
 * SP-D6-2: messenger.* + products.* 보강 + partner-order edit-request/tutorial 추가
 * SP-D6-3: notifications.admin / aligo.address-book / dispatch.sms-save-history / dispatch.batch 추가
 */
const PAGE_GROUPS: PageGroup[] = [
  // ── SP-D1~D3 기존 그룹 ──────────────────────────────────────────────────
  {
    label: '회계',
    pages: [
      'accounting.tax-invoice.emit-nts',
      'accounting.tax-invoice.list',
      'accounting.tax-invoice.batch-issue',
      'accounting.tax-invoice.inbound',
      'accounting.sales-slip.list',
      'accounting.purchase-slip.list',
      'accounting.deposit-match',
      'accounting.daily-closing',
      'accounting.general-ledger',
      // SP-D2 회계 추가
      'accounting.accounts',
      'accounting.journals',
      'accounting.balances',
      'accounting.reports',
      'accounting.period-close',
      'accounting.statement-batch',
      'accounting.partner-ledger',
      'ecount.mig14.cash-list',
      'ecount.mig14.order-list',
      'ecount.mig14.aging-snapshot',
      'ecount.mig14.ledger',
      'ecount.mig.ops-dashboard',
      'accounting.edit-requests',
    ],
  },
  {
    label: '매입',
    pages: [
      'purchases.receipt-ocr',
      'purchases.slip.list',
      'inbound.inspection',
    ],
  },
  {
    label: '매출',
    pages: [
      'sales.slip.list',
      'sales.partner-dc-config',
    ],
  },
  {
    label: '배차',
    pages: [
      'dispatch.board',
      'dispatch.sms-save-history',
      'dispatch.batch',
    ],
  },
  {
    label: '알림',
    pages: [
      'notification.dispatch-sms.send-audit',
      'notifications.admin',
      'aligo.address-book',
    ],
  },
  {
    label: '메신저',
    pages: [
      'messenger.admin',
      'messenger.send',
    ],
  },
  {
    label: '관리',
    pages: [
      'admin.permissions',
      'dc-config.import',
      'dashboard.admin',
    ],
  },
  {
    label: '시스템 관리',
    pages: [
      'system.permission-admin',
      'system.password-admin',
      'system.account-admin',
    ],
  },
  // ── SP-D4 신규 그룹 ──────────────────────────────────────────────────────
  {
    label: '견적',
    pages: [
      'estimates.list',
    ],
  },
  {
    label: '거래처주문',
    pages: [
      'sales.partner-order.list',
      'sales.partner-order.draft',
      'sales.partner-order.edit',
      'sales.partner-order.confirm',
      'sales.partner-order.history',
      'sales.partner-order.print',
      'sales.partner-order.edit-requests',
      'sales.partner-order.edit-requests.decide',
      'sales.partner-order.tutorial',
      'sales.vendor-order',
    ],
  },
  {
    label: '재고',
    pages: [
      'inventory.warehouse',
      'inventory.stock',
      'inventory.stock-transfer',
      'inventory.dps',
      'inventory.audit',
    ],
  },
  {
    label: '직원·계정',
    pages: [
      'admin.employees',
      'admin.users',
      'ecount.mig2.department',
      'ecount.mig6.employee',
      'ecount.mig6.employee-card',
      'ecount.mig6.payroll-employee',
    ],
  },
  {
    label: '거래처',
    pages: [
      'partners.list',
      'partners.detail',
      'partners.block',
      'partners.edit-request',
    ],
  },
  {
    label: '상품',
    pages: [
      'products.list',
      'products.admin',
      'products.price',
      'products.edit-requests',
      'products.edit-requests.decide',
      'products.ecount-import',
    ],
  },
  {
    label: '아로로지스',
    pages: [
      'arologis.admin',
      'arologis.region',
    ],
  },
]

/**
 * PAGE_GROUPS 에서 파생된 전체 페이지 코드 순서 배열.
 * 그룹 순서 × 그룹 내 순서가 최종 열 순서.
 */
const PAGES_ORDER: PageCode[] = PAGE_GROUPS.flatMap((g) => g.pages)

/** 페이지 코드 한국어 라벨. */
const PAGE_LABEL: Record<PageCode, string> = {
  'accounting.tax-invoice.batch-issue': '세금계산서 발행 묶음',
  'accounting.tax-invoice.inbound': '수신 세금계산서',
  'accounting.sales-slip.list': '매출전표',
  'accounting.purchase-slip.list': '매입전표',
  // SP-D1 12개
  'accounting.tax-invoice.emit-nts': 'NTS 발행',
  'accounting.tax-invoice.list': '세금계산서 목록',
  'accounting.deposit-match': '입금 매칭',
  'accounting.daily-closing': '일마감',
  'accounting.general-ledger': '원장',
  'notification.dispatch-sms.send-audit': 'SMS 이력',
  'notifications.admin': '알림 발송',
  'aligo.address-book': '알리고 주소록',
  'messenger.admin': '메신저 관리',
  'messenger.send': '메신저 발송',
  'purchases.receipt-ocr': '영수증 OCR',
  'purchases.slip.list': '매입 슬립',
  'sales.slip.list': '매출 슬립',
  'sales.partner-dc-config': '거래처 DC 설정',
  'inbound.inspection': '입고 검수',
  'dispatch.board': '배차 보드',
  'dispatch.sms-save-history': '배차문자 저장',
  'dispatch.batch': '배차 SMS batch',
  'admin.permissions': '권한 관리',
  'system.permission-admin': '시스템 권한',
  'system.password-admin': '비밀번호 관리',
  'system.account-admin': '계정 관리',
  'dc-config.import': 'DC import',
  'dashboard.admin': '대시보드 관리',
  // SP-D2 회계 7개 신규
  'accounting.accounts': '계정과목',
  'accounting.journals': '분개장',
  'accounting.balances': '시산표',
  'accounting.reports': '재무 보고서',
  'accounting.period-close': '월말 마감',
  'accounting.statement-batch': '거래명세서 일괄',
  'accounting.partner-ledger': '거래처 원장',
  'ecount.mig14.cash-list': 'MIG-14 현금',
  'ecount.mig14.order-list': 'MIG-14 주문',
  'ecount.mig14.aging-snapshot': 'MIG-14 잔액 스냅샷',
  'ecount.mig14.ledger': 'MIG-14 원장',
  'ecount.mig.ops-dashboard': 'MIG-21 운영 대시보드',
  'accounting.edit-requests': '회계 수정 요청',
  // SP-D4 신규 22개
  'estimates.list': '견적 목록',
  'sales.partner-order.list': '주문 목록',
  'sales.partner-order.draft': '주문 작성',
  'sales.partner-order.edit': '주문 수정',
  'sales.partner-order.confirm': '주문 확정',
  'sales.partner-order.history': '주문 이력',
  'sales.partner-order.print': '주문서 인쇄',
  'sales.partner-order.edit-requests': '주문 수정 요청',
  'sales.partner-order.edit-requests.decide': '주문 요청 승인',
  'sales.partner-order.tutorial': '주문 튜토리얼',
  'sales.vendor-order': '벤더 주문',
  'inventory.warehouse': '창고관리',
  'inventory.stock': '재고 현황',
  'inventory.stock-transfer': '재고 이동',
  'inventory.dps': 'DPS 비교',
  'inventory.audit': '재고 감사',
  'admin.employees': '직원 관리',
  'admin.users': '계정 관리',
  'ecount.mig2.department': '부서 import',
  'ecount.mig6.employee': '사원 import',
  'ecount.mig6.employee-card': '인사카드 import',
  'ecount.mig6.payroll-employee': '급여사원 import',
  'partners.list': '거래처 목록',
  'partners.detail': '거래처 상세',
  'partners.block': '거래처 차단',
  'partners.edit-request': '편집 결재',
  'products.list': '상품 목록',
  'products.admin': '상품 관리',
  'products.price': '상품 가격',
  'products.edit-requests': '상품 수정 요청',
  'products.edit-requests.decide': '상품 요청 승인',
  'products.ecount-import': '상품 import',
  'arologis.admin': '아로로지스 배차',
  'arologis.region': '지역·구역',
}

/** edit 액션이 의미 있는 페이지 코드 목록. 나머지는 view 만 표시. */
const PAGES_WITH_EDIT: Set<PageCode> = new Set([
  'accounting.tax-invoice.batch-issue',
  'accounting.tax-invoice.inbound',
  'accounting.sales-slip.list',
  'accounting.purchase-slip.list',
  // SP-D1~D3
  'accounting.tax-invoice.emit-nts',
  'accounting.deposit-match',
  'accounting.daily-closing',
  'notification.dispatch-sms.send-audit',
  'notifications.admin',
  'aligo.address-book',
  'messenger.admin',
  'messenger.send',
  'purchases.receipt-ocr',
  'purchases.slip.list',
  'sales.slip.list',
  'sales.partner-dc-config',
  'inbound.inspection',
  'dispatch.board',
  'dispatch.sms-save-history',
  'dispatch.batch',
  'admin.permissions',
  'system.permission-admin',
  'system.password-admin',
  'system.account-admin',
  'dc-config.import',
  'dashboard.admin',
  // SP-D2 추가
  'accounting.accounts',
  'accounting.journals',
  'accounting.period-close',
  'accounting.statement-batch',
  'accounting.edit-requests',
  // SP-D4 신규 (V/E 양쪽 유의미한 코드)
  'estimates.list',
  'sales.partner-order.list',
  'sales.partner-order.draft',
  'sales.partner-order.edit',
  'sales.partner-order.confirm',
  'sales.partner-order.history',
  'sales.partner-order.print',
  'sales.partner-order.edit-requests',
  'sales.partner-order.edit-requests.decide',
  'sales.partner-order.tutorial',
  'sales.vendor-order',
  'inventory.warehouse',
  'inventory.stock',
  'inventory.stock-transfer',
  'inventory.dps',
  'inventory.audit',
  'admin.employees',
  'admin.users',
  'ecount.mig2.department',
  'ecount.mig6.employee',
  'ecount.mig6.employee-card',
  'ecount.mig6.payroll-employee',
  'partners.list',
  'partners.detail',
  'partners.block',
  'partners.edit-request',
  'products.list',
  'products.admin',
  'products.price',
  'products.edit-requests',
  'products.edit-requests.decide',
  'products.ecount-import',
  'arologis.admin',
  'arologis.region',
])

/** 비-MASTER 역할에는 부여할 수 없는 시스템 전용 PageCode. */
const SYSTEM_ONLY_PAGES: Set<PageCode> = new Set([
  'system.permission-admin',
  'system.password-admin',
  'system.account-admin',
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
      if (role !== 'MASTER' && SYSTEM_ONLY_PAGES.has(page)) return

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
            fontSize: 'var(--font-size-xs)',
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
            {/* ── 카테고리 그룹 헤더 행 (SP-D4 추가) ── */}
            <tr>
              {/* 역할 열 교차 셀 — rowSpan=3 으로 그룹/페이지/액션 3행 커버 */}
              <th
                scope="col"
                rowSpan={3}
                style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  background: 'var(--color-neutral-50)',
                  border: '1px solid var(--color-neutral-200)',
                  fontWeight: 600,
                  position: 'sticky',
                  left: 0,
                  zIndex: 40,
                  verticalAlign: 'middle',
                }}
              >
                역할 \ 페이지
              </th>
              {PAGE_GROUPS.map((group) => (
                <th
                  key={group.label}
                  scope="colgroup"
                  colSpan={group.pages.length}
                  style={{
                    padding: '5px 6px',
                    textAlign: 'center',
                    background: 'var(--color-brand-50)',
                    border: '1px solid var(--color-brand-200)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    color: 'var(--color-brand-700)',
                    letterSpacing: '0.02em',
                    whiteSpace: 'nowrap',
                  }}
                  data-testid={`permission-matrix-group-${group.label}`}
                >
                  {group.label}
                </th>
              ))}
            </tr>
            {/* ── 페이지 코드 라벨 헤더 행 ── */}
            <tr>
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
            {/* ── 액션 서브헤더 행 ── */}
            <tr>
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
                  const isSystemOnlyPage = role !== 'MASTER' && SYSTEM_ONLY_PAGES.has(page)
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
                          flexDirection: isSystemOnlyPage ? 'column' : 'row',
                          justifyContent: 'center',
                          gap: isSystemOnlyPage ? 4 : hasEdit ? 6 : 0,
                          alignItems: 'center',
                        }}
                      >
                        {isSystemOnlyPage && (
                          <span
                            data-testid={`permission-matrix-cell-${role}-${pageNorm}-readonly`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minHeight: 18,
                              padding: '1px 5px',
                              borderRadius: 4,
                              border: '1px solid var(--color-neutral-200)',
                              background: 'var(--color-neutral-50)',
                              color: 'var(--color-neutral-600)',
                              fontSize: 10,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            MASTER 전용
                          </span>
                        )}
                        {/* view 체크박스 — data-testid: permission-matrix-cell-{role}-{page}-view */}
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            cursor: isSystemOnlyPage ? 'not-allowed' : 'pointer',
                          }}
                          title="조회 권한"
                        >
                          <input
                            type="checkbox"
                            data-testid={`permission-matrix-cell-${role}-${pageNorm}-view`}
                            checked={cell?.view ?? false}
                            disabled={isSystemOnlyPage}
                            onChange={() => handleToggle(role, page, 'view')}
                            style={{
                              cursor: isSystemOnlyPage ? 'not-allowed' : 'pointer',
                              accentColor: 'var(--color-brand-500)',
                            }}
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
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 2,
                              cursor: isSystemOnlyPage ? 'not-allowed' : 'pointer',
                            }}
                            title="변경 권한"
                          >
                            <input
                              type="checkbox"
                              data-testid={`permission-matrix-cell-${role}-${pageNorm}-edit`}
                              checked={cell?.edit ?? false}
                              disabled={isSystemOnlyPage}
                              onChange={() => handleToggle(role, page, 'edit')}
                              style={{
                                cursor: isSystemOnlyPage ? 'not-allowed' : 'pointer',
                                accentColor: 'var(--color-brand-500)',
                              }}
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
          fontSize: 'var(--font-size-xs)',
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
