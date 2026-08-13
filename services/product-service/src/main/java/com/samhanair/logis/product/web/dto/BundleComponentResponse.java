package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.BundleComponent;
import java.math.BigDecimal;

/**
 * 구성품 조회 응답 DTO (§1c 2026-06-11).
 *
 * <p>UUID 비공개 원칙 (feedback_uuid_no_user_visibility.md) 에 따라
 * 내부 UUID 는 노출하지 않으며, {@code componentProductCode} 를 식별자로 사용한다.
 *
 * @param componentProductCode 구성 품목 모델코드 (BundleComponent.componentProductCode)
 * @param componentName        구성 품목 명칭 (Product.name join 결과; 없으면 componentProductCode)
 * @param defaultQty           기본 수량
 * @param qtyMode              수량 모드 (FIXED / FOLLOW_SET)
 * @param componentKind        구성 분류 (INDOOR / OUTDOOR / PANEL / REMOTE / MATERIAL / ACCESSORY / FOOT)
 * @param componentVariant     구성품 특징 (기본/사각/WIFI 등; null 가능)
 * @param isDefault            기본 옵션 여부
 * @param specText             규격 (null 가능)
 * @param displayOrder         표시 순서 (PUT 시 서버 정규화 순위 기준 부여)
 */
public record BundleComponentResponse(
        String componentProductCode,
        String componentName,
        BigDecimal defaultQty,
        BundleComponent.QtyMode qtyMode,
        BundleComponent.ComponentKind componentKind,
        String componentVariant,
        String componentShape,
        boolean isDefault,
        String specText,
        int displayOrder,
        BundleComponent.AllocationMode allocationMode,
        Integer allocationWeight,
        BigDecimal fixedAllocationAmount
) {
    /**
     * {@link BundleComponent} 엔티티 + 품목 명칭 + 응답 순서 → 응답 DTO 변환.
     *
     * @param bc          BundleComponent 엔티티
     * @param name        구성 품목 명칭 (Product.name; 없으면 componentProductCode)
     * @param displayOrder 표시 순서 (응답 목록 기준 1-based)
     * @return 응답 DTO
     */
    public static BundleComponentResponse from(BundleComponent bc, String name, int displayOrder) {
        return new BundleComponentResponse(
                bc.getComponentProductCode(),
                name != null ? name : bc.getComponentProductCode(),
                bc.getDefaultQty(),
                bc.getQtyMode(),
                bc.getComponentKind(),
                bc.getComponentVariant(),
                bc.getComponentShape(),
                Boolean.TRUE.equals(bc.getIsDefault()),
                bc.getSpecText(),
                displayOrder,
                bc.getAllocationMode(),
                bc.getAllocationWeight(),
                bc.getFixedAllocationAmount()
        );
    }
}
