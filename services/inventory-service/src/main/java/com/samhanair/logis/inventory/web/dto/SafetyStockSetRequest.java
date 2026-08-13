package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;

/**
 * 안전재고 임계값 설정/갱신 요청 DTO (P1-3).
 *
 * @param warehouseId 대상 창고 UUID (null = 전체 창고 합산 기준)
 * @param threshold   안전재고 임계값 (0 이상)
 * @param note        메모 (선택)
 * @param scopeMode   선택 범위 ({@code ALL}/{@code SELECTED}) — 누락 불가
 */
public record SafetyStockSetRequest(
        @JsonDeserialize(using = OpaqueUuidDeserializer.class)
        UUID warehouseId,
        @NotNull @Min(0) Integer threshold,
        String note,
        @NotNull(message = "scopeMode 는 필수입니다")
        @Pattern(regexp = "ALL|SELECTED", message = "scopeMode 는 ALL 또는 SELECTED 이어야 합니다")
        String scopeMode
) {

    /** 선택 모드와 창고 선택값의 모순 입력을 DTO 단계에서 차단한다. */
    @AssertTrue(message = "scopeMode 와 창고 선택값이 일치하지 않습니다")
    public boolean isScopeSelectionConsistent() {
        if (scopeMode == null) {
            return true;
        }
        return ("ALL".equals(scopeMode) && warehouseId == null)
                || ("SELECTED".equals(scopeMode) && warehouseId != null);
    }
}
