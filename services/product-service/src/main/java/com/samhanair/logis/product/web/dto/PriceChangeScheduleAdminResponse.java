package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.PriceChangeSchedule;
import java.time.LocalDate;

/**
 * 단가변동 스케줄 admin 조회/수정 응답 (S4a, #17).
 *
 * @param category order-app {@code PartnerOrderLine.categoryKey} 4종 중 하나
 * @param effectiveDate KST 업무일 기준 단가변동 적용 시작일
 * @param defaultPreChange 견적 변동단가 체크박스 초기값
 */
public record PriceChangeScheduleAdminResponse(
        String category,
        LocalDate effectiveDate,
        Boolean defaultPreChange) {

    public static PriceChangeScheduleAdminResponse from(PriceChangeSchedule schedule) {
        return new PriceChangeScheduleAdminResponse(
                schedule.getCategory(),
                schedule.getEffectiveDate(),
                schedule.getDefaultPreChange());
    }
}
