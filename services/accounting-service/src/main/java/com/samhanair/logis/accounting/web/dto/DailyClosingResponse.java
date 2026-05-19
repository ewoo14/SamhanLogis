package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.DailyClosing;
import com.samhanair.logis.accounting.domain.DailyClosingKind;
import com.samhanair.logis.accounting.domain.DailyClosingSourceKind;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 일마감 snapshot 응답 DTO (SP-08-6-5).
 *
 * <p>UUID 비공개 원칙 — id 필드는 내부 식별자이므로 응답에서 제외.
 * 비즈니스 식별자인 closingDate + partnerCode 를 노출.
 *
 * @param closingDate  마감 날짜
 * @param partnerCode  거래처코드 (전체 마감이면 null)
 * @param closingKind  매출/매입 구분
 * @param sourceKind   집계 source
 * @param totalSupply  공급가액 합계
 * @param totalVat     세액 합계
 * @param totalAmount  합계금액
 * @param slipCount    집계 전표 건수
 * @param isLocked     잠금 여부
 * @param lockedAt     잠금 시각 (잠금 전 null)
 * @param lockedBy     잠금자 user-id (잠금 전 null)
 */
public record DailyClosingResponse(
        LocalDate closingDate,
        String partnerCode,
        DailyClosingKind closingKind,
        DailyClosingSourceKind sourceKind,
        BigDecimal totalSupply,
        BigDecimal totalVat,
        BigDecimal totalAmount,
        int slipCount,
        boolean isLocked,
        LocalDateTime lockedAt,
        String lockedBy
) {
    /**
     * DailyClosing 엔티티 → 응답 DTO 변환 (partnerCode 별도 주입).
     *
     * @param d           DailyClosing 엔티티
     * @param partnerCode 거래처코드 (partner-service lookup 결과 — 전체 마감이면 null)
     * @return DailyClosingResponse
     */
    public static DailyClosingResponse of(DailyClosing d, String partnerCode) {
        return new DailyClosingResponse(
                d.getClosingDate(),
                partnerCode,
                d.getClosingKind(),
                d.getSourceKind(),
                d.getTotalSupply(),
                d.getTotalVat(),
                d.getTotalAmount(),
                d.getSlipCount(),
                d.isLocked(),
                d.getLockedAt(),
                d.getLockedBy()
        );
    }
}
