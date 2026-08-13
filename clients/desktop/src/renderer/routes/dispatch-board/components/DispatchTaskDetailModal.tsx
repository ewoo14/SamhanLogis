/**
 * DispatchTaskDetailModal — 배차 메뉴의 DispatchTask 상세 modal (Phase C FE-F1).
 *
 * <p>spec § 6.1 / plan FE F1.
 *
 * 진입 트리거:
 *  - VehicleGroupColumn 헤더의 [상세 보기] 버튼 또는 상태 배지 클릭 (DISPATCHED 이후).
 *
 * 본 모달의 책임:
 *  1) DispatchTask 요약 노출 — taskCode / dispatchDate / 상태 / 차량 그룹 + 정차 + 매칭 기사.
 *  2) DISPATCHED + arologisDispatchId 보유 task 만 [수정 요청] / [취소 요청] 버튼 노출
 *     (D-DC-02 + Round E — 수동-only 완료 task 는 arologis dispatch 가 없어 미노출).
 *  3) MODIFICATION_REJECTED / CANCEL_REJECTED 상태에서 rejectionReason 안내 (빨강 배너).
 *  4) MODIFICATION_REQUESTED / CANCEL_REQUESTED 상태에서 "회신 대기" 안내 (보라 배너).
 *  5) MODIFICATION_ACCEPTED 상태에서 [재배차 시작] 안내 (녹색 배너).
 *
 * UUID 비공개:
 *  - 사용자 노출 = taskCode / slipNo / partnerCode / partnerName / driverCode / driverName / driverPhoneNumber / vehiclePlateNumber.
 *  - taskId / groupId / slipId UUID 는 API path 와 dialog 호출에만 사용.
 *
 * accessibility:
 *  - aria-label 한국어 풀네임 ("배차 작업 2026/05/14-1 상세").
 *  - Modal (design-system) 의 focus trap + ESC 닫기 + 한국어 닫기 라벨 활용.
 */
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Input, Modal, safeActorName, Select } from '@samhan/design-system'
import {
  DISPATCH_TASK_STATUS_LABEL,
  DISPATCH_VEHICLE_GROUP_DISPATCH_STATUS_LABEL,
  DISPATCH_VEHICLE_GROUP_DISPATCH_STATUS_TONE,
  MANUAL_MATCHED_DRIVER_SOURCE_OPTIONS,
  MATCHED_DRIVER_SOURCE_LABEL,
  formatDispatchVehicleGroupLabel,
  isEditableStatus,
  type DispatchTaskResponse,
  type SetMatchedDriverPayload,
} from '../../../api/dispatchTask'
import {
  DELETED_ROW_TEXT_STYLE,
  deletedBadgeAriaLabel,
  deletedBadgeLabel,
} from '../../../realtime/deletedRowDisplay'
import { activeSlipRows, activeVehicleGroups } from '../dispatchDeletedRow'
import { ModificationRequestDialog } from './ModificationRequestDialog'
import { CancellationRequestDialog } from './CancellationRequestDialog'
import {
  DispatchCommentThread,
  dispatchCommentsQueryKey,
} from './DispatchCommentThread'
import {
  commitDispatchCollabEdit,
  getDispatchCollabEdits,
  type DispatchCollabEdit,
} from '../../../api/dispatchCollab'
import { DispatchCollabRealtimeClient } from '../../../realtime/DispatchCollabRealtimeClient'
import { DispatchPresenceClient } from '../../../realtime/createPresenceClient'
import { usePresence } from '../../../hooks/usePresence'
import { PresenceIndicator } from '../../../components/collab/PresenceIndicator'
import { CollaborativeTextField } from '../../../components/collab/CollaborativeTextField'
import { usePermissions } from '../../../hooks/usePermissions'
import {
  dispatchTaskQueryKey,
  useMarkManualDispatchCompleteMutation,
  useRestoreSlipFromGroupMutation,
  useRestoreVehicleGroupMutation,
  useSetMatchedDriverMutation,
  useStartRedispatchMutation,
} from '../hooks/useDispatchTask'
import { serverErrorMessage } from '../dispatchErrorMessage'

interface DispatchTaskDetailModalProps {
  task: DispatchTaskResponse
  onClose: () => void
  /** 코멘트 작성/삭제 차단 등 조회 전용 표시 — 배차현황(DispatchHistoryPage) 한정. */
  readOnly?: boolean
  /**
   * task 단위 mutation 버튼([수정 요청]/[취소 요청]/[재배차 시작]) 노출 허용 — Round C Option A.
   *
   * <p>배차현황 상세는 {@code readOnly} (코멘트 조회 전용) 를 유지하면서도 본 플래그로 수정/취소
   * 요청과 재배차 진입을 허용한다. 미지정 시 기존 의미 보존을 위해 {@code !readOnly} 를 따른다.
   * UPDATE 권한 가드 (canAccess dispatch.board update) 는 본 플래그와 별개로 항상 적용된다.
   */
  allowTaskActions?: boolean
}

/**
 * 상태별 배너 색상 (Samhan Public design token + arologis-teal Phase A 일관).
 */
const STATUS_BANNER_STYLE: Record<
  string,
  { bg: string; border: string; color: string; label: string }
> = {
  MODIFICATION_REQUESTED: {
    bg: 'var(--color-purple-50, #FAF5FF)',
    border: 'var(--color-purple-200, #E9D5FF)',
    color: 'var(--color-purple-700, #6B21A8)',
    label: '수정 요청 발송됨 — 아로로지스 회신 대기 중',
  },
  MODIFICATION_ACCEPTED: {
    bg: 'var(--color-success-50, #ECFDF5)',
    border: 'var(--color-success-200, #A7F3D0)',
    color: 'var(--color-success-700, #047857)',
    label:
      '수정 수락됨 — [재배차 시작] 후 편집. 차량/전표 구성을 수정한 뒤 [배차 완료] 를 다시 누르세요.',
  },
  MODIFICATION_REJECTED: {
    bg: 'var(--color-danger-50, #FEF2F2)',
    border: 'var(--color-danger-200, #FECACA)',
    color: 'var(--color-danger-700, #B91C1C)',
    label: '수정 거부됨 — 배차는 기존 상태(DISPATCHED) 로 유지됩니다.',
  },
  CANCEL_REQUESTED: {
    bg: 'var(--color-purple-50, #FAF5FF)',
    border: 'var(--color-purple-200, #E9D5FF)',
    color: 'var(--color-purple-700, #6B21A8)',
    label: '취소 요청 발송됨 — 아로로지스 회신 대기 중',
  },
  CANCEL_ACCEPTED: {
    bg: 'var(--color-success-50, #ECFDF5)',
    border: 'var(--color-success-200, #A7F3D0)',
    color: 'var(--color-success-700, #047857)',
    label: '취소 수락됨 — 배차 취소 처리 중',
  },
  CANCEL_REJECTED: {
    bg: 'var(--color-danger-50, #FEF2F2)',
    border: 'var(--color-danger-200, #FECACA)',
    color: 'var(--color-danger-700, #B91C1C)',
    label: '취소 거부됨 — 배차는 기존 상태(DISPATCHED) 로 유지됩니다.',
  },
  CANCELLED: {
    bg: 'var(--color-neutral-100)',
    border: 'var(--color-neutral-300)',
    color: 'var(--color-neutral-700)',
    label: '배차 취소 완료 — 매핑된 전표는 미배차 상태로 복귀했습니다.',
  },
}

const EMPTY_MATCHED_DRIVER_FORM: SetMatchedDriverPayload = {
  driverName: '',
  vehiclePlateNumber: '',
  driverPhoneNumber: '',
  driverSource: 'GYEONGGI_QUICK',
}

const VISUALLY_HIDDEN_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

type MatchedDriverFormErrors = Partial<Record<keyof SetMatchedDriverPayload, string>>
type MatchedDriverFormTouched = Partial<Record<keyof SetMatchedDriverPayload, boolean>>

const PHONE_PATTERN = /^[0-9+\-\s()]{7,20}$/

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  return value.slice(0, 16).replace('T', ' ')
}

function displayName(value: string | null | undefined): string {
  if (value == null || value.trim().length === 0) return '시스템'
  return safeActorName(value) ?? '변경자 미상'
}

function valueForEdit(value: string | null | undefined): string {
  return value ?? ''
}

function valueForChange(value: string): string | null {
  return value.length === 0 ? null : value
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\//g, '.')
}

function labelForPath(path: string): string {
  return normalizePath(path) === 'memo' ? '비고' : normalizePath(path)
}

function parseChangeSetDiffs(changeSet: string): Array<{
  fieldName: string
  label: string
  before: string | null
  after: string | null
}> {
  try {
    const parsed = JSON.parse(changeSet) as Record<string, { before?: unknown; after?: unknown }>
    return Object.entries(parsed).map(([path, change]) => ({
      fieldName: normalizePath(path),
      label: labelForPath(path),
      before: change.before == null ? null : String(change.before),
      after: change.after == null ? null : String(change.after),
    }))
  } catch {
    return []
  }
}

function validateMatchedDriverForm(
  form: SetMatchedDriverPayload,
): MatchedDriverFormErrors {
  const errors: MatchedDriverFormErrors = {}
  if (!form.driverName.trim()) {
    errors.driverName = '기사명을 입력하세요.'
  }
  if (!form.vehiclePlateNumber.trim()) {
    errors.vehiclePlateNumber = '차량번호를 입력하세요.'
  }
  const phone = form.driverPhoneNumber.trim()
  if (phone && !PHONE_PATTERN.test(phone)) {
    errors.driverPhoneNumber = '전화번호 형식을 확인하세요.'
  }
  return errors
}

function toManualMatchedDriverSource(value: string): SetMatchedDriverPayload['driverSource'] {
  switch (value) {
    case 'GYEONGGI_QUICK':
      return 'GYEONGGI_QUICK'
    case 'JEONGUK_HWAMUL':
      return 'JEONGUK_HWAMUL'
    case 'OTHER':
      return 'OTHER'
    default:
      return 'GYEONGGI_QUICK'
  }
}

export function DispatchTaskDetailModal({
  task,
  onClose,
  readOnly = false,
  allowTaskActions = !readOnly,
}: DispatchTaskDetailModalProps) {
  const [modificationOpen, setModificationOpen] = useState(false)
  const [cancellationOpen, setCancellationOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<{
    id: string
    sequence: number
  } | null>(null)
  const [matchedDriverForm, setMatchedDriverForm] =
    useState<SetMatchedDriverPayload>(EMPTY_MATCHED_DRIVER_FORM)
  const [matchedDriverFormTouched, setMatchedDriverFormTouched] =
    useState<MatchedDriverFormTouched>({})
  const [matchedDriverSubmitAttempted, setMatchedDriverSubmitAttempted] =
    useState(false)
  const [taskActionError, setTaskActionError] = useState<string | null>(null)
  const [collabEditMode, setCollabEditMode] = useState(false)
  const [memoDraft, setMemoDraft] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editNotice, setEditNotice] = useState<string | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const presenceEntries = usePresence({ entityId: task.id, client: DispatchPresenceClient, enabled: !!task.id })
  const { canAccess } = usePermissions()
  const setMatchedDriverMutation = useSetMatchedDriverMutation(task.id)
  const manualCompleteMutation = useMarkManualDispatchCompleteMutation(task.id)
  const startRedispatchMutation = useStartRedispatchMutation(task.id)
  const restoreGroupMutation = useRestoreVehicleGroupMutation(task.id)
  const restoreSlipMutation = useRestoreSlipFromGroupMutation(task.id)
  const editQueryKey = useMemo(() => ['dispatchCollabEdits', task.id] as const, [task.id])
  const collabBasePath = useMemo(
    () => `/admin/dispatch-tasks/${encodeURIComponent(task.id)}`,
    [task.id],
  )
  const matchedDriverFormErrors = validateMatchedDriverForm(matchedDriverForm)
  const hasMatchedDriverFormErrors =
    Object.keys(matchedDriverFormErrors).length > 0
  const visibleMatchedDriverFormErrors = Object.fromEntries(
    Object.entries(matchedDriverFormErrors).filter(([key]) =>
      matchedDriverSubmitAttempted ||
      matchedDriverFormTouched[key as keyof SetMatchedDriverPayload],
    ),
  ) as MatchedDriverFormErrors

  // Round C Option A — 배차현황 상세에서도 UPDATE 권한이면 수정/취소 요청·재배차 시작 허용.
  // 단, 수동-only 완료 task 는 arologisDispatchId 가 없으므로 arologis 수정/취소 요청 진입을 막는다.
  const showRequestButtons =
    allowTaskActions &&
    task.status === 'DISPATCHED' &&
    !!task.arologisDispatchId &&
    canAccess('dispatch.board', 'update')
  const showRedispatchButton =
    allowTaskActions && task.status === 'MODIFICATION_ACCEPTED' && canAccess('dispatch.board', 'update')
  const collabLocked = task.status === 'CANCEL_ACCEPTED' || task.status === 'CANCELLED'
  const canStartCollabEdit =
    task.status === 'DISPATCHED' &&
    !collabLocked &&
    canAccess('dispatch.board', 'update')
  const canEditMatchedDriver =
    canAccess('dispatch.board', 'update') &&
    (task.status === 'DRAFT' ||
      task.status === 'DISPATCHING' ||
      task.status === 'DISPATCHED')
  // 복원은 BE requireDraftTask 와 동일하게 DRAFT 한정 — 발송 후 영구 잔존하는 취소선 행에
  // 항상 409 로 실패하는 활성 버튼을 노출하지 않는다.
  const canRestoreDeletedRows =
    !readOnly &&
    isEditableStatus(task.status) &&
    canAccess('dispatch.board', 'restore') &&
    canAccess('dispatch.board', 'update')
  const banner = STATUS_BANNER_STYLE[task.status]
  // 카운트는 활성(비삭제) 기준 — 취소선 행 포함 length 는 부풀려진다.
  const liveGroups = activeVehicleGroups(task.vehicleGroups)
  const totalSlips = liveGroups.reduce((s, g) => s + activeSlipRows(g).length, 0)

  const editsQuery = useQuery({
    queryKey: editQueryKey,
    queryFn: () => getDispatchCollabEdits(task.id),
    enabled: task.id.length > 0,
  })

  useEffect(() => {
    if (!task.id) return
    const ctrl = DispatchCollabRealtimeClient.subscribe(task.id, (evt) => {
      if (evt.event.startsWith('comment.')) {
        void queryClient.invalidateQueries({ queryKey: dispatchCommentsQueryKey(task.id) })
        return
      }
      if (evt.event.startsWith('suggestion.') || evt.event === 'message') {
        void queryClient.invalidateQueries({ queryKey: editQueryKey })
        void queryClient.invalidateQueries({ queryKey: dispatchTaskQueryKey(task.id) })
        void queryClient.invalidateQueries({ queryKey: ['dispatchTasks'] })
      }
    })
    return () => ctrl.abort()
  }, [editQueryKey, queryClient, task.id])

  useEffect(() => {
    if (!collabEditMode) return
    setMemoDraft(valueForEdit(task.memo))
    setEditReason('')
    setEditNotice(null)
    setCommitError(null)
  }, [collabEditMode, task.memo])

  const commitMutation = useMutation({
    mutationFn: () => {
      const beforeMemo = valueForEdit(task.memo)
      if (beforeMemo === memoDraft) {
        throw new Error('변경된 필드가 없습니다.')
      }
      return commitDispatchCollabEdit(task.id, {
        changeSet: JSON.stringify({
          memo: {
            before: valueForChange(beforeMemo),
            after: valueForChange(memoDraft),
          },
        }),
        reason: editReason.trim() || undefined,
      })
    },
    onSuccess: (response) => {
      setCollabEditMode(false)
      setEditNotice('수정완료되었습니다.')
      queryClient.setQueryData(dispatchTaskQueryKey(response.task.id), response.task)
      void queryClient.invalidateQueries({ queryKey: dispatchTaskQueryKey(response.task.id) })
      void queryClient.invalidateQueries({ queryKey: editQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['dispatchTasks'] })
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === '변경된 필드가 없습니다.') {
        setCommitError('변경된 필드가 없습니다.')
        return
      }
      setCommitError(serverErrorMessage(error) ?? '수정 저장에 실패했습니다. 다시 시도해 주세요.')
    },
  })

  const edits: DispatchCollabEdit[] = Array.isArray(editsQuery.data) ? editsQuery.data : []

  // matchedDrivers 를 그룹 sequence 로 dict 화 (그룹 헤더 inline 노출).
  const matchedByGroup = new Map(
    task.matchedDrivers.map((d) => [d.vehicleGroupSequence, d] as const),
  )

  const startMatchedDriverEdit = (groupId: string, sequence: number) => {
    const matched = matchedByGroup.get(sequence)
    setMatchedDriverMutation.reset()
    setMatchedDriverFormTouched({})
    setMatchedDriverSubmitAttempted(false)
    setEditingGroup({ id: groupId, sequence })
    setMatchedDriverForm({
      driverName: matched?.driverName ?? '',
      vehiclePlateNumber: matched?.vehiclePlateNumber ?? '',
      driverPhoneNumber: matched?.driverPhoneNumber ?? '',
      driverSource:
        matched?.driverSource && matched.driverSource !== 'AROLOGIS'
          ? matched.driverSource
          : 'GYEONGGI_QUICK',
    })
  }

  const updateMatchedDriverTextField = (
    key: Exclude<keyof SetMatchedDriverPayload, 'driverSource'>,
    value: string,
  ) => {
    setMatchedDriverForm((current) => ({
      ...current,
      [key]: value,
    }))
    setMatchedDriverFormTouched((current) => ({ ...current, [key]: true }))
  }

  const updateMatchedDriverSource = (value: string) => {
    setMatchedDriverForm((current) => ({
      ...current,
      driverSource: toManualMatchedDriverSource(value),
    }))
    setMatchedDriverFormTouched((current) => ({ ...current, driverSource: true }))
  }

  const handleMatchedDriverSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingGroup) return
    setMatchedDriverSubmitAttempted(true)
    if (hasMatchedDriverFormErrors) return
    setMatchedDriverMutation.mutate(
      {
        groupId: editingGroup.id,
        payload: {
          driverName: matchedDriverForm.driverName.trim(),
          vehiclePlateNumber: matchedDriverForm.vehiclePlateNumber.trim(),
          driverPhoneNumber: matchedDriverForm.driverPhoneNumber.trim(),
          driverSource: matchedDriverForm.driverSource,
        },
      },
      {
        onSuccess: () => {
          setEditingGroup(null)
          setMatchedDriverForm(EMPTY_MATCHED_DRIVER_FORM)
          setMatchedDriverFormTouched({})
          setMatchedDriverSubmitAttempted(false)
        },
      },
    )
  }

  const closeMatchedDriverEdit = () => {
    setMatchedDriverMutation.reset()
    setEditingGroup(null)
    setMatchedDriverForm(EMPTY_MATCHED_DRIVER_FORM)
    setMatchedDriverFormTouched({})
    setMatchedDriverSubmitAttempted(false)
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`배차 작업 ${task.taskCode}`}
        description={`${task.dispatchDate} · 차량 ${liveGroups.length}대 · 전표 ${totalSlips}건`}
        size="lg"
        footer={
          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
            }}
          >
            {showRequestButtons ? (
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setModificationOpen(true)}
                  data-testid="dispatch-task-detail-request-modification"
                  aria-label={`배차 작업 ${task.taskCode} 수정 요청 발송`}
                >
                  수정 요청
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => setCancellationOpen(true)}
                  data-testid="dispatch-task-detail-request-cancellation"
                  aria-label={`배차 작업 ${task.taskCode} 취소 요청 발송`}
                >
                  취소 요청
                </Button>
              </>
            ) : null}
            {showRedispatchButton ? (
              <Button
                type="button"
                variant="primary"
                  size="sm"
                  onClick={() => {
                    setTaskActionError(null)
                    startRedispatchMutation.mutate(undefined, {
                      onError: () => setTaskActionError('재배차 시작에 실패했습니다. 상태를 확인하세요.'),
                    })
                  }}
                  disabled={startRedispatchMutation.isPending}
                data-testid="dispatch-task-detail-start-redispatch"
                aria-label={`배차 작업 ${task.taskCode} 재배차 시작`}
              >
                재배차 시작
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              data-testid="dispatch-task-detail-close"
            >
              닫기
            </Button>
          </div>
        }
      >
        <div
          data-testid="dispatch-task-detail-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {/* 상태 배너 (Phase C 6 신규 상태 + CANCELLED) */}
          {banner ? (
            <div
              data-testid="dispatch-task-detail-status-banner"
              role={
                task.status.endsWith('REJECTED') ? 'alert' : 'status'
              }
              style={{
                padding: 10,
                fontSize: 13,
                background: banner.bg,
                color: banner.color,
                border: `1px solid ${banner.border}`,
                borderRadius: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <strong>{DISPATCH_TASK_STATUS_LABEL[task.status]}</strong>
              <span>{banner.label}</span>
              {task.modificationReason ? (
                <span style={{ fontSize: 12 }}>
                  요청 사유: {task.modificationReason}
                </span>
              ) : null}
              {task.rejectionReason ? (
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  거부 사유: {task.rejectionReason}
                </span>
              ) : null}
            </div>
          ) : null}
          {taskActionError ? (
            <div
              role="alert"
              data-testid="dispatch-task-detail-action-error"
              style={{
                padding: 8,
                borderRadius: 4,
                fontSize: 12,
                color: 'var(--color-danger-700, #B91C1C)',
                background: 'var(--color-danger-50, #FEF2F2)',
                border: '1px solid var(--color-danger-200, #FECACA)',
              }}
            >
              {taskActionError}
            </div>
          ) : null}

          {/* 요약 정보 */}
          <section>
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                gap: '6px 12px',
                fontSize: 13,
                margin: 0,
              }}
            >
              <dt style={{ color: 'var(--color-neutral-500)' }}>배차 작업번호</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>{task.taskCode}</dd>
              <dt style={{ color: 'var(--color-neutral-500)' }}>배차 일자</dt>
              <dd style={{ margin: 0 }}>{task.dispatchDate}</dd>
              <dt style={{ color: 'var(--color-neutral-500)' }}>상태</dt>
              <dd style={{ margin: 0 }}>
                {DISPATCH_TASK_STATUS_LABEL[task.status]}
              </dd>
              <dt style={{ color: 'var(--color-neutral-500)' }}>비고</dt>
              <dd style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {task.memo?.trim() ? task.memo : '-'}
              </dd>
            </dl>
          </section>

          {/* 차량 그룹 + 정차 list */}
          <section>
            <h4 style={{ margin: '4px 0', fontSize: 13, fontWeight: 600 }}>
              차량 그룹 ({liveGroups.length}대)
            </h4>
            {task.vehicleGroups.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                차량 그룹이 없습니다.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {task.vehicleGroups.map((g) => {
                  const groupDeleted = g.isDeleted === true
                  const matched = matchedByGroup.get(g.sequence) ?? null
                  const matchedDriverCodeLabel =
                    matched?.driverCode === 'MANUAL'
                      ? MATCHED_DRIVER_SOURCE_LABEL[matched.driverSource]
                      : matched?.driverCode
                  const vehicleLabel = formatDispatchVehicleGroupLabel(g)
                  const groupDispatchStatus = g.dispatchStatus ?? 'PENDING'
                  const groupStatusTone =
                    DISPATCH_VEHICLE_GROUP_DISPATCH_STATUS_TONE[groupDispatchStatus]
                  const canManualComplete =
                    canEditMatchedDriver &&
                    !groupDeleted &&
                    (task.status === 'DRAFT' || task.status === 'DISPATCHING') &&
                    g.dispatchStatus === 'PENDING' &&
                    matched?.driverCode === 'MANUAL' &&
                    matched.driverSource !== 'AROLOGIS'
                  const canRestoreGroup =
                    canRestoreDeletedRows && groupDeleted && groupDispatchStatus === 'PENDING'
                  return (
                    <div
                      key={g.id}
                      data-testid={`dispatch-task-detail-group-${g.sequence}`}
                      style={{
                        border: '1px solid var(--color-neutral-200)',
                        borderRadius: 4,
                        overflow: 'hidden',
                      }}
                    >
                      <header
                        style={{
                          padding: '6px 10px',
                          background: 'var(--color-neutral-50)',
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 8,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        <span
                          data-testid={`dispatch-task-detail-group-${g.sequence}-deleted-label`}
                          style={{
                            minWidth: 0,
                            overflowWrap: 'anywhere',
                            ...(groupDeleted ? DELETED_ROW_TEXT_STYLE : null),
                          }}
                        >
                          {vehicleLabel} #{g.sequence}
                        </span>
                        <span
                          style={{
                            fontWeight: 400,
                            color: 'var(--color-neutral-500)',
                          }}
                        >
                          ({activeSlipRows(g).length}건)
                        </span>
                        {/* Round C — 그룹 단위 발송 상태 배지 (보드 카드와 동일 라벨/톤).
                            재배차 시작 직후 '미발송' 복귀를 모달 레벨에서 검증 가능. */}
                        <span
                          data-testid={`dispatch-task-detail-group-${g.sequence}-dispatch-status`}
                          style={{
                            padding: '1px 6px',
                            borderRadius: 10,
                            border: `1px solid ${groupStatusTone.borderColor}`,
                            background: groupStatusTone.background,
                            color: groupStatusTone.color,
                            fontSize: 10,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {DISPATCH_VEHICLE_GROUP_DISPATCH_STATUS_LABEL[groupDispatchStatus]}
                        </span>
                        {groupDeleted ? (
                          <Badge
                            variant="neutral"
                            title={deletedBadgeAriaLabel(g.deletedByName, g.deletedAt)}
                            aria-label={deletedBadgeAriaLabel(g.deletedByName, g.deletedAt)}
                            data-testid={`dispatch-task-detail-group-${g.sequence}-deleted-badge`}
                            style={{
                              maxWidth: 160,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {deletedBadgeLabel(g.deletedByName)}
                          </Badge>
                        ) : null}
                        {matched && !groupDeleted ? (
                          <span
                            style={{
                              marginLeft: 'auto',
                              fontSize: 11,
                              color: 'var(--color-success-700, #047857)',
                              minWidth: 0,
                              overflowWrap: 'anywhere',
                            }}
                          >
                            기사 {matched.driverName} ({matchedDriverCodeLabel}){' '}
                            {matched.driverPhoneNumber?.trim() || '-'} · 차량번호{' '}
                            {matched.vehiclePlateNumber?.trim() || '-'}
                          </span>
                        ) : null}
                        {canEditMatchedDriver && !groupDeleted ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => startMatchedDriverEdit(g.id, g.sequence)}
                            data-testid={`dispatch-task-detail-set-matched-driver-${g.sequence}`}
                            aria-label={`${vehicleLabel} #${g.sequence} 기사/차량 입력`}
                          >
                            기사/차량 입력
                          </Button>
                        ) : null}
                        {canRestoreGroup ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={restoreGroupMutation.isPending}
                            loading={restoreGroupMutation.isPending}
                            onClick={() => {
                              setTaskActionError(null)
                              restoreGroupMutation.mutate(g.id, {
                                onError: (error) =>
                                  setTaskActionError(
                                    serverErrorMessage(error) ?? '복원에 실패했습니다. 배차 상태를 확인하세요.',
                                  ),
                              })
                            }}
                            data-testid={`dispatch-task-detail-restore-group-${g.sequence}`}
                            aria-label={`${vehicleLabel} #${g.sequence} 그룹 복원`}
                          >
                            복원
                          </Button>
                        ) : null}
                        {canManualComplete ? (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setTaskActionError(null)
                              manualCompleteMutation.mutate(g.id, {
                                onError: () => setTaskActionError('수동 발송완료 처리에 실패했습니다. 상태를 확인하세요.'),
                              })
                            }}
                            disabled={manualCompleteMutation.isPending}
                            data-testid={`dispatch-task-detail-manual-complete-${g.sequence}`}
                            aria-label={`${vehicleLabel} #${g.sequence} 수동 발송완료 표시`}
                          >
                            수동 발송완료
                          </Button>
                        ) : null}
                      </header>
                      {g.slips.length === 0 ? (
                        <div
                          style={{
                            padding: 8,
                            fontSize: 11,
                            color: 'var(--color-neutral-500)',
                          }}
                        >
                          정차 없음
                        </div>
                      ) : (
                        <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                          {g.slips.map((row) => {
                            const rowDeleted = row.isDeleted === true
                            const canRestoreSlip =
                              canRestoreDeletedRows &&
                              rowDeleted &&
                              !groupDeleted &&
                              groupDispatchStatus === 'PENDING'
                            return (
                              <li
                                key={row.id}
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 8,
                                  alignItems: 'center',
                                  padding: '4px 10px',
                                  fontSize: 11,
                                  borderBottom:
                                    '1px solid var(--color-neutral-100)',
                                }}
                              >
                                <span
                                  style={{
                                    color: 'var(--color-neutral-500)',
                                    minWidth: 18,
                                    textAlign: 'right',
                                  }}
                                >
                                  {row.sequence}.
                                </span>
                                <span
                                  data-testid={`dispatch-task-detail-slip-${row.slip.slipNo}-deleted-label`}
                                  style={{
                                    fontWeight: 600,
                                    ...(rowDeleted ? DELETED_ROW_TEXT_STYLE : null),
                                  }}
                                >
                                  {row.slip.slipNo}
                                </span>
                                <span
                                  style={{
                                    flex: '1 1 160px',
                                    minWidth: 0,
                                    overflowWrap: 'anywhere',
                                    ...(rowDeleted ? DELETED_ROW_TEXT_STYLE : null),
                                  }}
                                >
                                  {row.slip.partnerName}
                                </span>
                                {rowDeleted ? (
                                  <Badge
                                    variant="neutral"
                                    title={deletedBadgeAriaLabel(row.deletedByName, row.deletedAt)}
                                    aria-label={deletedBadgeAriaLabel(row.deletedByName, row.deletedAt)}
                                    data-testid={`dispatch-task-detail-slip-${row.slip.slipNo}-deleted-badge`}
                                    style={{
                                      maxWidth: 160,
                                      minWidth: 0,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {deletedBadgeLabel(row.deletedByName)}
                                  </Badge>
                                ) : null}
                                {canRestoreSlip ? (
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    disabled={restoreSlipMutation.isPending}
                                    loading={restoreSlipMutation.isPending}
                                    onClick={() => {
                                      setTaskActionError(null)
                                      restoreSlipMutation.mutate(
                                        { groupId: g.id, slipId: row.slipId, mappingId: row.id },
                                        {
                                          onError: (error) =>
                                            setTaskActionError(
                                              serverErrorMessage(error) ??
                                                '복원에 실패했습니다. 전표/그룹 상태를 확인하세요.',
                                            ),
                                        },
                                      )
                                    }}
                                    data-testid={`dispatch-task-detail-restore-slip-${row.slip.slipNo}`}
                                    aria-label={`정차 ${row.sequence} ${row.slip.slipNo} 복원`}
                                  >
                                    복원
                                  </Button>
                                ) : null}
                              </li>
                            )
                          })}
                        </ol>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* FAILED 사유 */}
          {task.status === 'FAILED' && task.failureReason ? (
            <div
              role="alert"
              style={{
                padding: 8,
                fontSize: 12,
                color: 'var(--color-danger-700, #B91C1C)',
                background: 'var(--color-danger-50, #FEF2F2)',
                border: '1px solid var(--color-danger-200, #FECACA)',
                borderRadius: 4,
              }}
            >
              <strong>배차 불가 사유:</strong> {task.failureReason}
            </div>
          ) : null}

          <section
            aria-label="협업 메모"
            style={{
              borderTop: '1px solid var(--color-neutral-200)',
              paddingTop: 12,
              display: 'grid',
              gap: 4,
            }}
          >
            <CollaborativeTextField
              documentId={task.id}
              basePath={collabBasePath}
              fieldName="memo"
              label="협업 메모"
              rows={4}
              readOnly={!canAccess('dispatch.board', 'update')}
            />
            <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' }}>
              팀 내 실시간 공유 메모입니다. 배차 “비고”(저장 항목)와는 별개로 보관됩니다.
            </p>
          </section>

          <section
            data-testid="dispatch-collab-edit-section"
            aria-labelledby="dispatch-collab-edit-heading"
            style={{
              borderTop: '1px solid var(--color-neutral-200)',
              paddingTop: 12,
              display: 'grid',
              gap: 10,
            }}
          >
            <header
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1 }}>
                <h4 id="dispatch-collab-edit-heading" style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>수정 이력</h4>
                <PresenceIndicator entries={presenceEntries} />
              </div>
              {canStartCollabEdit && !collabEditMode ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setCollabEditMode(true)}
                  data-testid="dispatch-collab-edit-start"
                  aria-label={`배차 작업 ${task.taskCode} 비고 수정`}
                >
                  수정
                </Button>
              ) : null}
              {!collabEditMode && !canStartCollabEdit && canAccess('dispatch.board', 'update') ? (
                <span
                  data-testid="dispatch-collab-edit-unavailable"
                  style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
                >
                  {collabLocked
                    ? '배차 취소 처리 후에는 비고를 수정할 수 없습니다.'
                    : `${DISPATCH_TASK_STATUS_LABEL.DISPATCHED} 상태에서만 비고를 수정할 수 있습니다.`}
                </span>
              ) : null}
            </header>

            {collabEditMode ? (
              <div
                data-testid="dispatch-collab-edit-form"
                style={{
                  display: 'grid',
                  gap: 8,
                  padding: 10,
                  border: '1px solid var(--color-neutral-200)',
                  borderRadius: 4,
                  background: 'var(--color-neutral-50)',
                }}
              >
                <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                  비고
                  <textarea
                    value={memoDraft}
                    onChange={(event) => setMemoDraft(event.target.value)}
                    maxLength={1000}
                    rows={3}
                    aria-label="비고 수정값"
                    data-testid="dispatch-collab-edit-memo"
                    style={{
                      resize: 'vertical',
                      minHeight: 72,
                      padding: '8px 10px',
                      borderRadius: 4,
                      border: '1px solid var(--color-neutral-300)',
                      fontSize: 13,
                      fontFamily: 'inherit',
                    }}
                  />
                </label>
                <Input
                  value={editReason}
                  onChange={(event) => setEditReason(event.target.value)}
                  placeholder="사유"
                  maxLength={500}
                  aria-label="수정 사유"
                  inputSize="sm"
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={commitMutation.isPending}
                    onClick={() => setCollabEditMode(false)}
                    data-testid="dispatch-collab-edit-cancel"
                  >
                    취소
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    loading={commitMutation.isPending}
                    disabled={commitMutation.isPending}
                    onClick={() => commitMutation.mutate()}
                    data-testid="dispatch-collab-edit-submit"
                  >
                    수정완료
                  </Button>
                </div>
                {commitError ? (
                  <p
                    role="alert"
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: 'var(--color-danger-700, #B91C1C)',
                    }}
                  >
                    {commitError}
                  </p>
                ) : null}
              </div>
            ) : null}

            {editNotice ? (
              <p
                role="status"
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: 'var(--color-success-700, #047857)',
                }}
              >
                {editNotice}
              </p>
            ) : null}

            <div
              data-testid="dispatch-collab-edit-list"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {editsQuery.isLoading ? (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-500)' }}>
                  수정 이력을 불러오는 중...
                </p>
              ) : editsQuery.isError ? (
                <p
                  role="alert"
                  style={{ margin: 0, fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}
                >
                  수정 이력을 불러오지 못했습니다.
                </p>
              ) : edits.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-500)' }}>
                  아직 수정 이력이 없습니다.
                </p>
              ) : (
                edits.map((edit) => {
                  const diffs = parseChangeSetDiffs(edit.changeSet)
                  return (
                    <article
                      key={edit.id}
                      data-testid="dispatch-collab-edit-item"
                      style={{
                        border: '1px solid var(--color-neutral-200)',
                        borderRadius: 4,
                        padding: 8,
                        background: 'var(--color-neutral-0, #fff)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                          fontSize: 12,
                        }}
                      >
                        <strong>{displayName(edit.decidedByName ?? edit.proposerName)}</strong>
                        <Badge variant="success">수정완료</Badge>
                        <span style={{ color: 'var(--color-neutral-500)' }}>
                          {formatDateTime(edit.decidedAt ?? edit.createdAt)}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                        {diffs.map((diff) => (
                          <div
                            key={`${edit.id}-${diff.fieldName}`}
                            style={{ fontSize: 13, overflowWrap: 'anywhere' }}
                          >
                            <span style={VISUALLY_HIDDEN_STYLE}>
                              {`${diff.label}: 변경 전 ${diff.before ?? '이전값 미기록'}, 변경 후 ${diff.after ?? '비움'}`}
                            </span>
                            <span
                              aria-hidden="true"
                            >
                              <strong>{diff.label}</strong>
                              <span
                                style={{
                                  marginLeft: 8,
                                  color: 'var(--color-neutral-500)',
                                  textDecoration: 'line-through',
                                }}
                              >
                                {diff.before ?? '이전값 미기록'}
                              </span>
                              <span
                                style={{ margin: '0 6px', color: 'var(--color-neutral-400)' }}
                              >
                                →
                              </span>
                              <span
                                style={{
                                  color: 'var(--color-brand-700, #0F766E)',
                                  fontWeight: 700,
                                }}
                              >
                                {diff.after ?? '비움'}
                              </span>
                            </span>
                          </div>
                        ))}
                        {diffs.length === 0 ? (
                          <p style={{ margin: 0, fontSize: 13 }}>
                            변경 내용 형식을 해석하지 못했습니다.
                          </p>
                        ) : null}
                      </div>
                      {edit.reason ? (
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-neutral-600)' }}>
                          사유: {edit.reason}
                        </p>
                      ) : null}
                    </article>
                  )
                })
              )}
            </div>
          </section>

          <DispatchCommentThread taskId={task.id} readOnly={readOnly} />
        </div>
      </Modal>

      {/* 수정 요청 dialog — 발송 후 상세 모달은 유지한다 (Round C Option A).
          요청 직후 상태 배너(회신 대기/수락/거부)를 같은 모달에서 바로 확인하고,
          mock/실회신 수락 시 [재배차 시작] 까지 같은 세션에서 진입한다. */}
      {modificationOpen ? (
        <ModificationRequestDialog
          taskId={task.id}
          taskCode={task.taskCode}
          onClose={() => setModificationOpen(false)}
          onSubmitted={() => {
            setModificationOpen(false)
          }}
        />
      ) : null}

      {/* 취소 요청 dialog — 동일하게 상세 모달 유지. */}
      {cancellationOpen ? (
        <CancellationRequestDialog
          taskId={task.id}
          taskCode={task.taskCode}
          onClose={() => setCancellationOpen(false)}
          onSubmitted={() => {
            setCancellationOpen(false)
          }}
        />
      ) : null}

      {editingGroup ? (
        <Modal
          open
          onClose={closeMatchedDriverEdit}
          title={`차량 #${editingGroup.sequence} 기사/차량 입력`}
          description="타사 배차 기사명, 차량번호, 연락처, 출처"
          size="sm"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={closeMatchedDriverEdit}
              >
                취소
              </Button>
              <Button
                type="submit"
                form="matched-driver-form"
                variant="primary"
                size="sm"
                disabled={
                  setMatchedDriverMutation.isPending || hasMatchedDriverFormErrors
                }
                data-testid="matched-driver-submit"
              >
                저장
              </Button>
            </div>
          }
        >
          <form
            id="matched-driver-form"
            onSubmit={handleMatchedDriverSubmit}
            style={{ display: 'grid', gap: 10 }}
          >
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              기사명
              <Input
                value={matchedDriverForm.driverName}
                onChange={(e) => updateMatchedDriverTextField('driverName', e.currentTarget.value)}
                maxLength={100}
                required
                aria-invalid={visibleMatchedDriverFormErrors.driverName ? true : undefined}
                aria-describedby={
                  visibleMatchedDriverFormErrors.driverName
                    ? 'matched-driver-driver-name-error'
                    : undefined
                }
                data-testid="matched-driver-driver-name"
              />
              {visibleMatchedDriverFormErrors.driverName ? (
                <span
                  id="matched-driver-driver-name-error"
                  role="alert"
                  style={{ color: 'var(--color-danger-700, #B91C1C)' }}
                >
                  {visibleMatchedDriverFormErrors.driverName}
                </span>
              ) : null}
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              차량번호
              <Input
                value={matchedDriverForm.vehiclePlateNumber}
                onChange={(e) =>
                  updateMatchedDriverTextField('vehiclePlateNumber', e.currentTarget.value)
                }
                maxLength={20}
                required
                aria-invalid={
                  visibleMatchedDriverFormErrors.vehiclePlateNumber ? true : undefined
                }
                aria-describedby={
                  visibleMatchedDriverFormErrors.vehiclePlateNumber
                    ? 'matched-driver-vehicle-plate-number-error'
                    : undefined
                }
                data-testid="matched-driver-vehicle-plate-number"
              />
              {visibleMatchedDriverFormErrors.vehiclePlateNumber ? (
                <span
                  id="matched-driver-vehicle-plate-number-error"
                  role="alert"
                  style={{ color: 'var(--color-danger-700, #B91C1C)' }}
                >
                  {visibleMatchedDriverFormErrors.vehiclePlateNumber}
                </span>
              ) : null}
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              연락처
              <Input
                value={matchedDriverForm.driverPhoneNumber}
                onChange={(e) =>
                  updateMatchedDriverTextField('driverPhoneNumber', e.currentTarget.value)
                }
                maxLength={20}
                aria-invalid={
                  visibleMatchedDriverFormErrors.driverPhoneNumber ? true : undefined
                }
                aria-describedby={
                  visibleMatchedDriverFormErrors.driverPhoneNumber
                    ? 'matched-driver-driver-phone-number-error'
                    : undefined
                }
                data-testid="matched-driver-driver-phone-number"
              />
              {visibleMatchedDriverFormErrors.driverPhoneNumber ? (
                <span
                  id="matched-driver-driver-phone-number-error"
                  role="alert"
                  style={{ color: 'var(--color-danger-700, #B91C1C)' }}
                >
                  {visibleMatchedDriverFormErrors.driverPhoneNumber}
                </span>
              ) : null}
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              출처
              <Select
                value={matchedDriverForm.driverSource}
                onChange={(e) => updateMatchedDriverSource(e.currentTarget.value)}
                required
                aria-invalid={visibleMatchedDriverFormErrors.driverSource ? true : undefined}
                aria-describedby={
                  visibleMatchedDriverFormErrors.driverSource
                    ? 'matched-driver-driver-source-error'
                    : undefined
                }
                data-testid="matched-driver-driver-source"
                selectSize="sm"
              >
                {MANUAL_MATCHED_DRIVER_SOURCE_OPTIONS.map((source) => (
                  <option key={source} value={source}>
                    {MATCHED_DRIVER_SOURCE_LABEL[source]}
                  </option>
                ))}
              </Select>
              {visibleMatchedDriverFormErrors.driverSource ? (
                <span
                  id="matched-driver-driver-source-error"
                  role="alert"
                  style={{ color: 'var(--color-danger-700, #B91C1C)' }}
                >
                  {visibleMatchedDriverFormErrors.driverSource}
                </span>
              ) : null}
            </label>
            {setMatchedDriverMutation.isError ? (
              <div
                role="alert"
                style={{
                  padding: 8,
                  borderRadius: 4,
                  fontSize: 12,
                  color: 'var(--color-danger-700, #B91C1C)',
                  background: 'var(--color-danger-50, #FEF2F2)',
                  border: '1px solid var(--color-danger-200, #FECACA)',
                }}
              >
                기사/차량 정보를 저장하지 못했습니다.
              </div>
            ) : null}
          </form>
        </Modal>
      ) : null}
    </>
  )
}
