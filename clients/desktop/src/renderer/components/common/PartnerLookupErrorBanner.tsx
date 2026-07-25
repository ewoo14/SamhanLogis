/**
 * 회계 read 리포트 공용 조회 오류 배너 (#831 후속 sweep).
 *
 * 배경: partner-service 표시명 조회가 UNAVAILABLE(장애/타임아웃/5xx)이면 BE 는 read 리포트
 * endpoint 를 502 `PARTNER_IDENTITY_LOOKUP_UNAVAILABLE` 로 fail-closed 한다(파트너 신원이 곧
 * 행의 의미인 조회이므로). 이 배너는 그 502 를 화면에서 "데이터 없음"이 아니라 "일시 조회 장애"로
 * 정확히 안내하고 재시도 경로를 제공한다.
 *
 * - PARTNER_IDENTITY_LOOKUP_UNAVAILABLE 502 인 경우: BE 원문 메시지를 그대로 노출한다(사용자
 *   귀책·백엔드 연결 문제로 오인시키지 않는 정확한 원인 설명이 BE 에 이미 있다).
 * - 그 외 오류는 subject 기반 일반 문구를 쓴다. 어느 경우든 "백엔드 연결을 확인하세요" 류
 *   사용자 귀책 프레이밍은 쓰지 않고, 항상 재시도 버튼을 제공한다.
 *
 * 사용처: CollectionPlanPage/NotesReceivablePage/BankTransactionPage(신규) +
 * PartnerAgingPage/AccountStatementPage/ReceivablesPayablesPage/FundsStatusPage/
 * JournalStatusReportPage(기존 오류 배너 문구 교체) 등 partner-service 의존 read 리포트 전반.
 */
import { Button } from '@samhan/design-system'
import { extractApiErrorMessage, isPartnerLookupUnavailableError } from '../../api/apiError'

export interface PartnerLookupErrorBannerProps {
  /** react-query 의 query.error (또는 임의 오류). */
  error: unknown
  /** 재시도 콜백 — 보통 `query.refetch`. */
  onRetry: () => void
  /** 조회 대상 명 (예: '수금계획', '받을어음'). 일반 오류 문구에만 사용. */
  subject: string
  /** 화면별 회귀 테스트용 testid. */
  testId?: string
}

const FALLBACK_UNAVAILABLE_MESSAGE = '거래처 조회를 일시적으로 할 수 없습니다. 잠시 후 다시 시도해 주세요.'

export function PartnerLookupErrorBanner({ error, onRetry, subject, testId }: PartnerLookupErrorBannerProps) {
  const unavailable = isPartnerLookupUnavailableError(error)
  const message = unavailable
    ? (extractApiErrorMessage(error) || FALLBACK_UNAVAILABLE_MESSAGE)
    : `${subject} 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.`

  return (
    <div
      role="alert"
      data-testid={testId}
      data-partner-lookup-unavailable={unavailable ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '12px 16px',
        border: '1px solid var(--state-danger)',
        borderRadius: 6,
        background: 'var(--state-danger-bg)',
        color: 'var(--state-danger)',
        fontSize: 14,
      }}
    >
      <span>{message}</span>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  )
}
