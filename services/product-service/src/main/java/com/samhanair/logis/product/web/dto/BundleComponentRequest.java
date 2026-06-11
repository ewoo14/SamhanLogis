package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.BundleComponent;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

/**
 * 구성품 replace-all 요청 DTO (§1c 2026-06-11).
 *
 * <p>배열 인덱스가 표시 순서(0-based)가 된다.
 * BUNDLE 의 구성품 전체를 배열로 교체한다 (replace-all 패턴).
 *
 * @param componentProductCode 구성 품목 모델코드 (활성 품목이어야 함)
 * @param defaultQty           기본 수량 (양수 필수, 최대 999.99 — NUMERIC(5,2) 컬럼 precision 상한)
 * @param qtyMode              수량 모드 (FIXED / FOLLOW_SET; null 이면 FOLLOW_SET 기본)
 * @param componentKind        구성 분류 (null 이면 ACCESSORY 기본)
 * @param componentVariant     구성품 특징 (기본/사각/WIFI 등; null 가능)
 * @param isDefault            기본 옵션 여부
 * @param specText             규격 (null 가능)
 */
public record BundleComponentRequest(
        @NotBlank String componentProductCode,
        // K fix: NUMERIC(5,2) — 최대 999.99. 상한·자릿수 제약 누락 시 INSERT overflow 500.
        @NotNull @DecimalMin("0.01") @DecimalMax("999.99")
        @Digits(integer = 3, fraction = 2) BigDecimal defaultQty,
        BundleComponent.QtyMode qtyMode,
        BundleComponent.ComponentKind componentKind,
        String componentVariant,
        boolean isDefault,
        String specText
) {
}
