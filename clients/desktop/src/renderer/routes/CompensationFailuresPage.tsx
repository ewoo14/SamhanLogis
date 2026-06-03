/**
 * 시리얼 보상 실패 복구 화면 (`/inventory/compensation-failures`).
 *
 * D-SER-23 슬라이스. BE `GET /api/v1/slips/compensation-failures` +
 * `PATCH /api/v1/slips/compensation-failures/{id}/resolve` backing.
 *
 * UUID 노출 가드 (memory `feedback_uuid_no_user_visibility`):
 * - 화면에는 slipNo / slipType / phase / productCode / attemptedOperation / failureReason / resolved 만 표시.
 * - id(UUID) 는 PATCH param 전용, 화면 텍스트 노출 금지.
 * - slipId(UUID) 는 응답에 없음 (BE 설계).
 *
 * 권한: PermissionGuard(pageCode="inventory.list", action="view").
 *
 * data-testid spec:
 * - compensation-failures-page              루트 div
 * - compensation-failures-filter-toggle     resolved 필터 토글 버튼
 * - compensation-failures-refresh           새로고침 버튼
 * - compensation-failures-table             테이블 wrapper
 * - compensation-failures-row-{slipNo}      행 단위 (slipNo 비즈니스 식별자 사용)
 * - compensation-failures-badge-{slipNo}    resolved 배지
 * - compensation-failures-resolve-{slipNo}  해소 처리 버튼
 * - compensation-failures-empty             빈 상태
 * - compensation-failures-resolve-dialog    확인 다이얼로그
 * - compensation-failures-resolve-confirm   다이얼로그 확인 버튼
 * - compensation-failures-resolve-cancel    다이얼로그 취소 버튼
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  Modal,
  Spinner,
  type BadgeVariant,
} from '@samhan/design-system'
import {
  fetchCompensationFailures,
  resolveCompensationFailure,
  type CompensationFailureResponse,
} from '../api/compensationFailureApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

const PAGE_SIZE = 20

/** ISO 시각 → "YYYY-MM-DD HH:mm" */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  if (iso.length >= 16) {
    return `${iso.substring(0, 10)} ${iso.substring(11, 16)}`
  }
  return iso
}

/** axios/Error 에서 사용자 노출 메시지 추출 */
function extractMessage(err: unknown): string {
  if (!err) return '오류가 발생했습니다.'
  const e = err as { response?: { data?: { message?: string } }; message?: string }
  return e.response?.data?.message ?? e.message ?? '오류가 발생했습니다.'
}

/** resolved 상태 → Badge variant */
function resolvedVariant(resolved: boolean): BadgeVariant {
  return resolved ? 'neutral' : 'warning'
}

/** resolved 상태 → 한국어 라벨 */
function resolvedLabel(resolved: boolean): string {
  return resolved ? '해소됨' : '미해소'
}

/** 테이블 헤더 셀 helper */
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      style={{
        padding: '10px 12px',
        textAlign: 'left',
        fontWeight: 600,
        fontSize: 12,
        color: 'var(--color-neutral-600)',
        whiteSpace: 'nowrap',
        background: 'var(--color-neutral-50)',
        borderBottom: '2px solid var(--color-neutral-200)',
      }}
    >
      {children}
    </th>
  )
}

/** 테이블 데이터 셀 helper */
function Td({
  children,
  muted,
}: {
  children: React.ReactNode
  muted?: boolean
}) {
  return (
    <td
      style={{
        padding: '10px 12px',
        verticalAlign: 'middle',
        color: muted ? 'var(--color-neutral-500)' : undefined,
        fontSize: 13,
      }}
    >
      {children}
    </td>
  )
}

export function CompensationFailuresPage() {
  usePageTitle('보상 실패 복구')

  const queryClient = useQueryClient()
  // 해소(resolve) 는 BE 가 inventory.list UPDATE 권한을 요구 → update 권한 없는 역할(예: ACCOUNTANT)에게는
  // 버튼을 숨겨 클릭 시 403 혼란을 방지한다(BE @RequirePermission UPDATE 와 정합).
  const { canAccess } = usePermissions()
  const canResolve = canAccess('inventory.list', 'update')

  /** resolved=false 기본 — 전체 보기 시 true */
  const [showAll, setShowAll] = useState(false)
  const [page, setPage] = useState(0)

  /** 해소 처리 확인 다이얼로그 대상 */
  const [resolveTarget, setResolveTarget] = useState<CompensationFailureResponse | null>(null)

  const query = useQuery({
    queryKey: ['inventory', 'compensation-failures', { resolved: showAll, page }],
    queryFn: () =>
      fetchCompensationFailures({
        resolved: showAll,
        page,
        size: PAGE_SIZE,
      }),
  })

  const resolveMutation = useMutation({
    mutationFn: (failure: CompensationFailureResponse) =>
      resolveCompensationFailure(failure.id),
    onSuccess: () => {
      setResolveTarget(null)
      void queryClient.invalidateQueries({
        queryKey: ['inventory', 'compensation-failures'],
      })
    },
  })

  const list: CompensationFailureResponse[] = query.data?.content ?? []
  const totalElements = query.data?.totalElements ?? 0
  const totalPages = query.data?.totalPages ?? 1
  const isLastPage = query.data?.last ?? true
  const isFirstPage = query.data?.first ?? true

  const handleOpenResolve = (f: CompensationFailureResponse) => {
    setResolveTarget(f)
  }

  const handleConfirmResolve = () => {
    if (!resolveTarget) return
    resolveMutation.mutate(resolveTarget)
  }

  const handleFilterToggle = () => {
    setShowAll((v) => !v)
    setPage(0)
  }

  const handleRefresh = () => {
    void query.refetch()
  }

  const queryError = query.isError ? extractMessage(query.error) : null
  const mutateError = resolveMutation.isError ? extractMessage(resolveMutation.error) : null

  return (
    <div data-testid="compensation-failures-page">
      <Card padding={4} shadow="sm">
        {/* 헤더 영역 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              보상 실패 복구
            </h1>
            {!query.isLoading ? (
              <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                총 <strong>{totalElements}건</strong>
                {showAll ? ' (전체)' : ' (미해소)'}
              </span>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button
              variant="secondary"
              size="sm"
              data-testid="compensation-failures-filter-toggle"
              onClick={handleFilterToggle}
            >
              {showAll ? '미해소만 보기' : '전체 보기'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-testid="compensation-failures-refresh"
              onClick={handleRefresh}
              disabled={query.isFetching}
            >
              새로고침
            </Button>
          </div>
        </div>

        {/* 오류 배너 */}
        {queryError ? (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              background: 'var(--color-danger-50)',
              border: '1px solid var(--color-danger-200)',
              borderRadius: 6,
              color: 'var(--color-danger-700)',
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            목록을 불러오지 못했습니다. {queryError}
          </div>
        ) : null}

        {mutateError ? (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              background: 'var(--color-danger-50)',
              border: '1px solid var(--color-danger-200)',
              borderRadius: 6,
              color: 'var(--color-danger-700)',
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            해소 처리 실패: {mutateError}
          </div>
        ) : null}

        {/* 로딩 */}
        {query.isLoading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '40px 0',
              gap: 8,
              color: 'var(--color-neutral-500)',
              fontSize: 13,
            }}
          >
            <Spinner size="sm" />
            <span>불러오는 중...</span>
          </div>
        ) : list.length === 0 ? (
          /* 빈 상태 */
          <div
            data-testid="compensation-failures-empty"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '60px 24px',
              color: 'var(--color-neutral-400)',
              fontSize: 14,
              gap: 8,
            }}
          >
            <span style={{ fontSize: 32 }}>✓</span>
            <span>
              {showAll
                ? '보상 실패 레코드가 없습니다.'
                : '미해소 보상 실패가 없습니다.'}
            </span>
          </div>
        ) : (
          /* 테이블 */
          <div
            data-testid="compensation-failures-table"
            style={{ overflowX: 'auto' }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                color: 'var(--color-neutral-800)',
              }}
            >
              <thead>
                <tr>
                  <Th>발생일시</Th>
                  <Th>전표번호</Th>
                  <Th>유형</Th>
                  <Th>단계</Th>
                  <Th>품목</Th>
                  <Th>시도동작</Th>
                  <Th>실패사유</Th>
                  <Th>해소</Th>
                  <Th>액션</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((f) => (
                  <tr
                    key={f.id}
                    data-testid={`compensation-failures-row-${f.slipNo}`}
                    style={{ borderBottom: '1px solid var(--color-neutral-100)' }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLTableRowElement).style.background =
                        'var(--color-neutral-50)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLTableRowElement).style.background =
                        'transparent'
                    }}
                  >
                    <Td muted>
                      <span style={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(f.occurredAt)}
                      </span>
                    </Td>
                    <Td>
                      <strong>{f.slipNo}</strong>
                    </Td>
                    <Td muted>
                      <code
                        style={{
                          fontSize: 12,
                          color: 'var(--color-neutral-600)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {f.slipType}
                      </code>
                    </Td>
                    <Td muted>
                      <code
                        style={{
                          fontSize: 12,
                          color: 'var(--color-neutral-600)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {f.phase}
                      </code>
                    </Td>
                    <Td>
                      <code
                        style={{
                          fontSize: 12,
                          fontFamily: 'monospace',
                        }}
                      >
                        {f.productCode}
                      </code>
                    </Td>
                    <Td muted>
                      <code
                        style={{
                          fontSize: 12,
                          color: 'var(--color-neutral-600)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {f.attemptedOperation}
                      </code>
                    </Td>
                    <Td>
                      <span
                        style={{
                          maxWidth: 300,
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={f.failureReason}
                      >
                        {f.failureReason}
                      </span>
                    </Td>
                    <Td>
                      <Badge
                        variant={resolvedVariant(f.resolved)}
                        data-testid={`compensation-failures-badge-${f.slipNo}`}
                      >
                        {resolvedLabel(f.resolved)}
                      </Badge>
                    </Td>
                    <Td>
                      {!f.resolved && canResolve ? (
                        <Button
                          variant="primary"
                          size="sm"
                          data-testid={`compensation-failures-resolve-${f.slipNo}`}
                          disabled={resolveMutation.isPending}
                          onClick={() => handleOpenResolve(f)}
                        >
                          해소 처리
                        </Button>
                      ) : (
                        <span
                          style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}
                        >
                          —
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8,
              marginTop: 16,
            }}
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={isFirstPage || query.isFetching}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              이전
            </Button>
            <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={isLastPage || query.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </Button>
          </div>
        ) : null}
      </Card>

      {/* 해소 처리 확인 다이얼로그 */}
      <Modal
        open={!!resolveTarget}
        onClose={() => {
          if (!resolveMutation.isPending) setResolveTarget(null)
        }}
        title="해소 처리 확인"
        closeOnEsc={!resolveMutation.isPending}
        closeOnBackdropClick={!resolveMutation.isPending}
        closeOnHeaderX={!resolveMutation.isPending}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              size="sm"
              data-testid="compensation-failures-resolve-cancel"
              disabled={resolveMutation.isPending}
              onClick={() => setResolveTarget(null)}
            >
              취소
            </Button>
            <Button
              variant="primary"
              size="sm"
              data-testid="compensation-failures-resolve-confirm"
              disabled={resolveMutation.isPending}
              onClick={handleConfirmResolve}
            >
              {resolveMutation.isPending ? '처리 중...' : '해소 처리'}
            </Button>
          </div>
        }
      >
        {resolveTarget ? (
          <div data-testid="compensation-failures-resolve-dialog" style={{ fontSize: 14, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 12px' }}>
              아래 보상 실패 건을 수동 정합 완료 처리합니다.
            </p>
            <table
              style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}
            >
              <tbody>
                <tr>
                  <td
                    style={{
                      padding: '4px 8px 4px 0',
                      color: 'var(--color-neutral-500)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    전표번호
                  </td>
                  <td style={{ padding: '4px 0' }}>
                    <strong>{resolveTarget.slipNo}</strong>
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      padding: '4px 8px 4px 0',
                      color: 'var(--color-neutral-500)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    품목
                  </td>
                  <td style={{ padding: '4px 0' }}>{resolveTarget.productCode}</td>
                </tr>
                <tr>
                  <td
                    style={{
                      padding: '4px 8px 4px 0',
                      color: 'var(--color-neutral-500)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    실패사유
                  </td>
                  <td
                    style={{
                      padding: '4px 0',
                      color: 'var(--color-danger-700)',
                    }}
                  >
                    {resolveTarget.failureReason}
                  </td>
                </tr>
              </tbody>
            </table>
            <p
              style={{
                margin: '12px 0 0',
                fontSize: 12,
                color: 'var(--color-neutral-500)',
              }}
            >
              해소 처리 후에는 되돌릴 수 없습니다. 재고 수동 정합을 먼저 완료했는지 확인하세요.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
