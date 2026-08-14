package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.DailyClosingKind;
import com.samhanair.logis.accounting.domain.DailyClosingSourceKind;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;

/**
 * 일마감 생성 요청 DTO (SP-08-6-5).
 *
 * <p>POST /api/v1/accounting/daily-closings 요청 본문.
 * partnerCode 가 null 이면 전체 거래처 통합 마감이며, 새 요청은 scopeMode 로 의도를 명시해야 한다.
 *
 * @param closingDate 마감 날짜 (필수)
 * @param partnerCode 거래처코드 (선택 — null 이면 전체 마감). UUID 비공개 원칙에 따라 코드 사용.
 * @param scopeMode 선택 범위 ({@code ALL}/{@code SELECTED}) — 누락 불가
 * @param closingKind 매출/매입 구분 (null 이면 SALES 하위 호환)
 * @param sourceKind 집계 source (null 이면 TAX_INVOICE 하위 호환)
 * @param amountVerified 사용자가 금액 검증을 완료했는지 여부. 금액이 있는 마감은 true 필수.
 */
public record CreateDailyClosingRequest(
        @NotNull(message = "closingDate 는 필수입니다")
        LocalDate closingDate,

        String partnerCode,

        @NotNull(message = "scopeMode 는 필수입니다")
        @Pattern(regexp = "ALL|SELECTED", message = "scopeMode 는 ALL 또는 SELECTED 이어야 합니다")
        String scopeMode,

        DailyClosingKind closingKind,

        DailyClosingSourceKind sourceKind,

        Boolean amountVerified
) {

    /** 기존 내부 호출자 호환 생성자 — 기존 서비스 호출은 이미 검증된 집계로 간주한다. */
    public CreateDailyClosingRequest(LocalDate closingDate, String partnerCode, String scopeMode,
                                     DailyClosingKind closingKind, DailyClosingSourceKind sourceKind) {
        this(closingDate, partnerCode, scopeMode, closingKind, sourceKind, true);
    }

    /** 선택 모드와 거래처 선택값의 모순 입력을 DTO 단계에서 차단한다. */
    @AssertTrue(message = "scopeMode 와 거래처 선택값이 일치하지 않습니다")
    public boolean isScopeSelectionConsistent() {
        if (scopeMode == null) {
            return true;
        }
        boolean hasPartner = partnerCode != null && !partnerCode.isBlank();
        return ("ALL".equals(scopeMode) && !hasPartner)
                || ("SELECTED".equals(scopeMode) && hasPartner);
    }
}
