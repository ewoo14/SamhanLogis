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
  ACCOUNTING_EDIT_REQUEST_TYPE_LABEL,
  approveAccountingEditRequest,
  listAccountingEditRequests,
  rejectAccountingEditRequest,
  type AccountingEditRequest,
  type AccountingEditRequestType,
} from '../../api/accountingEditRequest'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePermissions } from '../../hooks/usePermissions'

const TYPE_VARIANT: Record<AccountingEditRequestType, BadgeVariant> = {
  EDIT: 'warning',
  DELETE: 'danger',
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  if (iso.length >= 16) {
    return `${iso.substring(0, 10)} ${iso.substring(11, 16)}`
  }
  return iso
}

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

/** UUID 비공개 가드 — data-testid 전용 짧은 slice (사용자 텍스트 노출 X). */
function requestTestId(req: AccountingEditRequest): string {
  return req.id.slice(0, 8)
}

export function AccountingEditRequestsPage() {
  usePageTitle('회계 수정/삭제 요청')

  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canDecide = canAccess('accounting.edit-requests.decide', 'update')
  const [rejectTarget, setRejectTarget] =
    useState<AccountingEditRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const query = useQuery({
    queryKey: ['admin', 'accounting-edit-requests', 'PENDING'],
    queryFn: listAccountingEditRequests,
    refetchInterval: 30_000,
  })

  useEffect(() => {
    // accounting edit-request broadcast SSE 합류 전까지 polling 으로 동기화.
  }, [queryClient])

  const approveMutation = useMutation({
    mutationFn: (req: AccountingEditRequest) =>
      approveAccountingEditRequest(req.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'accounting-edit-requests'],
      })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (vars: { req: AccountingEditRequest; reason: string }) =>
      rejectAccountingEditRequest(vars.req.id, { reason: vars.reason }),
    onSuccess: () => {
      setRejectTarget(null)
      setRejectReason('')
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'accounting-edit-requests'],
      })
    },
  })

  const handleApprove = (req: AccountingEditRequest) => {
    if (!canDecide) return
    const typeLabel = ACCOUNTING_EDIT_REQUEST_TYPE_LABEL[req.requestType]
    if (
      !window.confirm(
        `${safeActorName(req.requesterName) ?? '변경자 미상'}님의 ${typeLabel} 요청을 수락합니다.\n\n진행하시겠습니까?`,
      )
    ) {
      return
    }
    approveMutation.mutate(req)
  }

  const handleOpenReject = (req: AccountingEditRequest) => {
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
            data-testid="admin-accounting-edit-requests-empty"
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
            data-testid="admin-accounting-edit-requests-table"
            className="slip-line-table"
            style={{ width: '100%' }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>요청자</th>
                <th style={{ textAlign: 'left' }}>요청 유형</th>
                <th style={{ textAlign: 'left' }}>사유</th>
                <th style={{ textAlign: 'left' }}>요청 시각</th>
                <th style={{ textAlign: 'right' }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {list.map((req) => {
                const testIdSlice = requestTestId(req)
                return (
                  <tr
                    key={req.id}
                    data-testid={`admin-accounting-edit-requests-row-${testIdSlice}`}
                  >
                    <td>{safeActorName(req.requesterName) ?? '변경자 미상'}</td>
                    <td>
                      <Badge variant={TYPE_VARIANT[req.requestType]}>
                        {ACCOUNTING_EDIT_REQUEST_TYPE_LABEL[req.requestType]}
                      </Badge>
                    </td>
                    <td
                      style={{
                        whiteSpace: 'pre-wrap',
                        maxWidth: 420,
                        fontSize: 13,
                      }}
                    >
                      {req.reason ?? ''}
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
                        data-testid={`admin-accounting-edit-requests-approve-${testIdSlice}`}
                        disabled={approveMutation.isPending || !canDecide}
                        onClick={() => handleApprove(req)}
                      >
                        수락
                      </Button>
                      <span style={{ display: 'inline-block', width: 8 }} />
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`admin-accounting-edit-requests-reject-${testIdSlice}`}
                        disabled={rejectMutation.isPending || !canDecide}
                        onClick={() => handleOpenReject(req)}
                      >
                        거절
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

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
              data-testid="admin-accounting-edit-requests-reject-submit"
            >
              거절 처리
            </Button>
          </>
        }
      >
        <div
          data-testid="admin-accounting-edit-requests-reject-dialog"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {rejectTarget ? (
            <p style={{ margin: 0, fontSize: 13 }}>
              {safeActorName(rejectTarget.requesterName) ?? '변경자 미상'}님의{' '}
              <strong>
                {ACCOUNTING_EDIT_REQUEST_TYPE_LABEL[rejectTarget.requestType]}
              </strong>{' '}
              요청을 거절합니다.
            </p>
          ) : null}
          <label
            htmlFor="accounting-edit-request-reject-reason"
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            거절 사유 (필수, 최소 5자)
          </label>
          <textarea
            id="accounting-edit-request-reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value.slice(0, 500))}
            maxLength={500}
            placeholder="예: 마감 이후 수정 불가"
            disabled={rejectMutation.isPending}
            style={{
              minHeight: 100,
              padding: 8,
              fontSize: 14,
              border: '1px solid var(--color-neutral-300)',
              borderRadius: 4,
              resize: 'vertical',
            }}
            data-testid="admin-accounting-edit-requests-reject-reason"
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
