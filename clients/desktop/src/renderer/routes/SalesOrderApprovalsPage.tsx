/**
 * 주문서 승인 — `/sales/order-approvals` (v2 정정 §9/§10/§11/§14 통합).
 *
 * <p>기존 `/sales/long-pending` (장기미발주) 메뉴를 본 화면으로 통합.
 *
 * <h2>화면 명세 (v2 정정 §9/§11)</h2>
 * <ul>
 *   <li>status 6종 한글 표시 — 미승인/승인/비밀번호 재설정 대기/비밀번호 오류/접근제한/장기미발주.</li>
 *   <li>영업자 status 변경 (DropdownSelect on row).</li>
 *   <li>'비밀번호 초기화' 버튼 — status=PASSWORD_RESET_PENDING 으로 전환 + 거래처 다음 접속 시
 *       재설정 페이지 자동 표시.</li>
 *   <li>승인 전환 시 비밀번호 자동 재설정 (backend 책임, 화면은 status 변경만 발동).</li>
 * </ul>
 *
 * <h2>v2 정정 §10 — '마지막 견적일' 컬럼 삭제 (장기미발주 화면 컬럼 정리).</h2>
 *
 * <p>UUID 비공개 가드 — 사용자 노출 식별자는 partnerCode (사업자등록번호) + partnerName 만.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable, type DataTableColumn } from '@samhan/design-system'
import {
  PARTNER_APPROVAL_STATUS_LABEL,
  type PartnerApproval,
  type PartnerApprovalStatus,
  listPartnerApprovals,
  previewPartnerAccess,
  resetPartnerPassword,
  updatePartnerApprovalStatus,
} from '../api/sales'
import { AuditInfoBanner } from '../components/audit/AuditOverlaySection'
import { usePageTitleStore } from '../stores/pageTitle'
import { usePermissions } from '../hooks/usePermissions'
import styles from '../components/sales/sales.module.css'
import { canResetPartnerPassword } from '../utils/orderAppAccess'

const STATUS_CLASS: Record<PartnerApprovalStatus, string> = {
  UNAPPROVED: styles['statusUnapproved']!,
  APPROVED: styles['statusApproved']!,
  PASSWORD_RESET_PENDING: styles['statusPwReset']!,
  PASSWORD_ERROR: styles['statusPwError']!,
  ACCESS_DENIED: styles['statusAccessDenied']!,
  LONG_PENDING: styles['statusLongPending']!,
}

/** 한국 표시용 — `2026-05-04T17:27:00+09:00` → `2026/05/04 17:27`. */
function fmtDateTime(s: string | null): string {
  if (!s) return '-'
  // legacy 한글 양식 (`2026년 5월 4일 오후 5:27`) 그대로 노출 케이스 호환.
  if (/년|월|일/.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SalesOrderApprovalsPage() {
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)
  const [statusFilter, setStatusFilter] = useState<PartnerApprovalStatus | ''>('')
  const unusedDays = 30
  const [selectedCandidateCodes, setSelectedCandidateCodes] = useState<string[]>([])
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  // [2026-06-11 P3 #6] 승인상태 변경·비밀번호 초기화는 BE 가 @RequirePermission(page="sales.partner-order.list",
  //   action=UPDATE) 로 가드한다(PartnerApprovalsController). FE 도 동일 page-code 의 update 권한으로
  //   변경 액션을 가드해 BE 와 정합한다(view 만 가진 영업 보조 계정은 변경 불가). route 는 view 만 가드하므로
  //   본 화면 진입은 가능하되 변경 버튼만 비활성화한다.
  const canUpdateApproval = canAccess('sales.partner-order.list', 'update')

  useEffect(() => {
    setPageTitle({ title: '주문서 승인', meta: '영업' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle])

  // PR-H4c: 승인 status 변경/비밀번호 초기화는 BE audit log 자동 기록 — 30s 자동 갱신
  // 으로 SSE invalidate 효과 흉내. 단건 row SSE 는 partner-service entity-bound 미지원.
  const query = useQuery({
    queryKey: ['partner-approvals', statusFilter],
    queryFn: () => listPartnerApprovals(0, 100, statusFilter || undefined),
    retry: 1,
    refetchInterval: 30_000,
  })

  const previewQuery = useQuery({
    queryKey: ['partner-access-preview', unusedDays],
    queryFn: () => previewPartnerAccess(unusedDays),
    retry: 1,
  })
  const candidateCodes = new Set((previewQuery.data?.candidates ?? []).map((a) => a.partnerCode))

  const updateStatus = useMutation({
    mutationFn: ({ code, status }: { code: string; status: PartnerApprovalStatus }) =>
      updatePartnerApprovalStatus(code, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['partner-approvals'] })
    },
  })

  const resetPw = useMutation({
    mutationFn: (code: string) => resetPartnerPassword(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['partner-approvals'] })
    },
  })

  function handleStatusChange(approval: PartnerApproval, next: PartnerApprovalStatus) {
    // [2026-06-11 P3 #6] update 권한 없으면 변경 시도 자체를 차단(버튼 비활성과 이중 방어).
    if (!canUpdateApproval) return
    if (approval.status === next) return
    if (
      next === 'ACCESS_DENIED'
      && !window.confirm(`${approval.partnerName} 거래처를 접근제한 처리하시겠습니까?`)
    ) {
      return
    }
    updateStatus.mutate({ code: approval.partnerCode, status: next })
  }

  function handleBulkReset() {
    if (!canUpdateApproval || selectedCandidateCodes.length === 0) return
    const selected = (previewQuery.data?.candidates ?? []).filter((a) => selectedCandidateCodes.includes(a.partnerCode))
    if (!window.confirm(
      `다음 ${selected.length}개 거래처의 비밀번호를 초기화하시겠습니까?\n\n${selected.map((a) => `${a.partnerCode} ${a.partnerName}`).join('\n')}`,
    )) return
    void Promise.all(selected.map((a) => resetPartnerPassword(a.partnerCode)))
      .then(() => {
        setSelectedCandidateCodes([])
        void queryClient.invalidateQueries({ queryKey: ['partner-approvals'] })
        void queryClient.invalidateQueries({ queryKey: ['partner-access-preview'] })
      })
  }

  function handleResetPassword(approval: PartnerApproval) {
    // [2026-06-11 P3 #6] update 권한 없으면 초기화 시도 자체를 차단(버튼 비활성과 이중 방어).
    // 미리보기 목록에 포함된 대상만 실행 가능하다. 대상 확인 없는 초기화 경로를 막는다.
    if (!canResetPartnerPassword(approval.partnerCode, candidateCodes, canUpdateApproval)) return
    if (
      !window.confirm(
        `${approval.partnerName} 거래처의 비밀번호를 초기화하시겠습니까?\n\n초기화 후 거래처 다음 접속 시 비밀번호 재설정 페이지가 표시됩니다.`,
      )
    )
      return
    resetPw.mutate(approval.partnerCode)
  }

  const columns: DataTableColumn<PartnerApproval>[] = [
    { key: 'partnerCode', header: '거래처 코드', mobilePriority: 'primary' },
    { key: 'partnerName', header: '거래처명', mobilePriority: 'secondary' },
    {
      key: 'status',
      header: '승인 상태',
      mobilePriority: 'secondary',
      render: (a) => (
        <>
          <span
            className={`${styles['statusBadge']} ${STATUS_CLASS[a.status] ?? ''}`}
            style={{ marginRight: 6 }}
          >
            {PARTNER_APPROVAL_STATUS_LABEL[a.status]}
          </span>
          {/* v2 §정정 11 — 영업자 status 변경 (DropdownSelect on row). */}
          <select
            className={styles['statusSelect']}
            value={a.status}
            onChange={(e) =>
              handleStatusChange(
                a,
                e.target.value as PartnerApprovalStatus,
              )
            }
            aria-label={`${a.partnerName} 상태 변경`}
            disabled={updateStatus.isPending || !canUpdateApproval}
          >
            {(
              Object.keys(
                PARTNER_APPROVAL_STATUS_LABEL,
              ) as PartnerApprovalStatus[]
            ).map((s) => (
              <option key={s} value={s}>
                {PARTNER_APPROVAL_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </>
      ),
    },
    {
      key: 'approvalRequestedAt',
      header: '승인 요청 일시',
      mobilePriority: 'secondary',
      render: (a) => fmtDateTime(a.approvalRequestedAt),
    },
    {
      key: 'pcTutorialDone',
      header: 'PC 튜토리얼',
      mobilePriority: 'hidden',
      render: (a) => (a.pcTutorialDone ? '완료' : '미완'),
    },
    {
      key: 'mobileTutorialDone',
      header: '모바일 튜토리얼',
      mobilePriority: 'hidden',
      render: (a) => (a.mobileTutorialDone ? '완료' : '미완'),
    },
    {
      key: 'assignedManagerName',
      header: '담당자',
      mobilePriority: 'secondary',
      render: (a) => a.assignedManagerName ?? '-',
    },
    {
      key: 'actions',
      header: '액션',
      mobilePriority: 'secondary',
      render: (a) => (
        <button
          type="button"
          className={styles['btnGhost']}
          onClick={() => handleResetPassword(a)}
          disabled={
            resetPw.isPending
            || a.status === 'PASSWORD_RESET_PENDING'
            || !canUpdateApproval
            || !canResetPartnerPassword(a.partnerCode, candidateCodes, canUpdateApproval)
          }
          aria-label={`${a.partnerName} 비밀번호 초기화`}
        >
          비밀번호 초기화
        </button>
      ),
    },
  ]

  return (
    <div style={{ color: 'var(--ink-primary)', background: 'var(--surface-card)' }}>
      <div className={styles['wrap']}>
        {/* PR-H4c FE-A: 승인 변경 audit 안내 — 변경 시 BE audit log 자동 기록 */}
        <AuditInfoBanner
          message="승인 상태 변경과 비밀번호 초기화는 BE audit 로그에 자동 기록됩니다. 본 목록은 30초마다 자동 갱신됩니다."
          testId="partner-approvals-audit-info-banner"
        />
        <div className={styles['top']}>
          <div className={styles['title']}>
            주문서 승인
            <span className={styles['badge']}>전체 {query.data?.totalElements ?? 0}건</span>
          </div>
          <div className={styles['topActions']}>
            <span aria-label="장기미발주 기준 기간">장기미발주 기준: 주문·출고 활동 없음 30일</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as PartnerApprovalStatus | '')
              }
              aria-label="상태 필터"
              className={styles['statusSelect']}
              style={{ padding: '6px 10px', fontSize: 13 }}
            >
              <option value="">전체 상태</option>
              {(
                Object.keys(PARTNER_APPROVAL_STATUS_LABEL) as PartnerApprovalStatus[]
              ).map((s) => (
                <option key={s} value={s}>
                  {PARTNER_APPROVAL_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <section
          aria-labelledby="access-preview-heading"
          style={{ marginBottom: 16, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <h2 id="access-preview-heading" style={{ margin: 0, fontSize: 16 }}>비밀번호 초기화 대상 미리보기</h2>
              <p style={{ margin: '6px 0 0', color: '#4b5563', fontSize: 13 }}>
                마지막 로그인·비밀번호 변경일이 아니라 주문 확정일과 출고일을 함께 확인해, 두 활동이 모두 30일 이상 없는 거래처입니다. 비밀번호 초기화는 별도 기능으로 동작합니다.
              </p>
            </div>
            <button
              type="button"
              className={styles['btnGhost']}
              onClick={handleBulkReset}
              disabled={!canUpdateApproval || selectedCandidateCodes.length === 0 || resetPw.isPending}
            >
              선택 대상 비밀번호 초기화 ({selectedCandidateCodes.length})
            </button>
          </div>
          {previewQuery.isLoading ? <p>대상을 계산하는 중…</p> : previewQuery.isError ? <p>대상 미리보기를 불러오지 못했습니다.</p> : (
            <div style={{ marginTop: 12 }}>
              <strong data-testid="access-preview-count">현재 대상 {previewQuery.data?.candidates.length ?? 0}건</strong>
              {previewQuery.data?.deferred ? (
                <p role="alert" style={{ color: '#b45309' }}>
                  주문·출고 조회 실패로 {previewQuery.data.deferredPartnerCount}건의 판정이 보류되었습니다.
                  ({previewQuery.data.deferredSources.join(', ')})
                </p>
              ) : null}
              {(previewQuery.data?.candidates ?? []).map((a) => (
                <label key={a.partnerCode} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={selectedCandidateCodes.includes(a.partnerCode)}
                    onChange={(e) => setSelectedCandidateCodes((codes) => e.target.checked
                      ? [...codes, a.partnerCode]
                      : codes.filter((code) => code !== a.partnerCode))}
                    disabled={!canUpdateApproval}
                  />
                  <span>{a.partnerCode} · {a.partnerName}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        {query.isLoading ? (
          <div className={styles['emptyState']}>주문서 승인 목록을 불러오는 중…</div>
        ) : query.isError ? (
          <div className={styles['emptyState']}>
            <h3>partner-service 가 응답하지 않습니다</h3>
            <p>backend M5 partner-service 가 미배포 상태일 수 있습니다.</p>
            <p style={{ fontSize: 11 }}>endpoint: GET /api/v1/partner-approvals</p>
          </div>
        ) : (query.data?.content ?? []).length === 0 ? (
          <div className={styles['emptyState']}>
            <h3>해당 조건의 거래처가 없습니다</h3>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={query.data?.content ?? []}
            rowKey={(a) => a.partnerCode}
            emptyMessage="해당 조건의 거래처가 없습니다"
          />
        )}
      </div>
    </div>
  )
}
