package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

/**
 * 일마감 생성 요청 DTO (SP-08-6-5).
 *
 * <p>POST /api/v1/accounting/daily-closings 요청 본문.
 * partnerCode 가 null 이면 전체 거래처 통합 마감.
 *
 * @param closingDate 마감 날짜 (필수)
 * @param partnerCode 거래처코드 (선택 — null 이면 전체 마감). UUID 비공개 원칙에 따라 코드 사용.
 */
public record CreateDailyClosingRequest(
        @NotNull(message = "closingDate 는 필수입니다")
        LocalDate closingDate,

        String partnerCode
) {}
