package com.samhanair.logis.product.web.dto;

/** 분류 단계별 정액DC율 부분 수정 요청. 빈 문자열/null 은 해당 단계 정책 해제다. */
public record UpdateClassificationFixedDiscountRequest(String fixedDiscountRate) {
}
