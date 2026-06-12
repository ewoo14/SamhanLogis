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
 *  2) DISPATCHED 상태에서만 [수정 요청] / [취소 요청] 버튼 노출 (D-DC-02).
 *  3) MODIFICATION_REJECTED / CANCEL_REJECTED 상태에서 rejectionReason 안내 (빨강 배너).
 *  4) MODIFICATION_REQUESTED / CANCEL_REQUESTED 상태에서 "회신 대기" 안내 (보라 배너).
 *  5) MODIFICATION_ACCEPTED 상태에서 "수정 가능 (편집 모드)" 안내 (녹색 배너).
 *
 * UUID 비공개:
 *  - 사용자 노출 = taskCode / slipNo / partnerCode / partnerName / driverCode / driverName / driverPhoneNumber / vehiclePlateNumber.
 *  - taskId / groupId / slipId UUID 는 API path 와 dialog 호출에만 사용.
 *
 * accessibility:
 *  - aria-label 한국어 풀네임 ("배차 작업 2026/05/14-1 상세").
 *  - Modal (design-system) 의 focus trap + ESC 닫기 + 한국어 닫기 라벨 활용.
 */
import { useState, type FormEvent } from 'react'
import { Button, Input, Modal } from '@samhan/design-system'
import {
  DISPATCH_TASK_STATUS_LABEL,
  MANUAL_MATCHED_DRIVER_SOURCE_OPTIONS,
  MATCHED_DRIVER_SOURCE_LABEL,
  formatDispatchVehicleGroupLabel,
  type DispatchTaskResponse,
  type MatchedDriverSource,
  type SetMatchedDriverPayload,
} from '../../../api/dispatchTask'
import { ModificationRequestDialog } from './ModificationRequestDialog'
import { CancellationRequestDialog } from './CancellationRequestDialog'
import { DispatchCommentThread } from './DispatchCommentThread'
import { usePermissions } from '../../../hooks/usePermissions'
import {
  useMarkManualDispatchCompleteMutation,
  useSetMatchedDriverMutation,
  useStartRedispatchMutation,
} from '../hooks/useDispatchTask'

interface DispatchTaskDetailModalProps {
  task: DispatchTaskResponse
  onClose: () => void
  readOnly?: boolean
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
      '수정 수락됨 — 편집 모드 활성. 차량/전표 구성을 수정한 뒤 [배차 완료] 를 다시 누르세요.',
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

type MatchedDriverFormErrors = Partial<Record<keyof SetMatchedDriverPayload, string>>
type MatchedDriverFormTouched = Partial<Record<keyof SetMatchedDriverPayload, boolean>>

const PHONE_PATTERN = /^[0-9+\-\s()]{7,20}$/

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

export function DispatchTaskDetailModal({
  task,
  onClose,
  readOnly = false,
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
  const { canAccess } = usePermissions()
  const setMatchedDriverMutation = useSetMatchedDriverMutation(task.id)
  const manualCompleteMutation = useMarkManualDispatchCompleteMutation(task.id)
  const startRedispatchMutation = useStartRedispatchMutation(task.id)
  const matchedDriverFormErrors = validateMatchedDriverForm(matchedDriverForm)
  const hasMatchedDriverFormErrors =
    Object.keys(matchedDriverFormErrors).length > 0
  const visibleMatchedDriverFormErrors = Object.fromEntries(
    Object.entries(matchedDriverFormErrors).filter(([key]) =>
      matchedDriverSubmitAttempted ||
      matchedDriverFormTouched[key as keyof SetMatchedDriverPayload],
    ),
  ) as MatchedDriverFormErrors

  const showRequestButtons =
    !readOnly && task.status === 'DISPATCHED' && canAccess('dispatch.board', 'update')
  const showRedispatchButton =
    !readOnly && task.status === 'MODIFICATION_ACCEPTED' && canAccess('dispatch.board', 'update')
  const canEditMatchedDriver = canAccess('dispatch.board', 'update')
  const banner = STATUS_BANNER_STYLE[task.status]
  const totalSlips = task.vehicleGroups.reduce((s, g) => s + g.slips.length, 0)

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

  const updateMatchedDriverForm = (
    key: keyof SetMatchedDriverPayload,
    value: string,
  ) => {
    setMatchedDriverForm((current) => ({
      ...current,
      [key]: key === 'driverSource' ? value as MatchedDriverSource : value,
    }))
    setMatchedDriverFormTouched((current) => ({ ...current, [key]: true }))
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
          driverSource: matchedDriverForm.driverSource.trim() as MatchedDriverSource,
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
        description={`${task.dispatchDate} · 차량 ${task.vehicleGroups.length}대 · 전표 ${totalSlips}건`}
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
                onClick={() => startRedispatchMutation.mutate()}
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
            </dl>
          </section>

          {/* 차량 그룹 + 정차 list */}
          <section>
            <h4 style={{ margin: '4px 0', fontSize: 13, fontWeight: 600 }}>
              차량 그룹 ({task.vehicleGroups.length}대)
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
                  const matched = matchedByGroup.get(g.sequence) ?? null
                  const matchedDriverCodeLabel =
                    matched?.driverCode === 'MANUAL'
                      ? MATCHED_DRIVER_SOURCE_LABEL[matched.driverSource]
                      : matched?.driverCode
                  const vehicleLabel = formatDispatchVehicleGroupLabel(g)
                  const canManualComplete =
                    canEditMatchedDriver &&
                    g.dispatchStatus === 'PENDING' &&
                    matched?.driverCode === 'MANUAL' &&
                    matched.driverSource !== 'AROLOGIS'
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
                          gap: 8,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        <span>
                          {vehicleLabel} #{g.sequence}
                        </span>
                        <span
                          style={{
                            fontWeight: 400,
                            color: 'var(--color-neutral-500)',
                          }}
                        >
                          ({g.slips.length}건)
                        </span>
                        {matched ? (
                          <span
                            style={{
                              marginLeft: 'auto',
                              fontSize: 11,
                              color: 'var(--color-success-700, #047857)',
                            }}
                          >
                            기사 {matched.driverName} ({matchedDriverCodeLabel}){' '}
                            {matched.driverPhoneNumber?.trim() || '-'} · 차량번호{' '}
                            {matched.vehiclePlateNumber?.trim() || '-'}
                          </span>
                        ) : null}
                        {canEditMatchedDriver ? (
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
                        {canManualComplete ? (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => manualCompleteMutation.mutate(g.id)}
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
                          {g.slips.map((row) => (
                            <li
                              key={row.id}
                              style={{
                                display: 'flex',
                                gap: 8,
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
                              <span style={{ fontWeight: 600 }}>
                                {row.slip.slipNo}
                              </span>
                              <span style={{ flex: 1 }}>
                                {row.slip.partnerName}
                              </span>
                            </li>
                          ))}
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

          <DispatchCommentThread taskId={task.id} readOnly={readOnly} />
        </div>
      </Modal>

      {/* 수정 요청 dialog */}
      {modificationOpen ? (
        <ModificationRequestDialog
          taskId={task.id}
          taskCode={task.taskCode}
          onClose={() => setModificationOpen(false)}
          onSubmitted={() => {
            setModificationOpen(false)
            onClose()
          }}
        />
      ) : null}

      {/* 취소 요청 dialog */}
      {cancellationOpen ? (
        <CancellationRequestDialog
          taskId={task.id}
          taskCode={task.taskCode}
          onClose={() => setCancellationOpen(false)}
          onSubmitted={() => {
            setCancellationOpen(false)
            onClose()
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
                onChange={(e) => updateMatchedDriverForm('driverName', e.currentTarget.value)}
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
                  updateMatchedDriverForm('vehiclePlateNumber', e.currentTarget.value)
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
                  updateMatchedDriverForm('driverPhoneNumber', e.currentTarget.value)
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
              <select
                value={matchedDriverForm.driverSource}
                onChange={(e) => updateMatchedDriverForm('driverSource', e.currentTarget.value)}
                required
                aria-invalid={visibleMatchedDriverFormErrors.driverSource ? true : undefined}
                aria-describedby={
                  visibleMatchedDriverFormErrors.driverSource
                    ? 'matched-driver-driver-source-error'
                    : undefined
                }
                data-testid="matched-driver-driver-source"
                style={{
                  padding: '8px 10px',
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 4,
                  fontSize: 13,
                }}
              >
                {MANUAL_MATCHED_DRIVER_SOURCE_OPTIONS.map((source) => (
                  <option key={source} value={source}>
                    {MATCHED_DRIVER_SOURCE_LABEL[source]}
                  </option>
                ))}
              </select>
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
