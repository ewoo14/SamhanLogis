/**
 * DispatchTask react-query hook + mutations — Phase A FE-2.
 *
 * <p>Phase A 의 배차 보드 우측 컬럼 (차량 그룹) 의 단일 진실 source.
 * - 진입 시 빈 DispatchTask (DRAFT) 생성 → response 의 task UUID + taskCode 로 모든 후속 mutation 실행.
 * - 모든 mutation 성공 시 task query 를 invalidate 하여 그룹 / slip / status 를 재조회.
 *
 * 차량 그룹 / slip 할당 / 순서 / 배차 완료 mutation 일관 처리.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PageResponse } from '../../../api/client'
import {
  addVehicleGroup,
  assignSlipToGroup,
  createDispatchTask,
  deleteVehicleGroup,
  dispatchToArologis,
  getDispatchTask,
  getDispatchTasks,
  removeSlipFromGroup,
  reorderGroupSlips,
  requestCancellation,
  requestModification,
  setMatchedDriver,
  type ListDispatchTasksParams,
  type DispatchTaskResponse,
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
 * <p>배차현황 상세는 arologisDispatchId 로도 열리므로 성공 응답을 두 detail key 에 모두 반영한다.
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
      if (updated.arologisDispatchId) {
        void qc.invalidateQueries({ queryKey: dispatchTaskQueryKey(updated.arologisDispatchId) })
      }
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
    onSuccess: (created, vars) => {
      const applyAssignedSlip = (current: DispatchTaskResponse | undefined) => {
        if (!current) return current
        const vehicleGroups = current.vehicleGroups.map((group) =>
          group.id === vars.groupId
            ? {
                ...group,
                slips: group.slips.some((row) => row.id === created.id)
                  ? group.slips
                  : [...group.slips, created],
              }
            : group,
        )
        const slipCounts = new Map<string, number>()
        for (const row of vehicleGroups.flatMap((group) => group.slips)) {
          slipCounts.set(row.slipId, (slipCounts.get(row.slipId) ?? 0) + 1)
        }
        return {
          ...current,
          vehicleGroups,
          duplicateSlipIds: [...slipCounts.entries()]
            .filter(([, count]) => count > 1)
            .map(([slipId]) => slipId),
        }
      }
      qc.setQueryData<DispatchTaskResponse | undefined>(
        dispatchTaskQueryKey(taskId),
        applyAssignedSlip,
      )
      qc.setQueriesData<DispatchTaskResponse | undefined>(
        { queryKey: ['dispatchTask'] },
        applyAssignedSlip,
      )
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
 * Phase C — 수정 요청 mutation (DISPATCHED → MODIFICATION_REQUESTED).
 *
 * <p>plan FE F2.1. 성공 시 task query invalidate → 상태 배지 즉시 보라색으로 갱신.
 */
export function useRequestModificationMutation(taskId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) => requestModification(taskId as string, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dispatchTaskQueryKey(taskId) })
    },
  })
}

/**
 * Phase C — 취소 요청 mutation (DISPATCHED → CANCEL_REQUESTED).
 *
 * <p>plan FE F2.1. 성공 시 task query invalidate.
 */
export function useRequestCancellationMutation(taskId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) => requestCancellation(taskId as string, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dispatchTaskQueryKey(taskId) })
    },
  })
}
