package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import java.math.BigDecimal;

/**
 * 카탈로그 endpoint 응답 — UUID 비공개 원칙 (feedback_uuid_no_user_visibility.md) 충족.
 * 사용자 화면에는 modelCode (사용자 노출 식별자) 만 노출, internal id (UUID) 미노출.
 *
 * <p>이카운트 품목 신원은 품목코드({@code model_code})와 품목명/모델명({@code model_name})이
 * 별도이며, 운영 실데이터에는 {@code model_code} 가 비어 있고 {@code model_name} 만
 * 채워진 행이 있다. 따라서 응답 {@code modelCode} 는 {@code model_code ?? model_name}
 * 규칙으로 채우며, 카탈로그 mutation path 도 동일 규칙으로 조회되어야 한다.
 *
 * <p>PR-B(2026-06-11) 추가 필드:
 * <ul>
 *   <li>{@code usageScopeManual} — 수동 override 여부. true 이면 sync 가 덮어쓰지 않음.</li>
 *   <li>{@code displayOrder} — 시트 노출 순서 (null 이면 정렬 후순위).</li>
 * </ul>
 *
 * <p>§1b(2026-06-11) 추가 필드:
 * <ul>
 *   <li>{@code productType} — SINGLE / BUNDLE 구분 (세트 뱃지 표시용).</li>
 *   <li>{@code componentCount} — BUNDLE 일 때 활성 구성품 수, SINGLE 이면 0.
 *       카탈로그 목록 조회 시 BundleComponentRepository 벌크 count (N+1 방지).</li>
 * </ul>
 */
public record ProductCatalogResponse(
        String modelCode,
        String name,
        UsageScope usageScope,
        EstimateCategory estimateCategory,
        boolean usageScopeManual,
        Integer displayOrder,
        BigDecimal releasePrice,
        BigDecimal deliveryPrice,
        boolean hasVariableDiscount,
        boolean legacyDiscountFlag,
        String discountFlags,
        ProductType productType,
        int componentCount
) {
    /**
     * {@link Product} → 카탈로그 응답 변환 (componentCount=0 기본).
     *
     * <p>componentCount 는 목록 조회 후 벌크 채우기 패턴으로 갱신하므로
     * 단건 조회 시에는 0 으로 초기화된다.
     *
     * @param p 변환 대상 Product 엔티티
     * @return 카탈로그 응답 DTO
     */
    public static ProductCatalogResponse from(Product p) {
        return new ProductCatalogResponse(
                p.getModelCode() == null ? p.getModelName() : p.getModelCode(),
                p.getName(),
                p.getUsageScope(),
                p.getEstimateCategory(),
                p.isUsageScopeManual(),
                p.getDisplayOrder(),
                p.getReleasePrice(),
                p.getDeliveryPrice(),
                Boolean.TRUE.equals(p.getHasVariableDiscount()),
                Boolean.TRUE.equals(p.getLegacyDiscountFlag()),
                p.getDiscountFlags(),
                p.getProductType(),
                0
        );
    }

    /**
     * componentCount 를 지정 값으로 교체한 새 응답을 반환한다.
     *
     * <p>record 는 불변이므로 새 인스턴스를 생성한다. 벌크 count 결과를
     * 개별 응답에 주입할 때 사용한다 (§1b N+1 방지 벌크 채우기 패턴).
     *
     * @param count 활성 구성품 수
     * @return componentCount 가 갱신된 새 카탈로그 응답
     */
    public ProductCatalogResponse withComponentCount(int count) {
        return new ProductCatalogResponse(
                modelCode, name, usageScope, estimateCategory,
                usageScopeManual, displayOrder,
                releasePrice, deliveryPrice,
                hasVariableDiscount, legacyDiscountFlag, discountFlags,
                productType, count
        );
    }
}
