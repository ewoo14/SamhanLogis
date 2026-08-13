/**
 * 창고 직원 — 전표 수정/삭제 요청 처리 대시보드 (`/admin/slip-edit-requests`).
 *
 * <p>PR-H3 FE-1. SALES/MANAGER/MASTER 가 CONFIRMED 전표에 대해 수정/삭제를 요청하면
 * WAREHOUSE/MANAGER/MASTER 가 본 화면에서 PENDING 목록을 보고 수락/거절 처리.
 *
 * <h2>접근 제어</h2>
 * <ul>
 *   <li>라우트 단계 {@code PermissionGuard(slip.edit-requests.decide, VIEW)} 가 진입을 제어</li>
 *   <li>BE {@code @RequirePermission} 이 최종 강제</li>
 * </ul>
 *
 * <h2>UI 구성</h2>
 * <ul>
 *   <li>표 columns: 전표번호 / 요청자 / type / 사유 / 요청 시각 / 액션</li>
 *   <li>"수락" 버튼 — confirm 후 BE approve 호출 → 자동 cache invalidate</li>
 *   <li>"거절" 버튼 — 사유 다이얼로그 (textarea ≥ 5자) → BE reject 호출</li>
 *   <li>SSE {@code slip:edit-request:created} 수신 시 cache invalidate (자동 표시)</li>
 *   <li>30초 자동 polling fallback (SSE 미가용 / 멀티 워크스테이션 동기화)</li>
 * </ul>
 *
 * <h2>PR-H4c FE-C 보존</h2>
 * <p>본 페이지는 PR-H3 에서 이미 SSE 패턴 + 30s polling + admin layout 통합 완료 — FE-C
 * 일괄 보강 시 변경 없이 보존. (10 page 보강 매트릭스의 reference page).</p>
 *
 * <h2>data-testid</h2>
 * <ul>
 *   <li>{@code admin-slip-edit-requests-table}</li>
 *   <li>{@code admin-slip-edit-requests-row-{slipNo}} (UUID 비공개 가드)</li>
 *   <li>{@code admin-slip-edit-requests-approve-{slipNo}}</li>
 *   <li>{@code admin-slip-edit-requests-reject-{slipNo}}</li>
 *   <li>{@code admin-slip-edit-requests-empty}</li>
 *   <li>{@code admin-slip-edit-requests-reject-dialog}</li>
 * </ul>
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>표 행 / 버튼 data-testid 는 사용자 노출 식별자({@code slipNo}) 를 사용한다.
 * 응답의 {@code id} (요청 UUID) 는 mutation key + Reject dialog 내부 state 전용.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  Modal,
  type BadgeVariant,
} from '@samhan/design-system'
import { safeActorName } from '@samhan/design-system'
import {
  approveSlipEditRequest,
  listSlipEditRequests,
  rejectSlipEditRequest,
  SLIP_EDIT_REQUEST_TYPE_LABEL,
  type SlipEditRequest,
  type SlipEditRequestType,
} from '../../api/slipEditRequest'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePermissions } from '../../hooks/usePermissions'

/** type → Badge variant. */
const TYPE_VARIANT: Record<SlipEditRequestType, BadgeVariant> = {
  EDIT: 'warning',
  DELETE: 'danger',
}

/** ISO 시각 → "YYYY-MM-DD HH:mm" (BE LocalDateTime 직렬화). */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  if (iso.length >= 16) {
    return `${iso.substring(0, 10)} ${iso.substring(11, 16)}`
  }
  return iso
}

/** axios/Error 객체에서 사용자 노출 가능한 메시지 추출. */
function extractMessage(err: unknown): string | null {
  if (!err) return null
  const anyErr = err as {
    response?: { data?: { message?: string } }
    message?: string
  }
  return (
    anyErr.response?.data?.message
    ?? anyErr.message
    ?? '요청 처리 중 오류가 발생했습니다.'
  )
}

export function SlipEditRequestsPage() {
  usePageTitle('전표 수정/삭제 요청')

  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canDecide = canAccess('slip.edit-requests.decide', 'update')
  const [rejectTarget, setRejectTarget] = useState<SlipEditRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const query = useQuery({
    queryKey: ['admin', 'slip-edit-requests', 'PENDING'],
    queryFn: () => listSlipEditRequests({ status: 'PENDING' }),
    // 30초 polling — SSE 미가용 환경 + 멀티 워크스테이션 동기화 안전망
    refetchInterval: 30_000,
  })

  // SSE slip:edit-request:created 이벤트 수신 → cache invalidate.
  // 본 화면은 단일 슬립 ID 를 모르므로 SSE 채널은 별도 broadcast endpoint 가 합류하기 전까지
  // 30초 polling 으로 동기화. 합류 후 SlipRealtimeClient 의 broadcast 모드로 교체 예정.
  // (PR-H3 BE 슬라이스 합류 시점 전환).
  useEffect(() => {
    // BE broadcast SSE endpoint 합류 전 단계 — placeholder. polling 으로 대체.
  }, [queryClient])

  const approveMutation = useMutation({
    mutationFn: (req: SlipEditRequest) =>
      approveSlipEditRequest(req.slipId, req.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'slip-edit-requests'],
      })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (vars: { req: SlipEditRequest; reason: string }) =>
      rejectSlipEditRequest(vars.req.slipId, vars.req.id, {
        reason: vars.reason,
      }),
    onSuccess: () => {
      setRejectTarget(null)
      setRejectReason('')
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'slip-edit-requests'],
      })
    },
  })

  const handleApprove = (req: SlipEditRequest) => {
    if (!canDecide) return
    const typeLabel = SLIP_EDIT_REQUEST_TYPE_LABEL[req.type]
    if (
      !window.confirm(
        `[${req.slipNo}] 전표의 ${typeLabel} 요청을 수락합니다.\n\n${
          req.type === 'EDIT'
            ? '수락 시 작성자가 전표를 다시 편집할 수 있게 됩니다.'
            : '수락 시 전표가 즉시 취소(삭제) 됩니다. 되돌릴 수 없습니다.'
        }\n\n진행하시겠습니까?`,
      )
    ) {
      return
    }
    approveMutation.mutate(req)
  }

  const handleOpenReject = (req: SlipEditRequest) => {
    if (!canDecide) return
    setRejectTarget(req)
    setRejectReason('')
  }

  const handleRejectSubmit = () => {
    if (!rejectTarget) return
    if (!canDecide) return
    const trimmed = rejectReason.trim()
    if (trimmed.length < 5) return
    rejectMutation.mutate({ req: rejectTarget, reason: trimmed })
  }

  const list = Array.isArray(query.data) ? query.data : []
  const approveError = extractMessage(approveMutation.error)
  const rejectError = extractMessage(rejectMutation.error)
  const queryError = extractMessage(query.error)

  return (
    <>
      <Card padding={4} shadow="sm">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>처리 대기 요청</h3>
          <span
            style={{
              fontSize: 12,
              color: 'var(--color-neutral-500)',
            }}
          >
            총 {list.length}건 · 30초 자동 갱신
          </span>
        </div>

        {query.isError ? (
          <div className="error-banner" role="alert">
            요청 목록을 불러오지 못했습니다. {queryError ?? ''}
          </div>
        ) : null}

        {approveError ? (
          <div className="error-banner" role="alert" style={{ marginBottom: 8 }}>
            수락 처리 실패: {approveError}
          </div>
        ) : null}

        {query.isLoading ? (
          <p>불러오는 중...</p>
        ) : list.length === 0 ? (
          <p
            data-testid="admin-slip-edit-requests-empty"
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--color-neutral-500)',
            }}
          >
            처리 대기 중인 요청이 없습니다.
          </p>
        ) : (
          <table
            data-testid="admin-slip-edit-requests-table"
            className="slip-line-table"
            style={{ width: '100%' }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>전표번호</th>
                <th style={{ textAlign: 'left' }}>요청자</th>
                <th style={{ textAlign: 'left' }}>요청</th>
                <th style={{ textAlign: 'left' }}>사유</th>
                <th style={{ textAlign: 'left' }}>요청 시각</th>
                <th style={{ textAlign: 'right' }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {list.map((req) => (
                <tr
                  key={req.id}
                  data-testid={`admin-slip-edit-requests-row-${req.slipNo}`}
                >
                  <td>
                    <strong>{req.slipNo}</strong>
                  </td>
                  <td>{safeActorName(req.requesterName) ?? '변경자 미상'}</td>
                  <td>
                    <Badge variant={TYPE_VARIANT[req.type]}>
                      {SLIP_EDIT_REQUEST_TYPE_LABEL[req.type]}
                    </Badge>
                  </td>
                  <td
                    style={{
                      whiteSpace: 'pre-wrap',
                      maxWidth: 360,
                      fontSize: 13,
                    }}
                  >
                    {req.reason}
                  </td>
                  <td
                    style={{
                      fontSize: 13,
                      color: 'var(--color-neutral-700)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatDateTime(req.requestedAt)}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      data-testid={`admin-slip-edit-requests-approve-${req.slipNo}`}
                      disabled={approveMutation.isPending || !canDecide}
                      onClick={() => handleApprove(req)}
                    >
                      수락
                    </Button>
                    <span style={{ display: 'inline-block', width: 8 }} />
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`admin-slip-edit-requests-reject-${req.slipNo}`}
                      disabled={rejectMutation.isPending || !canDecide}
                      onClick={() => handleOpenReject(req)}
                    >
                      거절
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* 거절 사유 입력 다이얼로그 */}
      <Modal
        open={!!rejectTarget}
        onClose={() => {
          if (!rejectMutation.isPending) {
            setRejectTarget(null)
            setRejectReason('')
          }
        }}
        title="요청 거절"
        size="md"
        closeOnEsc={!rejectMutation.isPending}
        closeOnBackdropClick={!rejectMutation.isPending}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setRejectTarget(null)
                setRejectReason('')
              }}
              disabled={rejectMutation.isPending}
            >
              취소
            </Button>
              <Button
                variant="danger"
                loading={rejectMutation.isPending}
                disabled={rejectReason.trim().length < 5 || !canDecide}
                onClick={handleRejectSubmit}
                data-testid="admin-slip-edit-requests-reject-submit"
            >
              거절 처리
            </Button>
          </>
        }
      >
        <div
          data-testid="admin-slip-edit-requests-reject-dialog"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {rejectTarget ? (
            <p style={{ margin: 0, fontSize: 13 }}>
              [{rejectTarget.slipNo}] 전표의{' '}
              <strong>
                {SLIP_EDIT_REQUEST_TYPE_LABEL[rejectTarget.type]}
              </strong>{' '}
              요청을 거절합니다.
              <br />
              요청자: {safeActorName(rejectTarget.requesterName) ?? '변경자 미상'}
            </p>
          ) : null}
          <label
            htmlFor="slip-edit-request-reject-reason"
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            거절 사유 (필수, 최소 5자)
          </label>
          <textarea
            id="slip-edit-request-reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value.slice(0, 500))}
            maxLength={500}
            placeholder="예: 이미 출고가 완료된 전표라 수정 불가"
            disabled={rejectMutation.isPending}
            style={{
              minHeight: 100,
              padding: 8,
              fontSize: 14,
              border: '1px solid var(--color-neutral-300)',
              borderRadius: 4,
              resize: 'vertical',
            }}
            data-testid="admin-slip-edit-requests-reject-reason"
          />
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-neutral-500)',
              textAlign: 'right',
            }}
          >
            {rejectReason.length}/500
          </div>
          {rejectError ? (
            <div className="error-banner" role="alert">
              거절 처리 실패: {rejectError}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
