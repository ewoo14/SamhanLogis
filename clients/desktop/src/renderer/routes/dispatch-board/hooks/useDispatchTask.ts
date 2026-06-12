/**
 * DispatchTask react-query hook + mutations — Phase A FE-2.
 *
 * <p>Phase A 의 배차 보드 우측 컬럼 (차량 그룹) 의 단일 진실 source.
 * - 진입 시 빈 DispatchTask (DRAFT) 생성 → response 의 task UUID + taskCode 로 모든 후속 mutation 실행.
 * - 모든 mutation 성공 시 task query 를 invalidate 하여 그룹 / slip / status 를 재조회.
 *
 * 차량 그룹 / slip 할당 / 순서 / 배차 완료 mutation 일관 처리.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { PageResponse } from '../../../api/client'
import {
  addVehicleGroup,
  assignSlipToGroup,
  createDispatchTask,
  deleteVehicleGroup,
  dispatchToArologis,
  ensureTodayDraftTask,
  getDispatchTask,
  getDispatchTasks,
  markManualDispatchComplete,
  removeSlipFromGroup,
  reorderGroupSlips,
  requestCancellation,
  requestModification,
  setMatchedDriver,
  startRedispatch,
  type ListDispatchTasksParams,
  type DispatchTaskResponse,
  type DispatchTaskSlimResponse,
  type DispatchTaskSummaryResponse,
  type AddVehicleGroupPayload,
  type SetMatchedDriverPayload,
} from '../../../api/dispatchTask'
import { DISPATCH_BOARD_QUERY_KEY } from './useUnDispatchedSlipsQuery'

/**
 * DispatchTask 단건 query key factory.
 */
export const dispatchTaskQueryKey = (taskId: string | null) =>
  ['dispatchTask', taskId] as const

export const DISPATCH_TASK_LOCAL_MUTATION_EVENT = 'samhan-dispatch-task-local-mutation'

/**
 * BE 슬림 mutation ack 를 모든 상세 cache 에 병합한다.
 *
 * <p>배차현황 상세와 보드는 task UUID 를 query key 로 쓴다.
 * 슬림 응답(BE {@code DispatchTaskResponse.from}) 은 {@code vehicleGroups}/{@code matchedDrivers}
 * 가 없어 그대로 setQueryData 하면 상세 화면이 깨지므로, cached 상세에 슬림 필드만 덮어쓴다.
 * {@code transform} 으로 그룹/slip 상태 파생 갱신(재배차 reset 등)을 함께 적용할 수 있다.
 */
function mergeSlimTaskIntoDetailCaches(
  qc: QueryClient,
  updated: DispatchTaskSlimResponse,
  transform?: (merged: DispatchTaskResponse) => DispatchTaskResponse,
) {
  qc.setQueriesData<DispatchTaskResponse>({ queryKey: ['dispatchTask'] }, (cached) => {
    if (!cached || cached.id !== updated.id) return cached
    const merged: DispatchTaskResponse = {
      ...cached,
      status: updated.status,
      arologisDispatchId: updated.arologisDispatchId,
      failureReason: updated.failureReason,
      modificationReason: updated.modificationReason ?? null,
      rejectionReason: updated.rejectionReason ?? null,
      modificationRequestedAt: updated.modificationRequestedAt ?? null,
      modificationDecidedAt: updated.modificationDecidedAt ?? null,
    }
    return transform ? transform(merged) : merged
  })
}

/**
 * 재배차 시작 ack 파생 갱신 — DRAFT 복귀에 맞춰 발송 그룹을 PENDING 으로, 매핑 전표를
 * UNDISPATCHED 로 되돌리고 매칭 기사 표시를 비운다 (BE 동작과 동일한 즉시 반영).
 */
function resetGroupsForRedispatch(merged: DispatchTaskResponse): DispatchTaskResponse {
  return {
    ...merged,
    matchedDrivers: [],
    vehicleGroups: merged.vehicleGroups.map((group) =>
      group.dispatchStatus === 'DISPATCHED'
        ? {
            ...group,
            dispatchStatus: 'PENDING' as const,
            slips: group.slips.map((row) => ({
              ...row,
              slip: { ...row.slip, dispatchStatus: 'UNDISPATCHED' },
            })),
          }
        : group,
    ),
  }
}

/**
 * DispatchTask 단건 query — taskId 가 null/undefined 면 disabled.
 */
export function useDispatchTaskQuery(taskId: string | null) {
  return useQuery<DispatchTaskResponse>({
    queryKey: dispatchTaskQueryKey(taskId),
    queryFn: () => getDispatchTask(taskId as string),
    enabled: !!taskId,
  })
}

/**
 * 완료배차 내역 목록 query.
 */
export function useDispatchTasksQuery(params: ListDispatchTasksParams) {
  return useQuery<PageResponse<DispatchTaskSummaryResponse>>({
    queryKey: ['dispatchTasks', params],
    queryFn: () => getDispatchTasks(params),
  })
}

/**
 * 빈 DispatchTask (DRAFT) 생성 mutation — 배차 보드 진입 시 1회 호출.
 */
export function useCreateDispatchTaskMutation() {
  return useMutation({
    mutationFn: (dispatchDate: string) => createDispatchTask(dispatchDate),
  })
}

/**
 * 오늘의 미발송 DRAFT 보장 mutation — 보드 mount/F5 재진입 전용.
 */
export function useEnsureTodayDraftTaskMutation() {
  return useMutation({
    mutationFn: (dispatchDate: string) => ensureTodayDraftTask(dispatchDate),
  })
}

/**
 * 차량 그룹 추가 mutation. 성공 시 task query invalidate.
 */
export function useAddVehicleGroupMutation(taskId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: AddVehicleGroupPayload) =>
      addVehicleGroup(taskId as string, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dispatchTaskQueryKey(taskId) })
    },
  })
}

/**
 * 차량 그룹 삭제 mutation — 비어 있는 그룹만 BE 가 허용.
 */
export function useDeleteVehicleGroupMutation(taskId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (groupId: string) => deleteVehicleGroup(taskId as string, groupId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dispatchTaskQueryKey(taskId) })
    },
  })
}

/**
 * 타사 기사/차량 수동 기입 mutation.
 *
 * <p>상세 query key 는 task UUID 를 기준으로 한다. 기존 arologisDispatchId key cache 가 남아 있을 수
 * 있어 성공 응답은 legacy key 에도 반영하되, refetch/invalidate 는 task UUID 로 수렴시킨다.
 */
export function useSetMatchedDriverMutation(taskId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      groupId,
      payload,
    }: {
      groupId: string
      payload: SetMatchedDriverPayload
    }) => setMatchedDriver(taskId as string, groupId, payload),
    onSuccess: (updated) => {
      qc.setQueryData(dispatchTaskQueryKey(updated.id), updated)
      if (updated.arologisDispatchId) {
        qc.setQueryData(dispatchTaskQueryKey(updated.arologisDispatchId), updated)
      }
      void qc.invalidateQueries({ queryKey: dispatchTaskQueryKey(updated.id) })
      void qc.invalidateQueries({ queryKey: ['dispatchTasks'] })
    },
  })
}

/**
 * 타사 수동 발송완료 mutation.
 */
export function useMarkManualDispatchCompleteMutation(taskId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (groupId: string) => markManualDispatchComplete(taskId as string, groupId),
    onSuccess: (updated) => {
      qc.setQueryData(dispatchTaskQueryKey(updated.id), updated)
      if (updated.arologisDispatchId) {
        qc.setQueryData(dispatchTaskQueryKey(updated.arologisDispatchId), updated)
      }
      void qc.invalidateQueries({ queryKey: dispatchTaskQueryKey(updated.id) })
      void qc.invalidateQueries({ queryKey: DISPATCH_BOARD_QUERY_KEY })
      void qc.invalidateQueries({ queryKey: ['dispatchTasks'] })
    },
  })
}

/**
 * slip 그룹 할당 mutation — drag-and-drop drop 시 호출.
 *
 * <p>성공 시 task query + 미배차 전표 query 양쪽 invalidate (UNDISPATCHED → DISPATCHING 상태 변화).
 */
export function useAssignSlipToGroupMutation(taskId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, slipId }: { groupId: string; slipId: string }) =>
      assignSlipToGroup(taskId as string, groupId, slipId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dispatchTaskQueryKey(taskId) })
      void qc.invalidateQueries({ queryKey: DISPATCH_BOARD_QUERY_KEY })
      window.dispatchEvent(new CustomEvent(DISPATCH_TASK_LOCAL_MUTATION_EVENT))
    },
  })
}

/**
 * 그룹 안 slip 순서 변경 mutation — sortable drop 시 호출.
 */
export function useReorderGroupSlipsMutation(taskId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      groupId,
      orderedSlipIds,
    }: {
      groupId: string
      orderedSlipIds: string[]
    }) => reorderGroupSlips(taskId as string, groupId, orderedSlipIds),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dispatchTaskQueryKey(taskId) })
    },
  })
}

/**
 * 그룹에서 slip 제거 mutation — `[×]` 버튼 클릭.
 */
export function useRemoveSlipFromGroupMutation(taskId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, slipId }: { groupId: string; slipId: string }) =>
      removeSlipFromGroup(taskId as string, groupId, slipId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dispatchTaskQueryKey(taskId) })
      void qc.invalidateQueries({ queryKey: DISPATCH_BOARD_QUERY_KEY })
    },
  })
}

/**
 * 배차 완료 mutation — `[✓ 배차 완료]` 버튼 + 확인 dialog 후 호출.
 *
 * <p>성공 시 task → DISPATCHING 으로 갱신, arologis 회신 후 DISPATCHED 전이.
 */
export function useDispatchToArologisMutation(taskId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (groupIds?: string[]) => dispatchToArologis(taskId as string, groupIds),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dispatchTaskQueryKey(taskId) })
      void qc.invalidateQueries({ queryKey: DISPATCH_BOARD_QUERY_KEY })
    },
  })
}

/**
 * Phase C — 재배차 시작 mutation (MODIFICATION_ACCEPTED → DRAFT).
 *
 * <p>BE ack 는 슬림 응답이므로 상세 cache 에 병합해 DRAFT + 그룹 PENDING + slip UNDISPATCHED 를
 * 즉시 반영한다 (Option A — 배차현황 상세에서 재배차 진입). 재배차 후 arologisDispatchId 는 null
 * 이므로 invalidate 는 task UUID key 만 수행한다.
 */
export function useStartRedispatchMutation(taskId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => {
      if (!taskId) {
        return Promise.reject(new Error('배차 작업을 먼저 선택하세요.'))
      }
      return startRedispatch(taskId)
    },
    onSuccess: (updated) => {
      mergeSlimTaskIntoDetailCaches(qc, updated, resetGroupsForRedispatch)
      void qc.invalidateQueries({ queryKey: dispatchTaskQueryKey(updated.id) })
      void qc.invalidateQueries({ queryKey: DISPATCH_BOARD_QUERY_KEY })
      void qc.invalidateQueries({ queryKey: ['dispatchTasks'] })
    },
  })
}

/**
 * Phase C — 수정 요청 mutation (DISPATCHED → MODIFICATION_REQUESTED).
 *
 * <p>plan FE F2.1. 슬림 ack 를 상세 cache (보드/배차현황 양쪽 key) 에 병합해 상태 배지·배너를
 * 즉시 갱신하고, 배차현황 목록(DISPATCHED 필터) 도 invalidate 한다.
 */
export function useRequestModificationMutation(taskId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) => requestModification(taskId as string, reason),
    onSuccess: (updated) => {
      mergeSlimTaskIntoDetailCaches(qc, updated)
      void qc.invalidateQueries({ queryKey: dispatchTaskQueryKey(updated.id) })
      void qc.invalidateQueries({ queryKey: ['dispatchTasks'] })
    },
  })
}

/**
 * Phase C — 취소 요청 mutation (DISPATCHED → CANCEL_REQUESTED).
 *
 * <p>plan FE F2.1. 슬림 ack 를 상세 cache 에 병합 + 배차현황 목록 invalidate.
 */
export function useRequestCancellationMutation(taskId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) => requestCancellation(taskId as string, reason),
    onSuccess: (updated) => {
      mergeSlimTaskIntoDetailCaches(qc, updated)
      void qc.invalidateQueries({ queryKey: dispatchTaskQueryKey(updated.id) })
      void qc.invalidateQueries({ queryKey: ['dispatchTasks'] })
    },
  })
}
