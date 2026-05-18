package com.samhanair.logis.accounting.client;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * KFTC 오픈뱅킹 입금 거래 단건 레코드 (SP-09-4).
 *
 * <p>DRY_RUN 모드에서는 mock 데이터로 채워지며, KFTC 실 API 연동 시 응답 JSON 을 이 record 로 매핑한다.
 *
 * <p>UUID 비공개 원칙 (feedback_uuid_no_user_visibility): {@code transactionId} 는
 * KFTC 측 비즈니스 식별자로 화면에 노출되지 않는다. 사용자 노출 식별자는 depositorName + amount + transactionDate 조합.
 *
 * @param depositorName 입금자명 (거래처명 매칭 기준)
 * @param amount        입금액 (원 단위, NUMERIC(15,2))
 * @param transactionDate 거래 일자
 * @param transactionTime 거래 시각 (HHmmss 형식 문자열 — KFTC 응답 포맷 그대로 보관)
 * @param bankAccount   수신 계좌번호 (마스킹 처리 권장 — "***-****-1234" 형식)
 * @param memo          거래 적요 (선택)
 * @param transactionId KFTC 거래 고유 ID (외부 시스템 비즈니스 식별자, 사용자 화면 비노출)
 */
public record KftcDepositRecord(
        String depositorName,
        BigDecimal amount,
        LocalDate transactionDate,
        String transactionTime,
        String bankAccount,
        String memo,
        String transactionId
) {
}
