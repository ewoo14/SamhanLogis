package com.samhanair.logis.product.web.dto;

import java.math.BigDecimal;

/**
 * #773 S1c 일마감 재검증용 고정DC율 응답.
 *
 * @param fixedDiscountRate 품목별 고정DC율. 값은 {@code Product.fixedDiscountRate} 의 percent(예: 45.00)
 *                          그대로이며 nullable 이다. 레거시 Code.js 의 {@code fixedDc}(분수 0.45)에
 *                          {@code * 100} 을 적용한 현대 저장값이므로, S2 재검증에서
 *                          {@code expectRate=round(fixedDc*100)} 와 비교할 때 재차 {@code * 100}
 *                          하면 안 된다.
 */
public record FixedDiscountResponse(BigDecimal fixedDiscountRate) {
}
