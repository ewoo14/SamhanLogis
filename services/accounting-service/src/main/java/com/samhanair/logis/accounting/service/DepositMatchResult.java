package com.samhanair.logis.accounting.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * 입금 거래 단건 매칭 결과 — 서비스 레이어 내부 모델 (SP-09-4).
 *
 * <p>UUID 비공개 원칙 (feedback_uuid_no_user_visibility):
 * {@code journalDraftId} 는 서비스 내부 추적용. 외부 응답 DTO 로 변환 시 UUID 를 노출하지 않는다.
 * 사용자 식별자는 {@code matchedPartnerCode} / {@code matchedTaxInvoiceNo} (비즈니스 식별자).
 *
 * @param depositorName       입금자명 (KFTC 응답 그대로)
 * @param amount              입금액
 * @param transactionDate     거래 일자
 * @param matchedPartnerCode  매칭된 거래처 코드 (미매칭 시 null)
 * @param matchedTaxInvoiceNo 매칭된 세금계산서 번호 (미매칭 시 null)
 * @param journalDraftId      생성된 분개 DRAFT UUID (서비스 내부용, 응답 미노출)
 * @param status              매칭 상태 — {@link DepositMatchStatus#MATCHED} | {@link DepositMatchStatus#UNMATCHED}
 */
public record DepositMatchResult(
        String depositorName,
        BigDecimal amount,
        LocalDate transactionDate,
        String matchedPartnerCode,
        String matchedTaxInvoiceNo,
        UUID journalDraftId,
        DepositMatchStatus status
) {
}
