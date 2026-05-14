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

export type DispatchTaskStatus = 'DRAFT' | 'DISPATCHING' | 'DISPATCHED' | 'FAILED';
export const DISPATCH_TASK_STATUS_LABEL: Record<DispatchTaskStatus, string> = {
  DRAFT: '작성 중',
  DISPATCHING: '발송 완료, 매칭 대기',
  DISPATCHED: '배차 완료',
  FAILED: '배차 불가',
};

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
