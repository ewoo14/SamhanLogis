/**
 * 배차 메뉴 (Samhan Public Phase A) mobile-staff API client — FE-F6.
 *
 * 출처 (BE Phase A Team):
 *   - slip-service GET /admin/dispatch-board/undispatched-slips?from=&to=&statuses=&page=&size=
 *   - slip-service POST /admin/dispatch-tasks
 *   - slip-service POST /admin/dispatch-tasks/{taskId}/vehicle-groups
 *   - slip-service DELETE /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}
 *   - slip-service POST /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips
 *   - slip-service DELETE /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips/{slipId}
 *   - slip-service POST /admin/dispatch-tasks/{taskId}/dispatch
 *   - slip-service GET /admin/dispatch-tasks/{taskId}
 *
 * @PreAuthorize: DISPATCH / MANAGER / MASTER (BE 와 1:1).
 *
 * UUID 비공개:
 *   - 화면 표시 = slipNumber / partnerCode / partnerName / taskCode / driverCode / driverName.
 *   - id (slip / task / group UUID) 는 API path 와 React state 내부 이동에만 사용.
 *
 * 통신 패턴:
 *   - sales API client 와 동일 (ApiResponse wrapper assert + Bearer JWT + 한국어 에러 메시지).
 *   - desktop axios + react-query 패턴을 RN fetch 로 직역.
 */

import { API_BASE_URL, assertApiResponseSuccess, SalesApiError } from './salesUtils';

// ---------------------------------------------------------------------------
// 9 차량 종류 (active) — desktop dispatchTask.ts 와 동등 (legacy 2 제외).
// ---------------------------------------------------------------------------

export type DispatchVehicleType =
  | 'MOTORCYCLE'
  | 'DAMAS'
  | 'TONNAGE_1'
  | 'TONNAGE_1_5'
  | 'TONNAGE_2_5'
  | 'TONNAGE_3'
  | 'TONNAGE_5'
  | 'TONNAGE_10'
  | 'TONNAGE_20';

export const DISPATCH_VEHICLE_TYPE_LABEL: Record<DispatchVehicleType, string> = {
  MOTORCYCLE: '오토바이',
  DAMAS: '다마스',
  TONNAGE_1: '1톤',
  TONNAGE_1_5: '1.5톤',
  TONNAGE_2_5: '2.5톤',
  TONNAGE_3: '3톤',
  TONNAGE_5: '5톤',
  TONNAGE_10: '10톤',
  TONNAGE_20: '20톤',
};

export const DISPATCH_VEHICLE_TYPE_OPTIONS: DispatchVehicleType[] = [
  'MOTORCYCLE', 'DAMAS', 'TONNAGE_1', 'TONNAGE_1_5', 'TONNAGE_2_5',
  'TONNAGE_3', 'TONNAGE_5', 'TONNAGE_10', 'TONNAGE_20',
];

export type SlipDispatchStatus = 'UNDISPATCHED' | 'DISPATCHING' | 'DISPATCHED';
export const SLIP_DISPATCH_STATUS_LABEL: Record<SlipDispatchStatus, string> = {
  UNDISPATCHED: '미배차',
  DISPATCHING: '발송 완료, 매칭 대기',
  DISPATCHED: '배차 완료',
};

/**
 * DispatchTask 11 상태 — Phase A 4 + Phase C 7 (6 신규 + CANCELLED).
 *
 * <p>spec docs/superpowers/specs/2026-05-14-samhan-dispatch-modification-design.md § 4.1.
 * desktop dispatchTask.ts 와 1:1.
 */
export type DispatchTaskStatus =
  | 'DRAFT'
  | 'DISPATCHING'
  | 'DISPATCHED'
  | 'FAILED'
  | 'MODIFICATION_REQUESTED'
  | 'MODIFICATION_ACCEPTED'
  | 'MODIFICATION_REJECTED'
  | 'CANCEL_REQUESTED'
  | 'CANCEL_ACCEPTED'
  | 'CANCEL_REJECTED'
  | 'CANCELLED';

export const DISPATCH_TASK_STATUS_LABEL: Record<DispatchTaskStatus, string> = {
  DRAFT: '작성 중',
  DISPATCHING: '발송 완료, 매칭 대기',
  DISPATCHED: '배차 완료',
  FAILED: '배차 불가',
  MODIFICATION_REQUESTED: '수정 요청 중',
  MODIFICATION_ACCEPTED: '수정 수락됨 — 데스크톱 배차현황에서 재배차',
  MODIFICATION_REJECTED: '수정 거부됨',
  CANCEL_REQUESTED: '취소 요청 중',
  CANCEL_ACCEPTED: '취소 수락됨',
  CANCEL_REJECTED: '취소 거부됨',
  CANCELLED: '배차 취소 완료',
};

/**
 * 모바일 편집/발송 가능 상태 — DRAFT 만.
 *
 * <p>재배차(MODIFICATION_ACCEPTED → 재발송)는 개발책임자 결정(Option A)으로 데스크톱
 * 배차현황에서만 수행한다. 모바일에는 배차현황·[재배차 시작] 진입점이 없고, BE 는
 * MODIFICATION_ACCEPTED 직접 발송을 409 로 차단하므로, 모바일에서는 본 상태를 편집/발송
 * 불가로 두어 막다른 [배차 완료] 흐름을 제거한다 (Round D 적발 보정).
 */
export function isEditableStatus(status: DispatchTaskStatus): boolean {
  return status === 'DRAFT';
}

/**
 * DISPATCHED 상태에서만 [수정 요청] / [취소 요청] 버튼 활성 (D-DC-02).
 */
export function canRequestModificationOrCancel(status: DispatchTaskStatus): boolean {
  return status === 'DISPATCHED';
}

// ---------------------------------------------------------------------------
// 응답 타입 — BE record 1:1.
// ---------------------------------------------------------------------------

export interface SlipBoardResponse {
  id: string;
  slipNumber: string;
  partnerCode: string;
  partnerName: string;
  address: string;
  recipientPhoneNumber: string;
  notes: string;
  createdAt: string;
  dispatchStatus: SlipDispatchStatus;
}

export interface DispatchVehicleGroupSlipResponse {
  slip: SlipBoardResponse;
  sequence: number;
}

export interface MatchedDriverResponse {
  vehicleGroupSequence: number;
  vehicleType: DispatchVehicleType;
  driverCode: string;
  driverName: string;
  driverPhoneNumber: string;
  source: string;
}

export interface DispatchVehicleGroupResponse {
  id: string;
  sequence: number;
  vehicleType: DispatchVehicleType;
  slips: DispatchVehicleGroupSlipResponse[];
}

export interface DispatchTaskResponse {
  id: string;
  taskCode: string;
  dispatchDate: string;
  status: DispatchTaskStatus;
  vehicleGroups: DispatchVehicleGroupResponse[];
  matchedDrivers: MatchedDriverResponse[];
  failureReason: string | null;
  /** Phase C — 수정/취소 요청 시점 사용자 입력 사유. */
  modificationReason?: string | null;
  /** Phase C — 아로로지스 거부 시점 사유. */
  rejectionReason?: string | null;
  modificationRequestedAt?: string | null;
  modificationDecidedAt?: string | null;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
}

// ---------------------------------------------------------------------------
// 공통 fetch helper.
// ---------------------------------------------------------------------------

async function authedFetch(
  token: string | null,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.headers) {
    Object.assign(headers, init.headers as Record<string, string>);
  }
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    throw new SalesApiError(res.status, `${path} HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// 미배차 슬립 조회.
// ---------------------------------------------------------------------------

export interface ListUnDispatchedSlipsParams {
  from?: string;
  to?: string;
  statuses?: SlipDispatchStatus[];
  page?: number;
  size?: number;
}

export async function listUnDispatchedSlips(
  token: string | null,
  params: ListUnDispatchedSlipsParams,
): Promise<PageResponse<SlipBoardResponse>> {
  const sp = new URLSearchParams();
  if (params.from) sp.set('from', params.from);
  if (params.to) sp.set('to', params.to);
  if (params.statuses && params.statuses.length > 0) sp.set('statuses', params.statuses.join(','));
  sp.set('page', String(params.page ?? 0));
  sp.set('size', String(params.size ?? 50));
  const json = await authedFetch(token, `/admin/dispatch-board/undispatched-slips?${sp.toString()}`);
  assertApiResponseSuccess(json, 'undispatched-slips');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json as any).data as PageResponse<SlipBoardResponse>;
}

// ---------------------------------------------------------------------------
// DispatchTask CRUD.
// ---------------------------------------------------------------------------

export async function createDispatchTask(
  token: string | null,
  dispatchDate: string,
): Promise<DispatchTaskResponse> {
  const json = await authedFetch(token, '/admin/dispatch-tasks', {
    method: 'POST',
    body: JSON.stringify({ dispatchDate }),
  });
  assertApiResponseSuccess(json, 'create-dispatch-task');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json as any).data as DispatchTaskResponse;
}

export async function getDispatchTask(
  token: string | null,
  taskId: string,
): Promise<DispatchTaskResponse> {
  const json = await authedFetch(token, `/admin/dispatch-tasks/${taskId}`);
  assertApiResponseSuccess(json, 'get-dispatch-task');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json as any).data as DispatchTaskResponse;
}

export async function addVehicleGroup(
  token: string | null,
  taskId: string,
  vehicleType: DispatchVehicleType,
): Promise<DispatchVehicleGroupResponse> {
  const json = await authedFetch(token, `/admin/dispatch-tasks/${taskId}/vehicle-groups`, {
    method: 'POST',
    body: JSON.stringify({ vehicleType }),
  });
  assertApiResponseSuccess(json, 'add-vehicle-group');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json as any).data as DispatchVehicleGroupResponse;
}

export async function deleteVehicleGroup(
  token: string | null,
  taskId: string,
  groupId: string,
): Promise<void> {
  await authedFetch(token, `/admin/dispatch-tasks/${taskId}/vehicle-groups/${groupId}`, {
    method: 'DELETE',
  });
}

export async function assignSlipToGroup(
  token: string | null,
  taskId: string,
  groupId: string,
  slipId: string,
): Promise<void> {
  await authedFetch(token, `/admin/dispatch-tasks/${taskId}/vehicle-groups/${groupId}/slips`, {
    method: 'POST',
    body: JSON.stringify({ slipId }),
  });
}

export async function removeSlipFromGroup(
  token: string | null,
  taskId: string,
  groupId: string,
  slipId: string,
): Promise<void> {
  await authedFetch(
    token,
    `/admin/dispatch-tasks/${taskId}/vehicle-groups/${groupId}/slips/${slipId}`,
    { method: 'DELETE' },
  );
}

export async function dispatchToArologis(
  token: string | null,
  taskId: string,
): Promise<DispatchTaskResponse> {
  const json = await authedFetch(token, `/admin/dispatch-tasks/${taskId}/dispatch`, {
    method: 'POST',
  });
  assertApiResponseSuccess(json, 'dispatch-to-arologis');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json as any).data as DispatchTaskResponse;
}

// ---------------------------------------------------------------------------
// Phase C — 수정/취소 요청 (DISPATCHED 상태에서 활성).
// ---------------------------------------------------------------------------

/**
 * 수정 요청 발송 — `POST /admin/dispatch-tasks/{taskId}/modification-request`.
 * 호출 후 task.status = MODIFICATION_REQUESTED.
 */
export async function requestModification(
  token: string | null,
  taskId: string,
  reason: string,
): Promise<DispatchTaskResponse> {
  const json = await authedFetch(
    token,
    `/admin/dispatch-tasks/${taskId}/modification-request`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
  assertApiResponseSuccess(json, 'request-modification');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json as any).data as DispatchTaskResponse;
}

/**
 * 취소 요청 발송 — `POST /admin/dispatch-tasks/{taskId}/cancellation-request`.
 * 호출 후 task.status = CANCEL_REQUESTED.
 */
export async function requestCancellation(
  token: string | null,
  taskId: string,
  reason: string,
): Promise<DispatchTaskResponse> {
  const json = await authedFetch(
    token,
    `/admin/dispatch-tasks/${taskId}/cancellation-request`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
  assertApiResponseSuccess(json, 'request-cancellation');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json as any).data as DispatchTaskResponse;
}

// ---------------------------------------------------------------------------
// 일자 유틸 (Asia/Seoul 가정).
// ---------------------------------------------------------------------------

export function todayIsoSeoul(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function offsetIsoSeoul(baseIso: string, offsetDays: number): string {
  const d = new Date(baseIso + 'T00:00:00');
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
