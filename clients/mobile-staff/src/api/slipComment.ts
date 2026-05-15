/**
 * slip 코멘트 도메인 API client — Phase 12 PR-H1 신규 (mobile-staff FE-2).
 *
 * BE 계약 (parallel — endpoint 는 desktop FE-1 과 공유):
 *   - GET    `/slips/{slipId}/comments`           — 코멘트 목록 (정렬: createdAt asc)
 *   - POST   `/slips/{slipId}/comments`           — 신규 코멘트 작성
 *   - DELETE `/slips/{slipId}/comments/{id}`     — soft delete (작성자 본인만)
 *
 * mobile-staff API client 의 fetch + ApiResponse wrapper 패턴 일관.
 *
 * 인증:
 *   - JWT bearer (gateway 가 verify + ROLE 확인 + X-User-* 주입 후 slip-service 로 forward).
 *
 * UUID 비공개:
 *   - slipId / commentId 는 path/POST body 만. UI 노출 X.
 *   - 응답에 작성자 fullName + role 표기 (UUID 미노출).
 */

import { API_BASE_URL } from './salesUtils';

// ----------------------------------------------------------------------
// 응답 타입 — BE SlipCommentResponse (Phase 12 PR-H1) 와 1:1.
// ----------------------------------------------------------------------

/**
 * 작성자 ROLE 풀네임 (사용자 명시 — feedback_role_naming_full.md).
 *
 * 약어 (M/M/D) 금지. PR/Issue/문서/UI 모두 풀네임 의무.
 */
export type SlipCommentAuthorRole =
  | 'MASTER'
  | 'MANAGER'
  | 'DIRECTOR'
  | 'SALES'
  | 'WAREHOUSE'
  | 'DRIVER'
  | 'ACCOUNTING';

export interface SlipCommentResponse {
  /** 코멘트 식별자 — path/DELETE 만, UI 미노출. */
  id: string;
  slipId: string;
  /** 작성자 사용자 식별자 — UI 미노출. */
  authorId: string;
  /** 작성자 이름 — UI 노출 (UUID 비공개 가드). */
  authorFullName: string;
  /** 작성자 권한 풀네임. */
  authorRole: SlipCommentAuthorRole;
  /** 코멘트 본문 (≤ 2000자). */
  body: string;
  /** ISO 8601 — 작성 시각. */
  createdAt: string;
  /** ISO 8601 — 마지막 수정 시각 (수정 미지원 시 createdAt 동일). */
  updatedAt: string;
  /** soft-delete 여부 — true 시 UI 에서 "삭제된 코멘트" placeholder. */
  deleted: boolean;
}

export interface CreateSlipCommentRequest {
  /** 본문 (≤ 2000자). 빈 문자열 / 공백만 시 BE 가 400 반환. */
  body: string;
}

// ----------------------------------------------------------------------
// fetch helper — mobile-staff ApiResponse wrapper 패턴 일관.
// ----------------------------------------------------------------------

export class SlipCommentApiError extends Error {
  public readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SlipCommentApiError';
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
    throw new SlipCommentApiError(0, `${endpointLabel} 응답 schema 위반 — body 가 객체가 아닙니다`);
  }
  if (json.success !== true) {
    const code = typeof json.code === 'string' ? json.code : 'UNKNOWN';
    const message = typeof json.message === 'string' ? json.message : `${endpointLabel} 실패`;
    throw new SlipCommentApiError(0, `${endpointLabel} ApiResponse.success=false (code=${code}, message=${message})`);
  }
}

// ----------------------------------------------------------------------
// API 함수 — 3 endpoint.
// ----------------------------------------------------------------------

/**
 * slip 코멘트 목록. createdAt asc 정렬 (BE 보장).
 */
export async function listSlipComments(
  token: string | null,
  slipId: string,
): Promise<SlipCommentResponse[]> {
  const url = `${API_BASE_URL}/slips/${encodeURIComponent(slipId)}/comments`;
  const res = await fetch(url, { method: 'GET', headers: buildHeaders(token, false) });
  if (!res.ok) {
    throw new SlipCommentApiError(res.status, `코멘트 목록 조회 실패 — HTTP ${res.status}`);
  }
  const json = await res.json();
  assertSuccess(json, '코멘트 목록');
  return (json.data ?? []) as SlipCommentResponse[];
}

/**
 * slip 코멘트 작성. BE 가 작성자 = JWT subject 자동 채움.
 */
export async function createSlipComment(
  token: string | null,
  slipId: string,
  body: CreateSlipCommentRequest,
): Promise<SlipCommentResponse> {
  const trimmed = body.body.trim();
  if (trimmed.length === 0) {
    throw new SlipCommentApiError(0, '코멘트 본문이 비어 있습니다');
  }
  if (trimmed.length > 2000) {
    throw new SlipCommentApiError(0, '코멘트 본문은 2000자 이하여야 합니다');
  }
  const url = `${API_BASE_URL}/slips/${encodeURIComponent(slipId)}/comments`;
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(token, true),
    body: JSON.stringify({ body: trimmed }),
  });
  if (!res.ok) {
    throw new SlipCommentApiError(res.status, `코멘트 작성 실패 — HTTP ${res.status}`);
  }
  const json = await res.json();
  assertSuccess(json, '코멘트 작성');
  return json.data as SlipCommentResponse;
}

/**
 * slip 코멘트 soft-delete. 작성자 본인만 (BE 가드 — 미일치 시 403).
 */
export async function deleteSlipComment(
  token: string | null,
  slipId: string,
  commentId: string,
): Promise<void> {
  const url = `${API_BASE_URL}/slips/${encodeURIComponent(slipId)}/comments/${encodeURIComponent(commentId)}`;
  const res = await fetch(url, { method: 'DELETE', headers: buildHeaders(token, false) });
  if (!res.ok && res.status !== 204) {
    throw new SlipCommentApiError(res.status, `코멘트 삭제 실패 — HTTP ${res.status}`);
  }
}
