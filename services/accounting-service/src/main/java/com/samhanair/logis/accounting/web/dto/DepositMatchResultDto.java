package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 입금 거래 단건 매칭 결과 DTO (SP-09-4).
 *
 * <p>UUID 비공개 원칙 (feedback_uuid_no_user_visibility):
 * {@code journalDraftId} (UUID)는 이 응답에 포함되지 않는다.
 * 사용자에게 노출되는 식별자는 {@code depositorName} + {@code amount} + {@code transactionDate} 조합.
 * {@code matchedPartnerCode} / {@code matchedTaxInvoiceNo} 는 비즈니스 식별자로 허용.
 *
 * @param depositorName       입금자명
 * @param amount              입금액
 * @param transactionDate     거래 일자
 * @param matchedPartnerCode  매칭된 거래처 코드 (비즈니스 식별자, 미매칭 시 null)
 * @param matchedTaxInvoiceNo 매칭된 세금계산서 번호 (비즈니스 식별자, 미매칭 시 null)
 * @param status              매칭 상태 — MATCHED | UNMATCHED
 */
public record DepositMatchResultDto(
        String depositorName,
        BigDecimal amount,
        LocalDate transactionDate,
        String matchedPartnerCode,
        String matchedTaxInvoiceNo,
        String status,
        String matchSource,
        MappingEvidenceDto mappingEvidence
) {

    /** KFTC 후보가 입금자명 매핑에서 왔을 때 표시할 raw/normalized 근거. */
    public record MappingEvidenceDto(String rawName, String normalizedName) {
    }
}
