/**
 * KFTC 오픈뱅킹 입금 매칭 API 클라이언트 (SP-09-4).
 *
 * <h2>endpoint</h2>
 * <ul>
 *   <li>POST {@code /accounting/deposits/fetch-and-match} —
 *       기간 + 계좌 핀번호 기준으로 입금 내역을 조회하고 거래처/세금계산서와 매칭.</li>
 * </ul>
 *
 * <h2>submitMethod</h2>
 * <ul>
 *   <li>{@code DRY_RUN} — BE 가 KFTC 없이 가짜 매칭 결과를 반환 (shell 단계)</li>
 *   <li>{@code KFTC}    — KFTC 오픈뱅킹 실 호출 (Phase 11 sandbox 연동 후 활성)</li>
 * </ul>
 *
 * <h2>UUID 비공개</h2>
 * <p>BE {@code DepositMatchResultDto} 는 UUID 를 응답에 포함하지 않는다
 * (feedback_uuid_no_user_visibility). 사용자 표시 식별자:
 * {@code matchedPartnerCode} / {@code matchedTaxInvoiceNo} 만 노출.
 *
 * <h2>에러 분류</h2>
 * <ul>
 *   <li>422 — from > to / accountFinNo 누락</li>
 *   <li>502 — KFTC 오픈뱅킹 외부 서비스 오류 (DRY_RUN 에서는 발생하지 않음)</li>
 * </ul>
 *
 * <h2>권한</h2>
 * <p>ACCOUNTANT / MANAGER / MASTER — RoleGuard 가 라우팅 단계에서 차단.
 * BE {@code @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")} 와 1:1 일치.
 */
import axios from 'axios'
import { apiClient, type ApiEnvelope } from './client'

// ---------------------------------------------------------------------------
// 요청 파라미터
// ---------------------------------------------------------------------------

/**
 * BE 가 지원하는 입금 매칭 처리 방식.
 *
 * <ul>
 *   <li>{@code DRY_RUN} — shell 단계 가짜 응답 (KFTC 연동 불필요)</li>
 *   <li>{@code KFTC}    — KFTC 오픈뱅킹 실 호출 (Phase 11 sandbox 연동 시 활성)</li>
 * </ul>
 */
export type DepositSubmitMethod = 'DRY_RUN' | 'KFTC'

/**
 * {@code POST /accounting/deposits/fetch-and-match} 요청 body.
 *
 * <p>BE {@code DepositFetchRequest} 와 필드명 1:1 정합.
 */
export interface DepositFetchRequest {
  /** 조회 시작일 (YYYY-MM-DD). */
  from: string
  /** 조회 종료일 (YYYY-MM-DD). */
  to: string
  /** 계좌 핀번호 — KFTC fintechUseNum (accountFinNo). */
  accountFinNo: string
  /** 처리 방식 — DRY_RUN (shell 단계) 또는 KFTC (Phase 11). */
  submitMethod: DepositSubmitMethod
}

// ---------------------------------------------------------------------------
// 응답 타입
// ---------------------------------------------------------------------------

/**
 * 자동 분개 미리보기 단일 라인 — BE {@code DepositJournalLine} 와 필드명 1:1 정합.
 *
 * <p>UUID 비공개: 계정 UUID 미노출 — 표준 계정코드({@code accountCode}) + 계정명({@code accountName})만 노출.
 */
export interface DepositJournalLine {
  /** 차변(DEBIT) / 대변(CREDIT). */
  side: 'DEBIT' | 'CREDIT'
  /** 표준 계정코드 (예: 보통예금 102 / 외상매출금 110). */
  accountCode: string
  /** 계정명 (예: 보통예금 / 외상매출금). */
  accountName: string
  /** 라인 금액 (원). */
  amount: number
}

/**
 * 매칭 입금의 자동 분개 미리보기 — BE {@code DepositJournalDraft} 와 1:1 정합.
 *
 * <p>입금 매칭 표준 분개: 차변 보통예금(102) / 대변 외상매출금(110), 동액.
 * DRY_RUN 단계에서는 실제 전표를 생성하지 않고 미리보기만 제공한다.
 */
export interface DepositJournalDraft {
  /** 분개 라인 목록 (차변/대변). */
  lines: DepositJournalLine[]
}

/**
 * 입금 매칭 단건 결과 — BE {@code DepositMatchResult} 와 필드명 1:1 정합.
 *
 * <p>UUID 비공개: {@code journalDraftId} 는 내부 전용 (화면 미노출).
 * 사용자 표시 식별자: {@code matchedPartnerCode} / {@code matchedTaxInvoiceNo} 만 노출.
 */
export interface DepositMatchResult {
  /** 입금자명. */
  depositorName: string
  /** 입금 금액 (원). */
  amount: number
  /** 거래 일자 (YYYY-MM-DD). */
  transactionDate: string
  /**
   * 매칭된 거래처 코드 (MATCHED 상태에만 존재).
   * UUID 비공개 원칙 — partnerCode 텍스트만 표시.
   */
  matchedPartnerCode?: string
  /**
   * 매칭된 세금계산서 번호 (MATCHED + 세금계산서 연결 시에만 존재).
   * UUID 비공개 원칙 — taxInvoiceNo 텍스트만 표시.
   */
  matchedTaxInvoiceNo?: string
  /** 매칭 상태. */
  status: 'MATCHED' | 'UNMATCHED'
  /**
   * 자동 분개 미리보기 (MATCHED 상태에만 존재).
   * 차변 보통예금(102) / 대변 외상매출금(110) 동액.
   */
  journalDraft?: DepositJournalDraft
}

/**
 * {@code POST /accounting/deposits/fetch-and-match} 응답 — BE {@code DepositMatchResponse} 와 1:1 정합.
 */
export interface DepositMatchResponse {
  /** 전체 입금 건수. */
  totalCount: number
  /** 매칭 성공 건수. */
  matchedCount: number
  /** 미매칭 건수. */
  unmatchedCount: number
  /** 입금 매칭 결과 목록. */
  results: DepositMatchResult[]
}

// ---------------------------------------------------------------------------
// 에러 타입
// ---------------------------------------------------------------------------

/**
 * ApiErrorEnvelope — BE 가 4xx/5xx 에 반환하는 에러 body 타입.
 *
 * <p>SP-09-1/2/3 패턴과 동일 (feedback_integrated_pr_pattern).
 */
export interface ApiErrorEnvelope {
  success: false
  code: string
  message: string
  data: null
  timestamp: string
}

/**
 * 422 검증 에러 — from > to / accountFinNo 누락.
 */
export class DepositValidationError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'DepositValidationError'
    this.code = code
  }
}

/**
 * 502 외부 KFTC 서비스 오류 — 오픈뱅킹 API 장애.
 * DRY_RUN 에서는 발생하지 않음.
 */
export class KftcGatewayError extends Error {
  constructor(message?: string) {
    super(message ?? 'KFTC 오픈뱅킹 외부 서비스에 일시적 오류가 발생했습니다. 잠시 후 다시 시도하세요.')
    this.name = 'KftcGatewayError'
  }
}

// ---------------------------------------------------------------------------
// 권한 상수
// ---------------------------------------------------------------------------

/**
 * SP-09-4 입금 매칭 접근 가능 ROLE 목록.
 * BE {@code @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")} 와 1:1 일치.
 */
export const DEPOSIT_MATCH_ROLES = ['ACCOUNTANT', 'MANAGER', 'MASTER'] as const

// ---------------------------------------------------------------------------
// API 호출
// ---------------------------------------------------------------------------

/**
 * KFTC 오픈뱅킹 입금 내역 조회 → 거래처/세금계산서 자동 매칭.
 *
 * @param from          조회 시작일 (YYYY-MM-DD)
 * @param to            조회 종료일 (YYYY-MM-DD)
 * @param accountFinNo  계좌 핀번호 (KFTC fintechUseNum)
 * @param submitMethod  처리 방식 — DRY_RUN (shell 단계) 또는 KFTC (Phase 11)
 * @returns             입금 매칭 결과 (totalCount / matchedCount / unmatchedCount / results)
 * @throws DepositValidationError  422 (날짜 범위 오류 / accountFinNo 누락)
 * @throws KftcGatewayError        502 (KFTC 오픈뱅킹 외부 장애)
 */
export async function fetchAndMatchDeposits(
  from: string,
  to: string,
  accountFinNo: string,
  submitMethod: DepositSubmitMethod,
): Promise<DepositMatchResponse> {
  const body: DepositFetchRequest = { from, to, accountFinNo, submitMethod }

  try {
    const res = await apiClient.post<ApiEnvelope<DepositMatchResponse>>(
      '/accounting/deposits/fetch-and-match',
      body,
    )
    return res.data.data
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status
      const data = err.response?.data as ApiErrorEnvelope | undefined

      if (status === 422) {
        throw new DepositValidationError(
          data?.message ?? '입력값 검증에 실패했습니다.',
          data?.code ?? 'VALIDATION_ERROR',
        )
      }
      if (status === 502) {
        throw new KftcGatewayError(data?.message)
      }
    }
    throw err
  }
}
