/**
 * 전표 상세 + 라이프사이클 transition 화면 (출고/입고 공용).
 *
 * Slice A (sales-polish-2-slice) 갱신 — Designer `wireframes.md` § 5 충실 반영:
 * - 사용자 피드백 #1 ("라이프사이클" 모호) 해결 → `<ProgressBar>` 신규 컴포넌트로 대체
 *   ProgressBar 헤더 정보 위에 위치 (사용자 진입 시 즉시 단계 확인)
 *   기존 transition 버튼 영역은 "다음 단계 액션" 으로 ProgressBar 아래 유지
 * - 사용자 피드백 #9 — 결재 정보 카드 (출고인/검수인 자동 채움) 신규 표시
 * - INSPECTING 신규 단계 transition (`PROCESSING → INSPECTING → COMPLETED`) 지원
 * - usePageTitle 로 AppHeader 동적 화면명 ("출고전표 상세 [2026/05/04-1]")
 *
 * status 별 transition (Slice A 갱신 — INSPECTING 신규):
 * - DRAFT      → save / cancel
 * - SAVED      → send / cancel
 * - SENT       → accept / reject / cancel
 * - ACCEPTED   → process / reject
 * - PROCESSING → inspect (Slice A 신규 — 기존 complete 대신)
 * - INSPECTING → complete (Slice A 신규)
 * - COMPLETED  → ship (OUTBOUND) / confirm (INBOUND 즉시)
 * - SHIPPING   → deliver
 * - DELIVERED  → confirm (OUTBOUND)
 *
 * UUID 비공개 가드: id 는 path param 으로만 사용. 화면 표시 영역에는 노출 X.
 * dispatcher.userId / inspector.userId 도 화면 미노출 (이름만 표시).
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  AuditOverlay,
  Badge,
  Button,
  Card,
  CopyButton,
  KOREAN_MOBILE_PHONE_PATTERN,
  Modal,
  PhoneInput,
  ProgressBar,
  SignatureViewer,
  SlipEditRequestDialog,
  SlipNumberDisplay,
  type AuditLogEntry,
  type SlipEditRequestType as SlipEditRequestUiType,
} from '@samhan/design-system'
import axios from 'axios'
import {
  duplicateSlip,
  getSlip,
  removeLine,
  transitionSlip,
  updateSlipDriver,
  type SlipDetail,
  type SlipTransitionAction,
  type SlipType,
} from '../api/slip'
import { fetchStockBalanceBatch } from '../api/inventory'
import { invalidateSignature } from '../api/signature'
import {
  addSlipComment,
  listSlipComments,
  type SlipComment,
} from '../api/slipComment'
import {
  listAuditLogs,
  revertToRevision,
  type SlipAuditLogEntry,
} from '../api/slipAudit'
import {
  createSlipEditRequest,
  SLIP_EDIT_REQUEST_AUTHOR_ROLES,
  SLIP_EDIT_REQUEST_STATUS_LABEL,
  type SlipEditRequest,
  type SlipEditRequestType,
} from '../api/slipEditRequest'
import { SlipRealtimeClient } from '../realtime/SlipRealtimeClient'
import { useSessionStore, canTransitionSlip } from '../stores/session'
import { usePageTitle } from '../hooks/usePageTitle'

export interface SlipDetailPageProps {
  /** OUTBOUND 또는 INBOUND — 라우트별 listPath 결정 + ship/deliver 노출 여부. */
  mode: SlipType
}

/**
 * status 별 가능 transition 액션 목록 (Slice A 갱신 — INSPECTING 신규).
 * OUTBOUND/INBOUND 차이 (ship/deliver 는 출고전표 한정) 는 mode 로 필터.
 */
function actionsForStatus(
  status: SlipDetail['status'],
  mode: SlipType,
): SlipTransitionAction[] {
  switch (status) {
    case 'DRAFT':
      return ['save', 'cancel']
    case 'SAVED':
      return ['send', 'cancel']
    case 'SENT':
      return ['accept', 'reject', 'cancel']
    case 'ACCEPTED':
      return ['process', 'reject']
    case 'PROCESSING':
      return ['inspect'] // Slice A: complete → inspect (검수 단계 거침)
    case 'INSPECTING':
      return ['complete'] // Slice A 신규
    case 'COMPLETED':
      return mode === 'OUTBOUND' ? ['ship'] : ['confirm']
    case 'SHIPPING':
      return mode === 'OUTBOUND' ? ['deliver'] : []
    case 'DELIVERED':
      return mode === 'OUTBOUND' ? ['confirm'] : []
    default:
      return []
  }
}

const ACTION_LABEL: Record<SlipTransitionAction, string> = {
  save: '저장',
  send: '전송',
  accept: '수락',
  process: '처리 시작',
  inspect: '검수 시작', // Slice A 신규
  complete: '처리 완료',
  ship: '배송 시작',
  deliver: '배송 완료',
  confirm: '확정',
  reject: '반려',
  cancel: '취소',
}

/**
 * "2026-05-04T14:32:18+09:00" → "14:32" — Designer print-spec.md § 3.4.
 */
function formatHHmm(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(11, 16)
}

export function SlipDetailPage({ mode }: SlipDetailPageProps) {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''
  const navigate = useNavigate()
  const role = useSessionStore((s) => s.auth?.role)
  const queryClient = useQueryClient()
  const isOutbound = mode === 'OUTBOUND'
  const listPath = isOutbound ? '/sales' : '/purchases'

  const [rejectReason, setRejectReason] = useState('')
  /** 좌측 넘버링 클릭으로 선택된 라인 ID — 선택 시 상단 툴바 표시. */
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  // link-dispatch-slice 신규: driver 인라인 편집 state (DRAFT/SAVED 만 활성)
  const [editingDriver, setEditingDriver] = useState(false)
  const [draftDriverName, setDraftDriverName] = useState('')
  const [draftDriverPhone, setDraftDriverPhone] = useState('')
  // signature-slice-C 신규: 서명 무효화 modal state (MASTER only)
  const [invalidateOpen, setInvalidateOpen] = useState(false)
  const [invalidateReason, setInvalidateReason] = useState('')
  // PR-H1: 코멘트 입력 state
  const [commentInput, setCommentInput] = useState('')
  // PR-H3: 수정/삭제 요청 다이얼로그 state — null 이면 미오픈, 'EDIT'/'DELETE' 면 해당 type 으로 오픈.
  const [editRequestDialogType, setEditRequestDialogType]
    = useState<SlipEditRequestType | null>(null)
  // PR-H3: 가장 최근 본인 요청 (mutation 결과 + SSE decided 갱신). null = 요청 이력 없음.
  // BE 가 SlipDetail 응답에 latestEditRequest 필드 합류 시 그것으로 교체 가능.
  const [latestEditRequest, setLatestEditRequest]
    = useState<SlipEditRequest | null>(null)
  // PR-H3: 수락/거절 결과 toast (SSE slip:edit-request:decided 수신 시 표시).
  const [decisionToast, setDecisionToast]
    = useState<{ kind: 'success' | 'danger'; text: string } | null>(null)

  const detailQuery = useQuery({
    queryKey: ['slip', id],
    queryFn: () => getSlip(id),
    enabled: !!id,
  })

  // PR-H1: 코멘트 목록 백필 (최근 20건) — useQuery cache 키는 ['slipComments', id]
  const commentsQuery = useQuery({
    queryKey: ['slipComments', id],
    queryFn: () => listSlipComments(id, 20),
    enabled: !!id,
  })

  // PR-H2: audit log 백필 — useQuery cache 키 ['slipAuditLogs', id]
  // SSE "slip:edit" event 수신 시 함께 invalidate.
  const auditLogsQuery = useQuery({
    queryKey: ['slipAuditLogs', id],
    queryFn: () => listAuditLogs(id),
    enabled: !!id,
  })

  // PR-H1+PR-H2+PR-H3: SSE 구독 — 진입 시 1회, unmount 시 abort.
  // 이벤트 수신 시 슬립 본체/코멘트/audit-logs 모두 invalidate.
  useEffect(() => {
    if (!id) return
    const ctrl = SlipRealtimeClient.subscribe(id, (evt) => {
      // SSE 이벤트 수신 → 전표/코멘트/audit cache 무효화 (작은 입자 — 단순 invalidate 전략)
      void queryClient.invalidateQueries({ queryKey: ['slipComments', id] })
      // 전표 본체 변경 (status 등) 도 가능 → 함께 무효화
      void queryClient.invalidateQueries({ queryKey: ['slip', id] })
      // PR-H2: slip:edit event → audit-logs 재조회 (수정 횟수 + overlay 갱신)
      if (evt.event === 'slip:edit' || evt.event === 'message') {
        void queryClient.invalidateQueries({ queryKey: ['slipAuditLogs', id] })
      }
      // PR-H3: 수정/삭제 요청 결정 SSE — 작성자에게 toast + latestEditRequest 갱신.
      if (evt.event === 'slip:edit-request:decided') {
        const payload = evt.data as Partial<SlipEditRequest> | null
        if (payload && (payload.status === 'APPROVED' || payload.status === 'REJECTED')) {
          setLatestEditRequest((prev) => {
            // 본인 요청만 갱신 — id 일치하거나 prev 가 없을 때 (BE broadcast 모드 호환)
            if (!prev || (payload.id && prev.id === payload.id)) {
              return { ...(prev ?? ({} as SlipEditRequest)), ...payload } as SlipEditRequest
            }
            return prev
          })
          const typeLabel
            = payload.type === 'DELETE' ? '삭제' : '수정'
          if (payload.status === 'APPROVED') {
            setDecisionToast({
              kind: 'success',
              text: `${typeLabel} 요청이 수락되었습니다.${
                payload.decidedByName ? ` (담당: ${payload.decidedByName})` : ''
              }`,
            })
          } else {
            setDecisionToast({
              kind: 'danger',
              text: `${typeLabel} 요청이 거절되었습니다.${
                payload.decisionReason ? ` 사유: ${payload.decisionReason}` : ''
              }`,
            })
          }
        }
      }
      // PR-H3: 본인 요청 created SSE (BE 가 발행 시) — latestEditRequest 동기화.
      if (evt.event === 'slip:edit-request:created') {
        const payload = evt.data as Partial<SlipEditRequest> | null
        if (payload && payload.slipId === id) {
          setLatestEditRequest(payload as SlipEditRequest)
        }
      }
    })
    return () => {
      ctrl.abort()
    }
  }, [id, queryClient])

  // PR-H1: 코멘트 등록 mutation — optimistic add 후 응답 시 cache 갱신
  const addCommentMutation = useMutation({
    mutationFn: (body: string) => addSlipComment(id, { body }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: ['slipComments', id] })
      const previous = queryClient.getQueryData<SlipComment[]>([
        'slipComments',
        id,
      ])
      const optimistic: SlipComment = {
        id: `optimistic-${Date.now()}`,
        authorId: '',
        authorName:
          useSessionStore.getState().auth?.fullName ?? '나',
        body,
        createdAt: new Date().toISOString(),
      }
      queryClient.setQueryData<SlipComment[]>(
        ['slipComments', id],
        [...(previous ?? []), optimistic],
      )
      return { previous }
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['slipComments', id], ctx.previous)
      }
      alert('코멘트 등록에 실패했습니다.')
    },
    onSuccess: () => {
      setCommentInput('')
      void queryClient.invalidateQueries({ queryKey: ['slipComments', id] })
    },
  })

  // PR-H3: CONFIRMED 단계 수정/삭제 요청 mutation. 성공 시 dialog 닫기 + latestEditRequest 갱신.
  const editRequestMutation = useMutation({
    mutationFn: (vars: { type: SlipEditRequestType; reason: string }) =>
      createSlipEditRequest(id, { type: vars.type, reason: vars.reason }),
    onSuccess: (created) => {
      setEditRequestDialogType(null)
      setLatestEditRequest(created)
      // BE 가 본 요청 결정 시 SSE slip:edit-request:decided 발행 → SlipDetail 의 status 도 변경 가능.
      // 즉시 detail/list cache 도 한번 invalidate 해 둠 (정합성 안전망).
      void queryClient.invalidateQueries({ queryKey: ['slip', id] })
    },
  })

  // Slice A: AppHeader 동적 화면명 — slipNo bracket meta (Designer wireframes.md § 1.3)
  usePageTitle(
    isOutbound ? '출고전표 상세' : '입고전표 상세',
    detailQuery.data?.slipNo,
  )

  const transitionMutation = useMutation({
    mutationFn: (vars: { action: SlipTransitionAction; reason?: string }) =>
      transitionSlip(id, vars.action, vars.reason ? { reason: vars.reason } : undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['slip', id] })
      void queryClient.invalidateQueries({ queryKey: ['slips'] })
      setRejectReason('')
    },
  })

  /** 라인 제거 (BE: DELETE /slips/{id}/lines/{lineId}). DRAFT/SAVED 만 허용. */
  const removeLineMutation = useMutation({
    mutationFn: (lineId: string) => removeLine(id, lineId),
    onSuccess: () => {
      setSelectedLineId(null)
      void queryClient.invalidateQueries({ queryKey: ['slip', id] })
    },
  })

  /** link-dispatch-slice: 기사 정보 부분 갱신 (PATCH /slips/{id}/driver). DRAFT/SAVED 만 허용. */
  const driverMutation = useMutation({
    mutationFn: () =>
      updateSlipDriver(id, {
        driverName: draftDriverName.trim() || null,
        driverPhone: draftDriverPhone || null,
      }),
    onSuccess: () => {
      setEditingDriver(false)
      void queryClient.invalidateQueries({ queryKey: ['slip', id] })
      void queryClient.invalidateQueries({ queryKey: ['delivery-batches'] })
    },
  })

  /**
   * signature-slice-C 신규: 서명 무효화 (DELETE /slips/{id}/signature?reason=...).
   * MASTER only — BE 가 audit 로그 강제 기록. 200 응답 시 SlipDetail 재조회로 signature* 필드 null 화.
   */
  const invalidateSignatureMutation = useMutation({
    mutationFn: (reason: string) => invalidateSignature(id, reason),
    onSuccess: () => {
      setInvalidateOpen(false)
      setInvalidateReason('')
      void queryClient.invalidateQueries({ queryKey: ['slip', id] })
      void queryClient.invalidateQueries({ queryKey: ['slips'] })
    },
  })

  /** 전표 복사 (DRAFT 신규 생성). 성공 시 신규 전표 상세로 이동. */
  const duplicateMutation = useMutation({
    mutationFn: () => {
      if (!detailQuery.data) throw new Error('전표 데이터 없음')
      return duplicateSlip(detailQuery.data)
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['slips'] })
      const target = created.slipType === 'OUTBOUND' ? 'sales' : 'purchases'
      navigate(`/${target}/${created.id}`)
    },
  })

  /**
   * PR-H2: 특정 revision 으로 복원 — 200 응답 시 audit-logs / 전표 본체 cache invalidate.
   * 사용자에게 confirm dialog 후 실행 (실수 방지).
   */
  const revertMutation = useMutation({
    mutationFn: (revisionNo: number) => revertToRevision(id, revisionNo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['slip', id] })
      void queryClient.invalidateQueries({ queryKey: ['slipAuditLogs', id] })
    },
    onError: () => {
      alert('복원에 실패했습니다.')
    },
  })

  if (!id) return null

  if (detailQuery.isLoading) {
    return <p>불러오는 중...</p>
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="error-banner" role="alert">
        전표를 불러오지 못했습니다.
      </div>
    )
  }

  const slip = detailQuery.data
  const possibleActions = actionsForStatus(slip.status, mode)

  /**
   * PR-H3: 창고/관리자 수락이 필요한 단계 (LOCKED_REQUIRES_APPROVAL).
   * BE {@code SlipEditRequestService.LOCKED_REQUIRES_APPROVAL} 와 정확히 일치 —
   * CONFIRMED/ACCEPTED/PROCESSING. "수정/삭제 요청" UI 노출 + 요청 후 창고 수락 필요.
   * 사용자 명시 정책 정합 (QA Major 회귀 가드).
   */
  const isApprovalRequired
    = slip.status === 'CONFIRMED'
    || slip.status === 'ACCEPTED'
    || slip.status === 'PROCESSING'

  /**
   * PR-H3: 변경 자체를 차단해야 하는 단계 (FULLY_LOCKED + 종료 단계).
   * BE {@code SlipEditRequestService.FULLY_LOCKED} (INSPECTING/SHIPPING/DELIVERED) 정합.
   * COMPLETED 는 검수 직후 ship 대기 단계로 본 FE 에서 동일 차단 처리 (기존 정책 보존).
   * 사용자에게 "현재 변경 불가" 안내 + 모든 액션 disabled.
   */
  const isLocked
    = slip.status === 'INSPECTING'
    || slip.status === 'COMPLETED'
    || slip.status === 'SHIPPING'
    || slip.status === 'DELIVERED'

  /**
   * PR-H3: 수정/삭제 요청 권한 (작성자 그룹 — SALES/MANAGER/MASTER).
   * MANAGER/MASTER 도 본인 작성/소속 전표에 대해 사용 가능.
   */
  const canRequestEdit = !!role
    && (SLIP_EDIT_REQUEST_AUTHOR_ROLES as readonly string[]).includes(role)

  /**
   * PR-H3: 현재 PENDING 본인 요청이 있는지.
   * 두 번째 요청은 BE 가 막거나 사용자에게 "이미 요청 진행 중" 안내.
   */
  const hasPendingRequest = !!latestEditRequest
    && latestEditRequest.status === 'PENDING'

  const errorMessage = (() => {
    if (!transitionMutation.isError) return null
    const err = transitionMutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '전이에 실패했습니다.'
    }
    return '알 수 없는 오류'
  })()

  const handleTransition = (action: SlipTransitionAction) => {
    if (action === 'reject') {
      const reason = rejectReason.trim()
      if (!reason) {
        alert('반려 사유를 입력하세요.')
        return
      }
      transitionMutation.mutate({ action, reason })
    } else {
      transitionMutation.mutate({ action })
    }
  }

  /** 라인 편집은 DRAFT/SAVED 만 허용 (BE 가드와 동일). */
  const linesEditable = slip.status === 'DRAFT' || slip.status === 'SAVED'
  const selectedLine = selectedLineId
    ? slip.lines.find((l) => l.id === selectedLineId) ?? null
    : null

  /** 선택된 라인의 product 재고를 batch endpoint 로 조회 후 alert. */
  const handleStockQuery = async () => {
    if (!selectedLine) return
    try {
      const res = await fetchStockBalanceBatch([selectedLine.productId])
      const row = res.rows[0]
      if (!row) {
        alert(`${selectedLine.modelName ?? '-'} 재고 정보 없음`)
        return
      }
      const perWh = Object.entries(row.perWarehouse)
        .map(([code, qty]) => `${code}: ${qty == null ? '가상' : qty.toLocaleString()}`)
        .join('\n')
      alert(`[재고 조회] ${row.modelName}\n총합: ${row.total.toLocaleString()}\n\n${perWh}`)
    } catch {
      alert('재고 조회 실패')
    }
  }

  /** 행 삭제 — 경고창 후 BE DELETE. */
  const handleRemoveLine = () => {
    if (!selectedLine) return
    if (!linesEditable) {
      alert(`라인 편집은 작성 중/저장 단계에서만 가능합니다. (현재: ${slip.status})`)
      return
    }
    if (!window.confirm(`[${selectedLine.modelName ?? '-'}] 라인을 삭제하시겠습니까?`)) {
      return
    }
    removeLineMutation.mutate(selectedLine.id)
  }

  /** 첫 가능한 정상 transition (reject/cancel 제외) — 하단 "완료" 버튼이 호출. */
  const nextPrimaryAction
    = possibleActions.find((a) => a !== 'reject' && a !== 'cancel') ?? null

  /** 하단 "전표 복사" — 사용자 확인 후 신규 DRAFT 생성. */
  const handleDuplicate = () => {
    if (!window.confirm('현재 전표를 복사하여 새 작성중 전표를 생성합니다. 진행할까요?')) {
      return
    }
    duplicateMutation.mutate()
  }

  /** 하단 "삭제" — 경고창 후 cancel transition (BE soft-delete). */
  const handleDeleteSlip = () => {
    if (!possibleActions.includes('cancel')) {
      alert(`현재 단계(${slip.status})에서는 삭제(취소)할 수 없습니다.`)
      return
    }
    if (!window.confirm('정말로 이 전표를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 전표가 취소 상태로 변경됩니다.')) {
      return
    }
    transitionMutation.mutate({ action: 'cancel' })
  }

  /** 하단 "완료" — 다음 정상 단계 transition 실행. */
  const handleAdvanceStage = () => {
    if (!nextPrimaryAction) return
    transitionMutation.mutate({ action: nextPrimaryAction })
  }

  // 분기 사유 (REJECTED 시 BE 가 응답에 reason 을 별도 필드로 줄 수 있음 — Slice A 는 memo 사용)
  const branchReason
    = slip.status === 'REJECTED' || slip.status === 'CANCELED'
      ? slip.memo ?? undefined
      : undefined

  /**
   * PR-H2: audit logs 를 필드별로 group 후 AuditOverlay 의 history 형식으로 매핑.
   * - field 키 → AuditLogEntry[] (revisionNo 내림차순 정렬은 AuditOverlay 가 담당)
   * - actorId 는 색상 hash 입력 전용, 화면 노출 X.
   */
  const auditLogs: SlipAuditLogEntry[] = Array.isArray(auditLogsQuery.data) ? auditLogsQuery.data : []
  const auditByField: Record<string, AuditLogEntry[]> = auditLogs.reduce(
    (acc, log) => {
      const list = acc[log.field] ?? []
      list.push({
        revisionNo: log.revisionNo,
        beforeValue: log.beforeValue,
        actorId: log.actorId,
        actorName: log.actorName,
        changedAt: log.changedAt,
      })
      acc[log.field] = list
      return acc
    },
    {} as Record<string, AuditLogEntry[]>,
  )

  /**
   * PR-H2: 수정 횟수 = distinct revisionNo 개수.
   * BE 가 한 revision 에 여러 필드 변경을 묶어 보낼 수 있으므로 set 으로 dedupe.
   */
  const revisionCount = new Set(auditLogs.map((l) => l.revisionNo)).size

  /**
   * PR-H2: revert dropdown 후보 — distinct revisionNo (내림차순).
   * 가장 최근 revision 을 제외 (이미 현재 상태) — slice(1) 시 의미 모호 → 모두 노출 후 사용자 선택.
   */
  const revertCandidates = Array.from(
    new Set(auditLogs.map((l) => l.revisionNo)),
  ).sort((a, b) => b - a)

  /** revert 핸들러 — confirm 후 mutation. */
  const handleRevert = (revisionNo: number) => {
    if (
      !window.confirm(
        `이 전표를 revision #${revisionNo} 시점으로 복원하시겠습니까?\n\n현재 값은 새 revision 으로 보존됩니다.`,
      )
    ) {
      return
    }
    revertMutation.mutate(revisionNo)
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <SlipNumberDisplay slipDate={slip.slipDate} seqNo={slip.seqNo} size="lg" />
          {/* PR-H2: 수정 횟수 표시 — auditLogs distinct revisionNo 개수 */}
          <span
            data-testid="slip-detail-revision-count"
            style={{
              fontSize: 13,
              color: 'var(--color-neutral-600)',
              padding: '2px 8px',
              borderRadius: 12,
              background: 'var(--color-neutral-100)',
            }}
            title={
              auditLogsQuery.isError
                ? '수정 이력을 불러오지 못했습니다'
                : '전표 변경 누적 횟수'
            }
          >
            수정 {revisionCount}회
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* PR-H2: 복원 dropdown — revertCandidates 가 있을 때만 표시 */}
          {revertCandidates.length > 0 ? (
            <select
              data-testid="slip-detail-revert-select"
              defaultValue=""
              disabled={revertMutation.isPending}
              onChange={(e) => {
                const v = e.target.value
                if (!v) return
                handleRevert(Number(v))
                e.target.value = '' // reset selection
              }}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid var(--color-neutral-300)',
                fontSize: 13,
              }}
              aria-label="이전 revision 으로 복원"
            >
              <option value="">복원...</option>
              {revertCandidates.map((rev) => (
                <option
                  key={rev}
                  value={rev}
                  data-testid={`slip-detail-revert-button-${rev}`}
                >
                  revision #{rev} 으로 복원
                </option>
              ))}
            </select>
          ) : null}
          {isOutbound ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/sales/${id}/print/invoice`)}
              >
                거래명세서
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/sales/${id}/print/dispatch`)}
              >
                작업지시서
              </Button>
            </>
          ) : null}
          <Button variant="ghost" onClick={() => navigate(listPath)}>
            목록으로
          </Button>
        </div>
      </div>

      {/*
        Slice A: 전표 진행 단계 ProgressBar (Designer wireframes.md § 2 + 5)
        피드백 #1 ("라이프사이클" 모호) 해결.
      */}
      <div style={{ marginBottom: 16 }}>
        <ProgressBar currentStatus={slip.status} branchReason={branchReason} />
      </div>

      {/*
        PR-H3: SSE 결정 toast — 수락/거절 결과 안내 (사용자 닫기 가능).
      */}
      {decisionToast ? (
        <div
          role="status"
          data-testid="slip-detail-edit-request-decision-toast"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 12px',
            marginBottom: 12,
            borderRadius: 6,
            border: '1px solid',
            borderColor:
              decisionToast.kind === 'success'
                ? 'var(--color-success-300, #6EE7B7)'
                : 'var(--color-danger-300, #FCA5A5)',
            background:
              decisionToast.kind === 'success'
                ? 'var(--color-success-50, #ECFDF5)'
                : 'var(--color-danger-50, #FEF2F2)',
            color:
              decisionToast.kind === 'success'
                ? 'var(--color-success-800, #065F46)'
                : 'var(--color-danger-800, #991B1B)',
            fontSize: 13,
          }}
        >
          <span>{decisionToast.text}</span>
          <button
            type="button"
            onClick={() => setDecisionToast(null)}
            aria-label="알림 닫기"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              color: 'inherit',
            }}
          >
            ×
          </button>
        </div>
      ) : null}

      {/*
        PR-H3: 단계별 안내 + 수정/삭제 요청 버튼.
        - DRAFT/SAVED/SENT: 본인 직접 수정/삭제 가능 → 별도 안내 없음
        - CONFIRMED/ACCEPTED/PROCESSING: 직접 변경 차단, "수정/삭제 요청" 버튼 노출 (창고 수락 필요)
        - INSPECTING/COMPLETED/SHIPPING/DELIVERED: 모든 변경 차단 안내
      */}
      {isApprovalRequired && canRequestEdit ? (
        <Card
          padding={4}
          shadow="sm"
          style={{ marginBottom: 16 }}
          data-testid="slip-detail-edit-request-banner"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14 }}>창고 인계 후 — 수락 필요</strong>
              <span style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>
                직접 수정/삭제가 잠겼습니다. 창고 직원에게 처리를 요청할 수 있습니다.
              </span>
              {latestEditRequest ? (
                <Badge
                  variant={
                    latestEditRequest.status === 'PENDING'
                      ? 'warning'
                      : latestEditRequest.status === 'APPROVED'
                        ? 'success'
                        : 'danger'
                  }
                  data-testid="slip-detail-edit-request-status-badge"
                >
                  요청 {SLIP_EDIT_REQUEST_STATUS_LABEL[latestEditRequest.status]}
                </Badge>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="secondary"
                size="sm"
                disabled={hasPendingRequest || editRequestMutation.isPending}
                onClick={() => setEditRequestDialogType('EDIT')}
                title={
                  hasPendingRequest
                    ? '이미 처리 대기 중인 요청이 있습니다.'
                    : undefined
                }
                data-testid="slip-detail-edit-request-button"
              >
                수정 요청
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={hasPendingRequest || editRequestMutation.isPending}
                onClick={() => setEditRequestDialogType('DELETE')}
                title={
                  hasPendingRequest
                    ? '이미 처리 대기 중인 요청이 있습니다.'
                    : undefined
                }
                data-testid="slip-detail-delete-request-button"
              >
                삭제 요청
              </Button>
            </div>
          </div>
          {/* PENDING 요청의 사유 미리보기 */}
          {hasPendingRequest && latestEditRequest ? (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                borderRadius: 4,
                background: 'var(--color-neutral-50, #F9FAFB)',
                fontSize: 12,
                color: 'var(--color-neutral-700)',
                whiteSpace: 'pre-wrap',
              }}
            >
              요청 사유: {latestEditRequest.reason}
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* PR-H3: 변경 자체 차단 단계 안내 — 검수 ~ 배송 완료. */}
      {isLocked ? (
        <div
          role="alert"
          data-testid="slip-detail-locked-banner"
          style={{
            padding: '10px 12px',
            marginBottom: 12,
            borderRadius: 6,
            border: '1px solid var(--color-warning-300, #FCD34D)',
            background: 'var(--color-warning-50, #FFFBEB)',
            color: 'var(--color-warning-800, #92400E)',
            fontSize: 13,
          }}
        >
          현재 단계({slip.status})에서는 전표 변경이 차단됩니다. 처리가 끝나면 확정 후 수정/삭제 요청이 가능합니다.
        </div>
      ) : null}

      <Card padding={4} shadow="sm">
        <div className="detail-grid">
          <div>
            <span className="detail-label">거래처</span>
            <span className="detail-value">{slip.partnerName ?? '-'}</span>
          </div>
          <div>
            <span className="detail-label">일자</span>
            <span className="detail-value">{slip.slipDate}</span>
          </div>
          <div>
            <span className="detail-label">배송 태그</span>
            <span className="detail-value">{slip.deliveryTag ?? '-'}</span>
          </div>
          <div data-testid="slip-detail-audit-overlay-memo">
            <span className="detail-label">메모</span>
            <span className="detail-value">
              <AuditOverlay
                field="memo"
                currentValue={slip.memo}
                history={auditByField['memo'] ?? []}
              />
            </span>
          </div>
          {/* PR-H2: 배송지 audit overlay (출고전표만 의미 있음) */}
          {isOutbound ? (
            <div data-testid="slip-detail-audit-overlay-shippingAddress">
              <span className="detail-label">배송지</span>
              <span className="detail-value">
                <AuditOverlay
                  field="shippingAddress"
                  currentValue={slip.shippingAddress}
                  history={auditByField['shippingAddress'] ?? []}
                />
              </span>
            </div>
          ) : null}
        </div>
      </Card>

      {/*
        V20 신규 필드 표시 카드 — 배송주소 / 감리주소 / 프로젝트명 / 인수자 번호 / 입금예정일
        + businessNumber (거래처 자동 표시) + printed (인쇄 여부).
        빈값(null/undefined) 은 "—" 로 표시. UUID 비공개 가드 준수.
      */}
      <Card padding={4} shadow="sm" style={{ marginTop: 16 }}>
        <h4 style={{ marginTop: 0 }}>배송 · 정산 정보 (V20)</h4>
        <div className="detail-grid">
          <div data-testid="slip-detail-delivery-address">
            <span className="detail-label">배송주소</span>
            <span className="detail-value">{slip.deliveryAddress ?? '—'}</span>
          </div>
          <div data-testid="slip-detail-supervision-address">
            <span className="detail-label">감리주소</span>
            <span className="detail-value">{slip.supervisionAddress ?? '—'}</span>
          </div>
          <div data-testid="slip-detail-project-name">
            <span className="detail-label">프로젝트명</span>
            <span className="detail-value">{slip.projectName ?? '—'}</span>
          </div>
          <div data-testid="slip-detail-recipient-phone">
            <span className="detail-label">인수자 번호</span>
            <span className="detail-value">{slip.recipientPhone ?? '—'}</span>
          </div>
          <div data-testid="slip-detail-payment-due-date">
            <span className="detail-label">입금예정일</span>
            <span className="detail-value">{slip.paymentDueDate ?? '—'}</span>
          </div>
          <div data-testid="slip-detail-business-number">
            <span className="detail-label">사업자번호</span>
            <span className="detail-value">{slip.businessNumber ?? '—'}</span>
          </div>
          <div data-testid="slip-detail-printed">
            <span className="detail-label">인쇄 여부</span>
            <span className="detail-value">
              {slip.printed == null ? '—' : slip.printed ? '인쇄됨' : '미인쇄'}
            </span>
          </div>
        </div>
      </Card>

      {/*
        link-dispatch-slice 신규: 기사 정보 카드 (driverName + driverPhone)
        DRAFT/SAVED 단계만 [편집] 가능 — BE 가드와 동일 (PATCH /slips/{id}/driver).
        OUTBOUND 만 표시 (입고전표는 거래처 측 기사 정보 무관).
      */}
      {isOutbound ? (
        <Card padding={4} shadow="sm" style={{ marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <h4 style={{ margin: 0 }}>기사 정보 (배송)</h4>
            {!editingDriver && linesEditable ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraftDriverName(slip.driverName ?? '')
                  setDraftDriverPhone(slip.driverPhone ?? '')
                  setEditingDriver(true)
                }}
              >
                편집
              </Button>
            ) : null}
          </div>
          {editingDriver ? (
            <div className="driver-edit-grid">
              <label className="driver-edit-field">
                <span className="detail-label">기사명</span>
                <input
                  type="text"
                  value={draftDriverName}
                  onChange={(e) => setDraftDriverName(e.target.value)}
                  maxLength={50}
                  placeholder="예: 홍길동"
                  className="sfp-input"
                />
              </label>
              <PhoneInput
                label="기사 연락처"
                value={draftDriverPhone}
                onChange={setDraftDriverPhone}
                error={
                  draftDriverPhone && !KOREAN_MOBILE_PHONE_PATTERN.test(draftDriverPhone)
                    ? '올바른 휴대폰 번호 형식이 아닙니다'
                    : undefined
                }
              />
              <div className="driver-edit-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingDriver(false)}
                  disabled={driverMutation.isPending}
                >
                  취소
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={driverMutation.isPending}
                  disabled={
                    !!draftDriverPhone
                    && !KOREAN_MOBILE_PHONE_PATTERN.test(draftDriverPhone)
                  }
                  onClick={() => driverMutation.mutate()}
                >
                  저장
                </Button>
              </div>
            </div>
          ) : (
            <div className="detail-grid">
              <div>
                <span className="detail-label">기사명</span>
                <span className="detail-value">{slip.driverName ?? '-'}</span>
              </div>
              <div>
                <span className="detail-label">기사 연락처</span>
                <span className="detail-value">{slip.driverPhone ?? '-'}</span>
              </div>
            </div>
          )}
          {driverMutation.isError ? (
            <div className="error-banner" role="alert" style={{ marginTop: 8 }}>
              기사 정보 저장에 실패했습니다.
            </div>
          ) : null}
        </Card>
      ) : null}

      <h4 style={{ marginTop: 24 }}>전표 라인</h4>

      {/*
        선택된 라인 액션 툴바 — 좌측 넘버링 클릭으로 행 선택 시 표시.
        재고조회 (모든 단계) / 행 추가·삭제·순서수정 (DRAFT/SAVED 만, BE 가드와 동일).
      */}
      {selectedLine ? (
        <div className="slip-line-toolbar" role="toolbar" aria-label="선택 라인 액션">
          <span className="slip-line-toolbar-label">
            선택: <strong>#{slip.lines.findIndex((l) => l.id === selectedLine.id) + 1}</strong>{' '}
            {selectedLine.modelName ?? '-'}
          </span>
          <Button size="sm" variant="secondary" onClick={() => void handleStockQuery()}>
            재고 조회
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!linesEditable}
            onClick={() => alert('행 추가 — SlipFormPage 에서 편집해주세요 (DRAFT/SAVED 만 BE 허용).')}
            title={linesEditable ? undefined : '작성 중/저장 단계에서만 가능'}
          >
            행 추가
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!linesEditable}
            onClick={() => alert('행 순서 수정 — SlipFormPage 의 drag-and-drop 사용해주세요.')}
            title={linesEditable ? undefined : '작성 중/저장 단계에서만 가능'}
          >
            순서 수정
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!linesEditable || removeLineMutation.isPending}
            onClick={handleRemoveLine}
            title={linesEditable ? undefined : '작성 중/저장 단계에서만 가능'}
          >
            행 삭제
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedLineId(null)}>
            선택 해제
          </Button>
        </div>
      ) : (
        <p className="slip-line-hint">
          좌측 번호를 클릭하면 해당 라인을 선택할 수 있습니다 (재고 조회 / 순서 수정 / 추가 / 삭제).
        </p>
      )}

      <table className="slip-line-table">
        <thead>
          <tr>
            <th className="col-no">#</th>
            <th className="col-model">모델명</th>
            <th className="col-product">품목명</th>
            <th className="col-spec">규격</th>
            <th className="col-qty">수량</th>
            <th className="col-price">단가</th>
            <th className="col-total">합계</th>
          </tr>
        </thead>
        <tbody>
          {slip.lines.length === 0 ? (
            <tr>
              <td colSpan={7} className="slip-line-empty">라인이 없습니다.</td>
            </tr>
          ) : (
            slip.lines.map((l, idx) => {
              const selected = selectedLineId === l.id
              return (
                <tr key={l.id} className={selected ? 'is-selected' : undefined}>
                  <td className="col-no">
                    <button
                      type="button"
                      className={`slip-line-no-btn${selected ? ' is-selected' : ''}`}
                      aria-pressed={selected}
                      aria-label={`라인 ${idx + 1} 선택`}
                      onClick={() => setSelectedLineId(selected ? null : l.id)}
                    >
                      {idx + 1}
                    </button>
                  </td>
                  <td className="col-model">{l.modelName ?? '-'}</td>
                  <td className="col-product">{l.productName ?? '-'}</td>
                  <td className="col-spec">{l.specification ?? '-'}</td>
                  <td className="col-qty">{l.quantity.toLocaleString()}</td>
                  <td className="col-price">{Number(l.unitPrice).toLocaleString()}</td>
                  <td className="col-total">{Number(l.lineTotal).toLocaleString()}</td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>

      {/*
        Slice A: 결재 정보 카드 — 출고인/검수인 자동 채움 (Designer wireframes.md § 5 + ux-flow.md § 2)
        피드백 #9 해결.
      */}
      <Card padding={4} shadow="sm" style={{ marginTop: 24 }}>
        <h4 style={{ marginTop: 0 }}>결재 정보</h4>
        <div className="detail-grid">
          <div>
            <span className="detail-label">출고인</span>
            <span className="detail-value">
              {slip.dispatcher?.fullName
                ? `${slip.dispatcher.fullName} · ${formatHHmm(slip.dispatcher.signedAt)}`
                : '미수락'}
            </span>
          </div>
          <div>
            <span className="detail-label">검수인</span>
            <span className="detail-value">
              {slip.inspector?.fullName
                ? `${slip.inspector.fullName} · ${formatHHmm(slip.inspector.signedAt)}`
                : '미검수'}
            </span>
          </div>
          <div>
            <span className="detail-label">담당부서</span>
            <span className="detail-value">{slip.ownerDepartment ?? '-'}</span>
          </div>
          <div>
            <span className="detail-label">담당자</span>
            <span className="detail-value">{slip.ownerFullName ?? '-'}</span>
          </div>
        </div>
      </Card>

      {/*
        PR-H1 FE-1: 코멘트 영역 (Card) — useQuery 백필 + SSE 실시간 업데이트.
        UUID 비공개 가드: id/authorId 화면 노출 금지. authorName + body + createdAt 만 표시.
      */}
      <Card padding={4} shadow="sm" style={{ marginTop: 24 }}>
        <h4 style={{ marginTop: 0 }}>코멘트</h4>
        <div
          data-testid="slip-detail-comment-list"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            maxHeight: 320,
            overflowY: 'auto',
            marginBottom: 12,
          }}
        >
          {commentsQuery.isLoading ? (
            <p style={{ margin: 0, color: 'var(--color-neutral-500)' }}>
              코멘트를 불러오는 중...
            </p>
          ) : commentsQuery.isError ? (
            <p
              role="alert"
              style={{ margin: 0, color: 'var(--color-danger-600)' }}
            >
              코멘트를 불러오지 못했습니다.
            </p>
          ) : (Array.isArray(commentsQuery.data) ? commentsQuery.data : []).length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-neutral-500)' }}>
              아직 코멘트가 없습니다.
            </p>
          ) : (
            (Array.isArray(commentsQuery.data) ? commentsQuery.data : []).map((c) => (
              <div
                key={c.id}
                data-testid={`slip-detail-comment-row-${c.id}`}
                style={{
                  borderBottom: '1px solid var(--color-neutral-200)',
                  paddingBottom: 6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    color: 'var(--color-neutral-600)',
                  }}
                >
                  <strong style={{ color: 'var(--color-neutral-900)' }}>
                    {c.authorName}
                  </strong>
                  <span>{c.createdAt.slice(0, 16).replace('T', ' ')}</span>
                </div>
                <div style={{ fontSize: 14, marginTop: 2, whiteSpace: 'pre-wrap' }}>
                  {c.body}
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            data-testid="slip-detail-comment-input"
            type="text"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter'
                && !e.nativeEvent.isComposing
                && commentInput.trim().length > 0
                && !addCommentMutation.isPending
              ) {
                addCommentMutation.mutate(commentInput.trim())
              }
            }}
            placeholder="코멘트 입력..."
            maxLength={1000}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--color-neutral-300)',
              fontSize: 14,
            }}
          />
          <Button
            data-testid="slip-detail-comment-submit"
            variant="primary"
            size="sm"
            disabled={
              commentInput.trim().length === 0 || addCommentMutation.isPending
            }
            loading={addCommentMutation.isPending}
            onClick={() => addCommentMutation.mutate(commentInput.trim())}
          >
            전송
          </Button>
        </div>
      </Card>

      {/*
        signature-slice-C 신규: 전자서명 정보 카드 (Designer wireframes.md §3).
        - signedAt 있을 때 SignatureViewer + 메타 + 공유링크 표시
        - MASTER 권한일 때만 [무효화] 버튼 노출 (Designer §3.4 권한 매트릭스)
        - 미서명 시 안내 메시지 (§3.2)
      */}
      <Card padding={4} shadow="sm" style={{ marginTop: 24 }}>
        <h4 style={{ marginTop: 0 }}>전자서명 정보</h4>
        {slip.signedAt && slip.signerName && slip.signaturePng ? (
          <>
            <SignatureViewer
              signaturePngBase64={slip.signaturePng}
              signerName={slip.signerName}
              signedAt={slip.signedAt}
              signatureHash={slip.signatureHash ?? null}
              size="desktop"
            />
            <div className="slip-signature-card-meta">
              <div>
                <span className="label">채널:</span>
                {slip.signatureChannel ?? 'MOBILE_CANVAS'}
              </div>
              {slip.signatureShareToken ? (
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                >
                  <span className="label">공유링크:</span>
                  <code
                    style={{
                      fontSize: 12,
                      background: 'var(--color-neutral-100)',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    /share/{slip.signatureShareToken.slice(0, 12)}…
                  </code>
                  <CopyButton
                    text={`${window.location.origin}${window.location.pathname}#/mobile/share/${slip.signatureShareToken}`}
                    label="복사"
                  />
                </div>
              ) : null}
              {slip.signatureShareExpiresAt ? (
                <div>
                  <span className="label">만료:</span>
                  {slip.signatureShareExpiresAt.slice(0, 10)}
                </div>
              ) : null}
            </div>
            {role === 'MASTER' ? (
              <div className="slip-signature-card-actions">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setInvalidateReason('')
                    setInvalidateOpen(true)
                  }}
                  aria-label="서명 무효화 (MASTER 권한)"
                >
                  서명 무효화
                </Button>
                <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                  무효화 시 audit 로그에 영구 기록됩니다.
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <p className="slip-signature-empty">
            아직 서명되지 않았습니다.
            <br />
            배송기사가 모바일 페이지에서 인수자 서명을 받으면 표시됩니다.
          </p>
        )}
      </Card>

      {/*
        signature-slice-C 신규: 무효화 confirm modal (MASTER only).
        Designer wireframes.md §3.3 — reason ≥10자 검증 + textarea + 카운터.
      */}
      <Modal
        open={invalidateOpen}
        onClose={() => {
          if (!invalidateSignatureMutation.isPending) {
            setInvalidateOpen(false)
          }
        }}
        title="서명 무효화"
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setInvalidateOpen(false)}
              disabled={invalidateSignatureMutation.isPending}
            >
              취소
            </Button>
            <Button
              variant="danger"
              loading={invalidateSignatureMutation.isPending}
              disabled={invalidateReason.trim().length < 10}
              onClick={() =>
                invalidateSignatureMutation.mutate(invalidateReason.trim())
              }
            >
              무효화
            </Button>
          </>
        }
      >
        <div className="slip-signature-invalidate-modal-body">
          <p style={{ margin: 0 }}>다음 서명을 무효화합니다.</p>
          {slip.signerName ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              <li>서명자: {slip.signerName}</li>
              <li>시각: {slip.signedAt?.slice(0, 16).replace('T', ' ') ?? '-'}</li>
            </ul>
          ) : null}
          <label htmlFor="invalidate-reason" style={{ fontSize: 13, fontWeight: 600 }}>
            사유 (필수, 최소 10자)
          </label>
          <textarea
            id="invalidate-reason"
            value={invalidateReason}
            onChange={(e) => setInvalidateReason(e.target.value.slice(0, 500))}
            maxLength={500}
            placeholder="무효화 사유를 입력해주세요 (감사 로그에 기록됩니다)"
          />
          <div className="reason-counter">{invalidateReason.length}/500</div>
          {invalidateSignatureMutation.isError ? (
            <div className="error-banner" role="alert">
              무효화에 실패했습니다.
            </div>
          ) : null}
        </div>
      </Modal>

      {/*
        반려 사유 입력 (필요 시) — 반려 가능 단계 (SENT/ACCEPTED) 에서 표시.
      */}
      {possibleActions.includes('reject') ? (
        <Card padding={4} shadow="sm" style={{ marginTop: 24 }}>
          <h4 style={{ marginTop: 0 }}>반려 사유</h4>
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="반려 사유 (반려 시 필수, 최대 500자)"
            maxLength={500}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--color-neutral-300)',
              fontSize: 14,
              width: '100%',
            }}
          />
          <div style={{ marginTop: 8 }}>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canTransitionSlip('reject', role) || transitionMutation.isPending}
              onClick={() => handleTransition('reject')}
            >
              {ACTION_LABEL['reject']}
              {!canTransitionSlip('reject', role) ? ' (권한 부족)' : ''}
            </Button>
          </div>
        </Card>
      ) : null}

      {/*
        하단 액션 버튼 (사용자 명시) — 전표 복사 / 삭제 (경고창 필수) / 완료 (다음 단계).
      */}
      <div className="slip-detail-footer-actions" role="toolbar" aria-label="전표 액션">
        <Button
          variant="secondary"
          disabled={duplicateMutation.isPending}
          onClick={handleDuplicate}
        >
          전표 복사
        </Button>
        <Button
          variant="ghost"
          disabled={!possibleActions.includes('cancel') || transitionMutation.isPending}
          onClick={handleDeleteSlip}
          title={possibleActions.includes('cancel') ? undefined : '현재 단계에서는 삭제(취소) 불가'}
        >
          삭제
        </Button>
        <Button
          variant="primary"
          disabled={
            !nextPrimaryAction
            || !canTransitionSlip(nextPrimaryAction, role)
            || transitionMutation.isPending
          }
          onClick={handleAdvanceStage}
          title={
            nextPrimaryAction
              ? `다음 단계: ${ACTION_LABEL[nextPrimaryAction]}`
              : '현재 단계에서 진행 가능한 다음 단계가 없습니다'
          }
        >
          {nextPrimaryAction ? `완료 (${ACTION_LABEL[nextPrimaryAction]})` : '완료'}
        </Button>
      </div>

      {errorMessage ? (
        <div className="error-banner" role="alert" style={{ marginTop: 12 }}>
          {errorMessage}
        </div>
      ) : null}

      {/*
        PR-H3: CONFIRMED 전표 수정/삭제 요청 사유 입력 다이얼로그.
        type=null 이면 미오픈. mutation 진행 중이면 백드롭/Esc 차단 (이중 호출 방지).
      */}
      <SlipEditRequestDialog
        open={editRequestDialogType !== null}
        onClose={() => setEditRequestDialogType(null)}
        type={(editRequestDialogType ?? 'EDIT') as SlipEditRequestUiType}
        slipNo={slip.slipNo}
        submitting={editRequestMutation.isPending}
        errorMessage={
          editRequestMutation.isError
            ? (() => {
                const err = editRequestMutation.error
                if (axios.isAxiosError(err)) {
                  const data = err.response?.data as { message?: string } | undefined
                  return data?.message ?? '요청 전송에 실패했습니다.'
                }
                return '요청 전송에 실패했습니다.'
              })()
            : null
        }
        onSubmit={(reason) => {
          if (editRequestDialogType === null) return
          editRequestMutation.mutate({
            type: editRequestDialogType,
            reason,
          })
        }}
      />
    </>
  )
}
