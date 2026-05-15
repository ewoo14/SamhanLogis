/**
 * slip 감사 로그 (audit log) 도메인 API client — Phase 12 PR-H2 신규 (mobile-staff FE-2).
 *
 * BE 계약 (parallel — endpoint 는 desktop FE-1 과 공유):
 *   - GET    `/slips/{slipId}/audit-logs`            — 감사 로그 목록 (정렬: createdAt asc)
 *   - POST   `/slips/{slipId}/audit-logs/{id}/revert` — 특정 시점 값으로 복원
 *
 * 권한:
 *   - 조회 = 모든 ROLE (코멘트와 동일 — read-only).
 *   - revert = MASTER / MANAGER 만 (BE 가드, 미일치 시 403).
 *
 * 인증:
 *   - JWT bearer (gateway 가 verify + ROLE 확인 + X-User-* 주입 후 slip-service 로 forward).
 *
 * UUID 비공개:
 *   - slipId / auditLogId / actorId 는 path/POST body 만 — UI 노출 X.
 *   - 응답에 actor fullName + role 표기 (UUID 미노출 가드).
 *
 * fetch + ApiResponse wrapper 패턴은 `api/slipComment.ts` 와 1:1 동등.
 */

import { API_BASE_URL } from './salesUtils';

// ----------------------------------------------------------------------
// 응답 타입 — BE SlipAuditLogResponse (Phase 12 PR-H2) 와 1:1.
// ----------------------------------------------------------------------

/**
 * actor ROLE 풀네임 (사용자 명시 — feedback_role_naming_full.md).
 *
 * 약어 (M/M/D) 금지. PR/Issue/문서/UI 모두 풀네임 의무.
 */
export type SlipAuditActorRole =
  | 'MASTER'
  | 'MANAGER'
  | 'DIRECTOR'
  | 'SALES'
  | 'WAREHOUSE'
  | 'DRIVER'
  | 'ACCOUNTING';

/**
 * 단일 audit log 항목.
 *
 * `field` = 변경된 필드 식별자 (예: 'partnerName', 'lineQty', 'status').
 * `previousValue` / `newValue` = 변경 전/후 값 (string 직렬화 — 숫자/날짜 모두 string).
 *   - null 가능 (필드 추가/제거 시).
 */
export interface SlipAuditLogResponse {
  /** 감사 로그 식별자 — path/revert 만, UI 미노출. */
  id: string;
  slipId: string;
  /** 변경된 필드 명. */
  field: string;
  /** 변경 전 값 (직렬화 string, null 허용). */
  previousValue: string | null;
  /** 변경 후 값 (직렬화 string, null 허용). */
  newValue: string | null;
  /** 수정자 사용자 식별자 — UI 미노출 (userColorHash 의 입력으로만 사용). */
  actorId: string;
  /** 수정자 이름 — UI 노출 (UUID 비공개 가드). */
  actorFullName: string;
  /** 수정자 권한 풀네임. */
  actorRole: SlipAuditActorRole;
  /** ISO 8601 — 수정 시각. */
  createdAt: string;
}

// ----------------------------------------------------------------------
// fetch helper — slipComment.ts 패턴 1:1 일관.
// ----------------------------------------------------------------------

export class SlipAuditApiError extends Error {
  public readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SlipAuditApiError';
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
    throw new SlipAuditApiError(0, `${endpointLabel} 응답 schema 위반 — body 가 객체가 아닙니다`);
  }
  if (json.success !== true) {
    const code = typeof json.code === 'string' ? json.code : 'UNKNOWN';
    const message = typeof json.message === 'string' ? json.message : `${endpointLabel} 실패`;
    throw new SlipAuditApiError(
      0,
      `${endpointLabel} ApiResponse.success=false (code=${code}, message=${message})`,
    );
  }
}

// ----------------------------------------------------------------------
// API 함수 — 2 endpoint (list + revert).
// ----------------------------------------------------------------------

/**
 * slip 감사 로그 목록. createdAt asc 정렬 (BE 보장).
 *
 * 동일 slip 의 모든 필드 변경 이력을 단일 list 로 반환.
 * AuditOverlay 내부에서 `field` 별로 group + 최신순 정렬한다.
 */
export async function listSlipAuditLogs(
  token: string | null,
  slipId: string,
): Promise<SlipAuditLogResponse[]> {
  const url = `${API_BASE_URL}/slips/${encodeURIComponent(slipId)}/audit-logs`;
  const res = await fetch(url, { method: 'GET', headers: buildHeaders(token, false) });
  if (!res.ok) {
    throw new SlipAuditApiError(res.status, `감사 로그 조회 실패 — HTTP ${res.status}`);
  }
  const json = await res.json();
  assertSuccess(json, '감사 로그 목록');
  return (json.data ?? []) as SlipAuditLogResponse[];
}

/**
 * 특정 audit log 시점 값으로 복원.
 *
 * BE 가드:
 *   - ROLE = MASTER / MANAGER 만 허용 (그 외 403).
 *   - revert 자체도 새로운 audit log 1건으로 기록됨 (history 무손실).
 *
 * mobile-staff 의 일반 사용자 ROLE = DRIVER / SALES 이므로 일반적으로 복원 버튼 비표시.
 * 단, MASTER / MANAGER 가 모바일로 접근하는 시나리오 대비 endpoint client 는 export.
 */
export async function revertSlipAuditLog(
  token: string | null,
  slipId: string,
  auditLogId: string,
): Promise<void> {
  const url = `${API_BASE_URL}/slips/${encodeURIComponent(slipId)}/audit-logs/${encodeURIComponent(
    auditLogId,
  )}/revert`;
  const res = await fetch(url, { method: 'POST', headers: buildHeaders(token, true) });
  if (!res.ok && res.status !== 204) {
    throw new SlipAuditApiError(res.status, `복원 실패 — HTTP ${res.status}`);
  }
}
