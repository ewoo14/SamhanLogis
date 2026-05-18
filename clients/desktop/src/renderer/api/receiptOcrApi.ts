/**
 * 영수증 OCR + 매입 슬립 자동 생성 API 클라이언트 (SP-09-3).
 *
 * <h2>endpoint</h2>
 * <ul>
 *   <li>POST {@code /slips/receipt-ocr} (multipart/form-data) —
 *       영수증 이미지 업로드 → Naver Clova OCR (또는 DRY_RUN) →
 *       매입 슬립 자동 생성 {@link ReceiptParseResponse}</li>
 * </ul>
 *
 * <h2>submitMethod</h2>
 * <ul>
 *   <li>{@code DRY_RUN} — BE 가 OCR 없이 가짜 파싱 결과를 반환 (shell 단계)</li>
 *   <li>{@code CLOVA}   — Naver Clova OCR 실 호출 (Phase 11 sandbox 연동 후 활성)</li>
 * </ul>
 *
 * <h2>UUID 비공개</h2>
 * <p>응답의 slipNo 만 사용자에게 노출. BE DTO 에 slipId (UUID) 미포함
 * (feedback_uuid_no_user_visibility). Phase 11 slipNo 기반 라우트 추가 시 링크 활성화 검토.
 *
 * <h2>에러 분류</h2>
 * <ul>
 *   <li>422 — 파일 비어있음 / 10MB 초과 / 지원하지 않는 형식</li>
 *   <li>502 — Clova OCR 외부 서비스 오류 (DRY_RUN 에서는 발생하지 않음)</li>
 * </ul>
 */
import axios from 'axios'
import { apiClient, type ApiEnvelope } from './client'

// ---------------------------------------------------------------------------
// 요청 파라미터
// ---------------------------------------------------------------------------

/**
 * BE 가 지원하는 OCR 처리 방식.
 *
 * <ul>
 *   <li>{@code DRY_RUN} — shell 단계 가짜 응답 (BE OCR 연동 불필요)</li>
 *   <li>{@code CLOVA}   — Naver Clova OCR 실 호출 (Phase 11 sandbox 연동 시 활성)</li>
 * </ul>
 */
export type ReceiptSubmitMethod = 'DRY_RUN' | 'CLOVA'

// ---------------------------------------------------------------------------
// 응답 타입
// ---------------------------------------------------------------------------

/**
 * BE {@code ReceiptParseResponse} 와 1:1 (SP-09-3 cycle 2 정합).
 *
 * <p>BE record 필드:
 * slipNo / vendorName / totalAmount / vatAmount / issuedAt / submitMethod / parseRawJson
 *
 * <p>UUID 비공개: slipId 는 BE 응답에 포함되지 않음.
 * 사용자 표시 식별자는 slipNo 만 노출.
 */
export interface ReceiptParseResponse {
  /** 가게명 (OCR 인식 또는 DRY_RUN 가짜). */
  vendorName: string
  /** 총 금액 (원). */
  totalAmount: number
  /** 부가세 (원, null 가능 — OCR 미인식 시). */
  vatAmount: number | null
  /**
   * 영수증 발행일 (ISO 8601 date, 예: "2026-05-18").
   * BE DTO 필드명 {@code issuedAt} 과 동일.
   */
  issuedAt: string
  /**
   * 자동 생성된 매입 슬립의 사용자 식별 번호 (예: "2026/05/18-1").
   * UUID 비공개 원칙 — 이 값만 사용자 노출.
   */
  slipNo: string
  /** OCR 원본 응답 요약 JSON (감사 추적용). BE {@code parseRawJson} 필드. */
  parseRawJson: string | null
  /** 처리 방식 (echo). BE {@code submitMethod} 필드. */
  submitMethod: ReceiptSubmitMethod
}

// ---------------------------------------------------------------------------
// 에러 타입
// ---------------------------------------------------------------------------

/**
 * ApiErrorEnvelope — BE 가 4xx/5xx 에 반환하는 에러 body 타입.
 *
 * <p>SP-09-1/2 패턴과 동일 (feedback_integrated_pr_pattern).
 */
export interface ApiErrorEnvelope {
  success: false
  code: string
  message: string
  data: null
  timestamp: string
}

/**
 * 422 검증 에러 — 파일 비어있음 / 크기 초과 / 지원하지 않는 형식.
 */
export class ReceiptValidationError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'ReceiptValidationError'
    this.code = code
  }
}

/**
 * 502 외부 OCR 서비스 오류 — Clova API 장애.
 * DRY_RUN 에서는 발생하지 않음.
 */
export class OcrGatewayError extends Error {
  constructor(message?: string) {
    super(message ?? 'OCR 외부 서비스에 일시적 오류가 발생했습니다. 잠시 후 다시 시도하세요.')
    this.name = 'OcrGatewayError'
  }
}

// ---------------------------------------------------------------------------
// API 호출
// ---------------------------------------------------------------------------

/**
 * 영수증 이미지 업로드 → OCR 파싱 → 매입 슬립 자동 생성.
 *
 * @param file         영수증 이미지 (jpg / png / jpeg, 10MB 이하)
 * @param submitMethod OCR 처리 방식 — DRY_RUN (shell 단계) 또는 CLOVA (Phase 11)
 * @returns 파싱 결과 + 자동 생성된 슬립 정보
 * @throws ReceiptValidationError 422 (파일 검증 실패)
 * @throws OcrGatewayError        502 (Clova OCR 외부 장애)
 */
export async function parseReceipt(
  file: File,
  submitMethod: ReceiptSubmitMethod,
): Promise<ReceiptParseResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('submitMethod', submitMethod)

  try {
    const res = await apiClient.post<ApiEnvelope<ReceiptParseResponse>>(
      '/slips/receipt-ocr',
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        // OCR 처리는 초 단위 — apiClient 기본 10s 보다 여유.
        timeout: 60_000,
      },
    )
    return res.data.data
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status
      const data = err.response?.data as ApiErrorEnvelope | undefined

      if (status === 422) {
        throw new ReceiptValidationError(
          data?.message ?? '파일 검증에 실패했습니다.',
          data?.code ?? 'VALIDATION_ERROR',
        )
      }
      if (status === 502) {
        throw new OcrGatewayError(data?.message)
      }
    }
    throw err
  }
}
