/**
 * 전자서명 API 클라이언트 — signature-slice-C.
 *
 * Plan §2 의 신규 endpoint 4건과 1:1 대응:
 * - POST   `/api/public/batches/{token}/slips/{slipNo}/signature` — 인증 없이 모바일 서명 저장
 * - GET    `/api/public/signatures/{shareToken}`                  — 인증 없이 인수자 view
 * - GET    `/api/slips/{id}/signature`                        — MANAGER/MASTER 관리자 조회
 * - DELETE `/api/slips/{id}/signature?reason=...`             — MASTER 무효화 (감사 로그)
 *
 * UUID 비공개 가드 (`feedback_uuid_no_user_visibility.md`):
 * - 응답 객체 안 `slip.id` / `signature.id` 모두 미노출 (mobile-spec.md §5).
 * - Admin 응답 (`SignatureAdminResponse`) 의 `signaturePng` / `signatureHash` 등은 desktop
 *   `<SignatureViewer>` 가 hash 앞 8자만 표시.
 */
import { apiClient, type ApiEnvelope } from './client'
import { toOrderPathId } from '../utils/orderNo'

/**
 * 모바일 서명 저장 요청 body — Designer `mobile-spec.md` §2.1.
 */
export interface RecordSignatureRequest {
  /** 인수자명 (자유 입력, ≤50자, 공백 trim 후 1자 이상). */
  signerName: string
  /** PNG base64 dataURL ("data:image/png;base64,..."). 50KB 이내 권장. */
  signaturePngBase64: string
  /** Web Crypto API 로 클라이언트가 계산한 SHA-256 hex (64자). BE 가 재계산하여 mismatch 시 400. */
  clientHash: string
}

/**
 * 모바일 서명 저장 응답 — Designer `mobile-spec.md` §2.1.
 */
export interface RecordSignatureResponse {
  /** 서버 발급 서명 시점 ISO 8601. */
  signedAt: string
  /** 인수자에게 공유할 share 토큰 (base64url, +30일 만료). */
  shareToken: string
  /** share 유효기간 ISO 8601. */
  shareTokenExpiresAt: string
  /** BE 재계산 SHA-256 hex (clientHash 와 일치 보장). */
  signatureHash: string
}

/**
 * 인수자 view 응답 — Designer `mobile-spec.md` §2.2.
 *
 * UUID 미포함 — 거래처명/전표번호/배송지/배송일/라인명 등 비즈니스 식별자만 포함.
 */
export interface SignatureShareView {
  slip: {
    slipNo: string
    partnerName: string
    deliveryAddress: string
    deliveryDate: string
    lines: Array<{
      itemName: string
      quantity: number
      uom: string
    }>
    totalAmount: number
  }
  signature: {
    signerName: string
    signedAt: string
    /** PNG base64 dataURL. */
    signaturePngBase64: string
    /** SHA-256 의 앞 8자 short form (BE 가 사전 절단). */
    signatureHashShort: string
  }
  shareTokenExpiresAt: string
}

/**
 * 관리자 서명 조회 응답 — Plan §2 admin endpoint.
 *
 * 데스크톱 SlipDetailPage 가 SlipDetail 의 signature* 필드로 충분한 경우 별도 호출 불필요.
 * 본 함수는 무효화 후 즉시 재조회 / 별도 감사 화면용 hook 으로 제공.
 */
export interface SignatureAdminResponse {
  signedAt: string | null
  signerName: string | null
  signaturePngBase64: string | null
  signatureHash: string | null
  signatureChannel: string | null
  shareToken: string | null
  shareTokenExpiresAt: string | null
}

/**
 * 모바일 서명 저장 (NO AUTH).
 *
 * Slice C 본 슬라이스의 desktop 앱은 mock 라우트로 시뮬레이션 — 실제 sign.samhan-air.com
 * 분리는 Phase 5. apiClient 의 baseURL 은 동일하나 path 가 `/public/...` 으로 분기.
 *
 * @param token   배치 토큰 (Slice B 발급)
 * @param slipNo  비즈니스 전표번호 (예: "2026/05/05-1" — 표준 슬래시 형식)
 * @param body    서명자명 + PNG + 클라이언트 hash
 */
export async function recordSignature(
  token: string,
  slipNo: string,
  body: RecordSignatureRequest,
): Promise<RecordSignatureResponse> {
  const res = await apiClient.post<ApiEnvelope<RecordSignatureResponse>>(
    `/api/public/batches/${encodeURIComponent(token)}/slips/${encodeURIComponent(toOrderPathId(slipNo))}/signature`,
    body,
  )
  return res.data.data
}

/**
 * 배송기사 서명 저장 (Slice C2, NO AUTH).
 *
 * 인수자 서명({@link recordSignature})과 다른 점: signerName 별도 입력 X
 * (BE 가 Slip.driverName 재사용), shareToken 발급 X.
 */
export interface RecordDriverSignatureRequest {
  signaturePngBase64: string
  clientHash: string
}

export interface RecordDriverSignatureResponse {
  driverSignedAt: string
  driverSignatureHash: string
}

export async function recordDriverSignature(
  token: string,
  slipNo: string,
  body: RecordDriverSignatureRequest,
): Promise<RecordDriverSignatureResponse> {
  const res = await apiClient.post<ApiEnvelope<RecordDriverSignatureResponse>>(
    `/api/public/batches/${encodeURIComponent(token)}/slips/${encodeURIComponent(toOrderPathId(slipNo))}/driver-signature`,
    body,
  )
  return res.data.data
}

/**
 * 인수자 view 조회 (NO AUTH).
 *
 * 410 (만료) / 404 (토큰 무효) 모두 axios error 로 throw — 호출자가 GONE 페이지 분기.
 *
 * @param shareToken +30일 만료 share 토큰
 */
export async function getSignatureShare(
  shareToken: string,
): Promise<SignatureShareView> {
  const res = await apiClient.get<ApiEnvelope<SignatureShareView>>(
    `/api/public/signatures/${encodeURIComponent(shareToken)}`,
  )
  return res.data.data
}

/**
 * 관리자 서명 조회 (MANAGER/MASTER).
 *
 * @param slipId 전표 UUID — path param 으로만 사용 (화면 미노출)
 */
export async function getSignatureAdmin(
  slipId: string,
): Promise<SignatureAdminResponse> {
  const res = await apiClient.get<ApiEnvelope<SignatureAdminResponse>>(
    `/slips/${slipId}/signature`,
  )
  return res.data.data
}

/**
 * 서명 무효화 (MASTER only) — Plan §2 + Designer `wireframes.md` §3.3.
 *
 * BE 는 audit 테이블에 INVALIDATE action 강제 기록 (감사 무결성).
 * reason 은 최소 10자 검증 (BE + FE 양쪽). 200 응답 시 SlipDetail 의 signature* 필드는 모두 null 로 갱신됨.
 *
 * @param slipId 전표 UUID
 * @param reason 무효화 사유 (≥10자, ≤500자) — BE 가 audit 에 기록
 */
export async function invalidateSignature(
  slipId: string,
  reason: string,
): Promise<void> {
  await apiClient.delete(`/slips/${slipId}/signature`, {
    params: { reason },
  })
}
