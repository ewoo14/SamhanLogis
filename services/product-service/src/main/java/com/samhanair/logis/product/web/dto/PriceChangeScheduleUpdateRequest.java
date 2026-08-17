package com.samhanair.logis.product.web.dto;

import java.time.LocalDate;

/**
 * 단가변동 스케줄 admin 부분 수정 요청 (S4a, #17).
 *
 * <p>두 필드 모두 선택(optional)이다. {@code null} 인 필드는 기존 값을 유지하는
 * null-keep partial update 다 — {@link com.samhanair.logis.product.domain.PriceChangeSchedule#update}.
 *
 * @param effectiveDate KST 의미의 적용 시작일. null 이면 기존 값 유지
 * @param defaultPreChange 변동단가 체크박스 초기값. null 이면 기존 값 유지
 */
public record PriceChangeScheduleUpdateRequest(
        LocalDate effectiveDate,
        Boolean defaultPreChange) {
}
