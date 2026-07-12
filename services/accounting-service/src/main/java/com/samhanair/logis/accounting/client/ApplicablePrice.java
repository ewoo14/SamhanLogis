package com.samhanair.logis.accounting.client;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * product-service S1a 시점별 적용 정가 응답 wire-format 사본.
 *
 * <p>{@code release}/{@code delivery} 는 product-service 의 price_history 기준 정가/납품가이며,
 * {@code effectiveDate} 는 요청 {@code asOf} 시점에 적용된 기준일이다. accounting-service 는
 * product 도메인 타입을 직접 import 하지 않고 S2 재검증 엔진에 필요한 조회 결과만 전달한다.
 */
public record ApplicablePrice(
        BigDecimal release,
        BigDecimal delivery,
        LocalDate effectiveDate) {
}
