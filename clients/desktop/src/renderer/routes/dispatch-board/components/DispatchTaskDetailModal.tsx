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
 *  - 사용자 노출 = taskCode / slipNumber / partnerCode / partnerName / driverCode / driverName / driverPhoneNumber.
 *  - taskId / groupId / slipId UUID 는 API path 와 dialog 호출에만 사용.
 *
 * accessibility:
 *  - aria-label 한국어 풀네임 ("배차 작업 DT-... 상세").
 *  - Modal (design-system) 의 focus trap + ESC 닫기 + 한국어 닫기 라벨 활용.
 */
import { useState } from 'react'
import { Modal } from '@samhan/design-system'
import {
  canRequestModificationOrCancel,
  DISPATCH_TASK_STATUS_LABEL,
  DISPATCH_VEHICLE_TYPE_LABEL,
  type DispatchTaskResponse,
} from '../../../api/dispatchTask'
import { ModificationRequestDialog } from './ModificationRequestDialog'
import { CancellationRequestDialog } from './CancellationRequestDialog'

interface DispatchTaskDetailModalProps {
  task: DispatchTaskResponse
  onClose: () => void
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
      '수정 수락됨 — 편집 모드 활성. 차량/슬립 구성을 수정한 뒤 [배차 완료] 를 다시 누르세요.',
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
    label: '배차 취소 완료 — 매핑된 슬립은 미배차 상태로 복귀했습니다.',
  },
}

export function DispatchTaskDetailModal({
  task,
  onClose,
}: DispatchTaskDetailModalProps) {
  const [modificationOpen, setModificationOpen] = useState(false)
  const [cancellationOpen, setCancellationOpen] = useState(false)

  const showRequestButtons = canRequestModificationOrCancel(task.status)
  const banner = STATUS_BANNER_STYLE[task.status]
  const totalSlips = task.vehicleGroups.reduce((s, g) => s + g.slips.length, 0)

  // matchedDrivers 를 그룹 sequence 로 dict 화 (그룹 헤더 inline 노출).
  const matchedByGroup = new Map(
    task.matchedDrivers.map((d) => [d.vehicleGroupSequence, d] as const),
  )

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`배차 작업 ${task.taskCode}`}
        description={`${task.dispatchDate} · 차량 ${task.vehicleGroups.length}대 · 슬립 ${totalSlips}건`}
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
                <button
                  type="button"
                  onClick={() => setModificationOpen(true)}
                  data-testid="dispatch-task-detail-request-modification"
                  aria-label={`배차 작업 ${task.taskCode} 수정 요청 발송`}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--color-purple-600, #7C3AED)',
                    color: 'var(--color-neutral-0)',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  ✏ 수정 요청
                </button>
                <button
                  type="button"
                  onClick={() => setCancellationOpen(true)}
                  data-testid="dispatch-task-detail-request-cancellation"
                  aria-label={`배차 작업 ${task.taskCode} 취소 요청 발송`}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--color-danger-600, #DC2626)',
                    color: 'var(--color-neutral-0)',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  ✗ 취소 요청
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              data-testid="dispatch-task-detail-close"
              style={{
                padding: '8px 16px',
                background: 'var(--color-neutral-100)',
                color: 'var(--color-neutral-800)',
                border: '1px solid var(--color-neutral-200)',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              닫기
            </button>
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
                          {DISPATCH_VEHICLE_TYPE_LABEL[g.vehicleType]} #
                          {g.sequence}
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
                            기사 {matched.driverName} ({matched.driverCode}){' '}
                            {matched.driverPhoneNumber}
                          </span>
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
                              key={row.slip.id}
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
                                {row.slip.slipNumber}
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
    </>
  )
}
