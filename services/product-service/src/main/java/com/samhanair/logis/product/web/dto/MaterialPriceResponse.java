package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.MaterialPrice;
import java.math.BigDecimal;

/** 자재 단가 lookup 응답 — 라인 입력 참조용 비즈니스 필드만 노출한다. */
public record MaterialPriceResponse(
        String materialKey,
        String name,
        BigDecimal price,
        String optionLabel
) {

    /**
     * 자재 단가 엔티티를 lookup 응답으로 변환한다.
     *
     * @param materialPrice 자재 단가 엔티티
     * @return UUID/id 와 computedFormula 를 제외한 응답
     */
    public static MaterialPriceResponse from(MaterialPrice materialPrice) {
        return new MaterialPriceResponse(
                materialPrice.getMaterialKey(),
                materialPrice.getName(),
                materialPrice.getPrice(),
                materialPrice.getOptionLabel());
    }
}
