/**
 * slip 수정 요청 (edit request) 도메인 API client — Phase 12 PR-H3 신규 (mobile-staff FE-2).
 *
 * 시나리오 — "권한 / 수락 / 거절 워크플로우" (ROADMAP.md PR-H3):
 *   - 영업직원 (SALES) 이 slip 작성 후 출고 단계로 진행한 뒤 수정이 필요한 경우, 창고 직원
 *     (WAREHOUSE) 의 명시적 수락 (또는 거절) 을 거쳐야 한다.
 *   - 본 client 는 (1) 영업직원이 수정 요청 발행, (2) 창고 직원이 PENDING 요청 list 조회,
 *     (3) 창고 직원이 수락 / 거절 처리 — 4 endpoint 를 제공한다.
 *
 * BE 계약 (parallel — endpoint 는 desktop FE-1 / mobile-staff FE-2 가 공유):
 *   - GET    `/slips/{slipId}/edit-requests`              — 단일 slip 의 요청 목록 (작성자 / 창고 모두 조회 가능)
 *   - POST   `/slips/{slipId}/edit-requests`              — 영업직원이 신규 수정 요청 (사유 포함)
 *   - POST   `/slips/{slipId}/edit-requests/{id}/approve` — 창고 직원이 수락 (수정 가능 상태로 전환)
 *   - POST   `/slips/{slipId}/edit-requests/{id}/reject`  — 창고 직원이 거절 (사유 포함)
 *   - GET    `/slips/edit-requests?status=PENDING`        — 창고 직원 모바일 화면용 — 모든 slip 의 PENDING 요청
 *
 * 권한 (BE 가드 — 미일치 시 403):
 *   - 요청 발행 = SALES (작성자 본인) + MASTER / MANAGER (관리자 대행).
 *   - 수락 / 거절 = WAREHOUSE + MASTER / MANAGER.
 *   - 조회 = 모든 ROLE (read-only).
 *
 * SSE 양방향 push (PR-H3 후속 — 본 client 는 endpoint 만, 구독은 SlipRealtimeClient):
 *   - 영업 → 창고: `slip.edit-request.created` (창고 직원 PENDING list 갱신)
 *   - 창고 → 영업: `slip.edit-request.approved` / `slip.edit-request.rejected`
 *
 * 인증:
 *   - JWT bearer (gateway 가 verify + ROLE 확인 + X-User-* 주입 후 slip-service 로 forward).
 *
 * UUID 비공개 (memory `feedback_uuid_no_user_visibility`):
 *   - slipId / requestId 는 path/POST body 만 — UI 노출 X.
 *   - 응답에 요청자 / 처리자 fullName + role 풀네임 표기 (UUID 미노출 가드).
 *   - slip 식별은 사용자 노출용 slipNo (비즈니스 식별자) 동반.
 *
 * fetch + ApiResponse wrapper 패턴은 `api/slipComment.ts` / `api/slipAudit.ts` 와 1:1 동등.
 */

import { API_BASE_URL } from './salesUtils';

// ----------------------------------------------------------------------
// 응답 타입 — BE SlipEditRequestResponse (Phase 12 PR-H3) 와 1:1.
// ----------------------------------------------------------------------

/**
 * 요청자 / 처리자 ROLE 풀네임 (사용자 명시 — feedback_role_naming_full.md).
 *
 * 약어 (M/M/D) 금지. PR/Issue/문서/UI 모두 풀네임 의무.
 */
export type SlipEditRequestActorRole =
  | 'MASTER'
  | 'MANAGER'
  | 'DIRECTOR'
  | 'SALES'
  | 'WAREHOUSE'
  | 'DRIVER'
  | 'ACCOUNTING';

/**
 * 요청 상태 — BE SlipEditRequestStatus enum 과 1:1.
 *
 * - PENDING: 영업직원이 발행, 창고 직원의 처리 대기.
 * - APPROVED: 창고 직원이 수락 — slip 수정 가능 상태로 전환됨.
 * - REJECTED: 창고 직원이 거절 — 사유 동반, slip 은 그대로 잠금 유지.
 * - CANCELLED: 영업직원 본인이 취소 (수락 전).
 */
export type SlipEditRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface SlipEditRequestResponse {
  /** 요청 식별자 — path/approve/reject 만, UI 미노출. */
  id: string;
  /** slip 식별자 — path 만, UI 미노출. */
  slipId: string;
  /** slip 번호 (사용자 노출 식별자, UUID 비공개 가드). */
  slipNo: string;
  /** 요청자 사용자 식별자 — UI 미노출. */
  requesterId: string;
  /** 요청자 이름 — UI 노출 (UUID 비공개 가드). */
  requesterFullName: string;
  /** 요청자 권한 풀네임 (보통 SALES). */
  requesterRole: SlipEditRequestActorRole;
  /** 요청 사유 (≤ 500자) — 영업직원이 작성, 창고 직원에게 노출. */
  reason: string;
  /** 요청 상태. */
  status: SlipEditRequestStatus;
  /** 처리자 (수락/거절) 사용자 식별자 — PENDING 시 null, UI 미노출. */
  resolverId: string | null;
  /** 처리자 이름 — PENDING 시 null. UI 노출. */
  resolverFullName: string | null;
  /** 처리자 권한 풀네임 — PENDING 시 null. */
  resolverRole: SlipEditRequestActorRole | null;
  /** 거절 사유 (≤ 500자) — REJECTED 시 동반, 그 외 null. */
  rejectionReason: string | null;
  /** ISO 8601 — 요청 시각. */
  createdAt: string;
  /** ISO 8601 — 처리 시각 (PENDING 시 null). */
  resolvedAt: string | null;
}

export interface CreateSlipEditRequest {
  /** 요청 사유 (≤ 500자). 빈 문자열 / 공백만 시 BE 가 400 반환. */
  reason: string;
}

export interface RejectSlipEditRequest {
  /** 거절 사유 (≤ 500자). 빈 문자열 / 공백만 시 BE 가 400 반환. */
  rejectionReason: string;
}

// ----------------------------------------------------------------------
// fetch helper — slipComment.ts / slipAudit.ts 패턴 1:1 일관.
// ----------------------------------------------------------------------

export class SlipEditRequestApiError extends Error {
  public readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SlipEditRequestApiError';
    this.status = status;
  }
}

function buildHeaders(token: string | null, withBody: boolean): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (withBody) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * ApiResponse wrapper schema assert (FE-2 채택 fix 일관 — silent fall-through 제거).
 *
 * BE ApiResponse: `{ success: boolean, data: T | null, code?: string, message?: string }`
 */
function assertSuccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any,
  endpointLabel: string,
): asserts json is { success: true; data: unknown; code?: string; message?: string } {
  if (json == null || typeof json !== 'object') {
    throw new SlipEditRequestApiError(
      0,
      `${endpointLabel} 응답 schema 위반 — body 가 객체가 아닙니다`,
    );
  }
  if (json.success !== true) {
    const code = typeof json.code === 'string' ? json.code : 'UNKNOWN';
    const message = typeof json.message === 'string' ? json.message : `${endpointLabel} 실패`;
    throw new SlipEditRequestApiError(
      0,
      `${endpointLabel} ApiResponse.success=false (code=${code}, message=${message})`,
    );
  }
}

// ----------------------------------------------------------------------
// API 함수 — 5 endpoint (request / approve / reject / list slip / list pending).
// ----------------------------------------------------------------------

/**
 * 영업직원이 신규 수정 요청 발행.
 *
 * BE 가드:
 *   - ROLE = SALES (작성자 본인) / MASTER / MANAGER 만 허용 (그 외 403).
 *   - 동일 slip 의 PENDING 요청이 이미 존재하면 409 (중복 방지).
 *   - reason 은 trim 후 1~500 자.
 */
export async function requestSlipEdit(
  token: string | null,
  slipId: string,
  body: CreateSlipEditRequest,
): Promise<SlipEditRequestResponse> {
  const trimmed = body.reason.trim();
  if (trimmed.length === 0) {
    throw new SlipEditRequestApiError(0, '수정 요청 사유가 비어 있습니다');
  }
  if (trimmed.length > 500) {
    throw new SlipEditRequestApiError(0, '수정 요청 사유는 500자 이하여야 합니다');
  }
  const url = `${API_BASE_URL}/slips/${encodeURIComponent(slipId)}/edit-requests`;
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(token, true),
    body: JSON.stringify({ reason: trimmed }),
  });
  if (!res.ok) {
    throw new SlipEditRequestApiError(res.status, `수정 요청 발행 실패 — HTTP ${res.status}`);
  }
  const json = await res.json();
  assertSuccess(json, '수정 요청 발행');
  return json.data as SlipEditRequestResponse;
}

/**
 * 창고 직원이 PENDING 요청 수락.
 *
 * BE 가드:
 *   - ROLE = WAREHOUSE / MASTER / MANAGER 만 허용 (그 외 403).
 *   - status != PENDING 시 409 (이미 처리됨).
 *   - 수락 후 slip 의 잠금이 해제되어 SALES 가 수정 가능.
 */
export async function approveSlipEdit(
  token: string | null,
  slipId: string,
  requestId: string,
): Promise<SlipEditRequestResponse> {
  const url = `${API_BASE_URL}/slips/${encodeURIComponent(slipId)}/edit-requests/${encodeURIComponent(
    requestId,
  )}/approve`;
  const res = await fetch(url, { method: 'POST', headers: buildHeaders(token, true) });
  if (!res.ok) {
    throw new SlipEditRequestApiError(res.status, `수정 요청 수락 실패 — HTTP ${res.status}`);
  }
  const json = await res.json();
  assertSuccess(json, '수정 요청 수락');
  return json.data as SlipEditRequestResponse;
}

/**
 * 창고 직원이 PENDING 요청 거절. 거절 사유 의무.
 *
 * BE 가드:
 *   - ROLE = WAREHOUSE / MASTER / MANAGER 만 허용 (그 외 403).
 *   - status != PENDING 시 409.
 *   - rejectionReason 은 trim 후 1~500 자 의무.
 */
export async function rejectSlipEdit(
  token: string | null,
  slipId: string,
  requestId: string,
  body: RejectSlipEditRequest,
): Promise<SlipEditRequestResponse> {
  const trimmed = body.rejectionReason.trim();
  if (trimmed.length === 0) {
    throw new SlipEditRequestApiError(0, '거절 사유가 비어 있습니다');
  }
  if (trimmed.length > 500) {
    throw new SlipEditRequestApiError(0, '거절 사유는 500자 이하여야 합니다');
  }
  const url = `${API_BASE_URL}/slips/${encodeURIComponent(slipId)}/edit-requests/${encodeURIComponent(
    requestId,
  )}/reject`;
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(token, true),
    body: JSON.stringify({ rejectionReason: trimmed }),
  });
  if (!res.ok) {
    throw new SlipEditRequestApiError(res.status, `수정 요청 거절 실패 — HTTP ${res.status}`);
  }
  const json = await res.json();
  assertSuccess(json, '수정 요청 거절');
  return json.data as SlipEditRequestResponse;
}

/**
 * 단일 slip 의 모든 수정 요청 (모든 status 포함, createdAt desc 정렬 — BE 보장).
 *
 * SlipDetailScreen 의 작성자 (SALES) 화면에서 자기 요청 이력을 확인하는 용도.
 */
export async function listSlipEditRequests(
  token: string | null,
  slipId: string,
): Promise<SlipEditRequestResponse[]> {
  const url = `${API_BASE_URL}/slips/${encodeURIComponent(slipId)}/edit-requests`;
  const res = await fetch(url, { method: 'GET', headers: buildHeaders(token, false) });
  if (!res.ok) {
    throw new SlipEditRequestApiError(res.status, `수정 요청 목록 조회 실패 — HTTP ${res.status}`);
  }
  const json = await res.json();
  assertSuccess(json, '수정 요청 목록');
  return (json.data ?? []) as SlipEditRequestResponse[];
}

/**
 * PENDING 상태의 모든 slip 의 수정 요청 (창고 직원 모바일 화면 전용, createdAt asc 정렬 — 오래된 순).
 *
 * 본 endpoint 는 SlipEditRequestsScreen (창고 직원 PENDING list) 의 데이터 소스.
 * BE 가드: 호출자 ROLE = WAREHOUSE / MASTER / MANAGER 만 (그 외 403, 빈 list 가 아닌 명시 거부).
 */
export async function listPendingSlipEditRequests(
  token: string | null,
): Promise<SlipEditRequestResponse[]> {
  const url = `${API_BASE_URL}/slips/edit-requests?status=PENDING`;
  const res = await fetch(url, { method: 'GET', headers: buildHeaders(token, false) });
  if (!res.ok) {
    throw new SlipEditRequestApiError(
      res.status,
      `PENDING 수정 요청 목록 조회 실패 — HTTP ${res.status}`,
    );
  }
  const json = await res.json();
  assertSuccess(json, 'PENDING 수정 요청 목록');
  return (json.data ?? []) as SlipEditRequestResponse[];
}
