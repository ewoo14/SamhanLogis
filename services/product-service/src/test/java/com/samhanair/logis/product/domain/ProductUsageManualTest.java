package com.samhanair.logis.product.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Product 도메인 — 수동 노출 override 메서드 단위 테스트.
 *
 * <p>검증 대상:
 * <ul>
 *   <li>{@code markUsageManual()} — scope/category 변경 + usageScopeManual=true</li>
 *   <li>{@code markUsageManual(NONE)} — estimateCategory null 정리</li>
 *   <li>{@code markUsageManual(PARTNER_ORDER)} — estimateCategory null 정리</li>
 *   <li>{@code clearUsageManual()} — 플래그만 false, 값 유지</li>
 * </ul>
 */
class ProductUsageManualTest {

    private Product product;
    private Category category;

    @BeforeEach
    void setUp() {
        category = Category.create("INDOOR_WALL", "벽걸이형", null, 1);
        ReflectionTestUtils.setField(category, "id", java.util.UUID.randomUUID());

        product = Product.create("테스트 품목", "TEST-MODEL",
                category,
                new BigDecimal("1000000"),
                new BigDecimal("800000"),
                "KRW", null, null);
    }

    @Test
    @DisplayName("markUsageManual — ESTIMATE + 카테고리 지정 시 usageScopeManual=true")
    void markUsageManual_estimate_setsManualTrue() {
        product.markUsageManual(UsageScope.ESTIMATE, EstimateCategory.HOME_MULTI);

        assertThat(product.getUsageScope()).isEqualTo(UsageScope.ESTIMATE);
        assertThat(product.getEstimateCategory()).isEqualTo(EstimateCategory.HOME_MULTI);
        assertThat(product.isUsageScopeManual()).isTrue();
    }

    @Test
    @DisplayName("markUsageManual — BOTH + 카테고리 지정 시 usageScopeManual=true")
    void markUsageManual_both_setsManualTrue() {
        product.markUsageManual(UsageScope.BOTH, EstimateCategory.SINGLE_SET);

        assertThat(product.getUsageScope()).isEqualTo(UsageScope.BOTH);
        assertThat(product.getEstimateCategory()).isEqualTo(EstimateCategory.SINGLE_SET);
        assertThat(product.isUsageScopeManual()).isTrue();
    }

    @Test
    @DisplayName("markUsageManual — NONE 시 estimateCategory null 정리")
    void markUsageManual_none_clearsEstimateCategory() {
        // 먼저 ESTIMATE 로 set
        product.markUsageManual(UsageScope.ESTIMATE, EstimateCategory.HOME_MULTI);
        assertThat(product.getEstimateCategory()).isEqualTo(EstimateCategory.HOME_MULTI);

        // NONE 으로 변경
        product.markUsageManual(UsageScope.NONE, EstimateCategory.HOME_MULTI);

        assertThat(product.getUsageScope()).isEqualTo(UsageScope.NONE);
        assertThat(product.getEstimateCategory()).isNull();
        assertThat(product.isUsageScopeManual()).isTrue();
    }

    @Test
    @DisplayName("markUsageManual — PARTNER_ORDER 시 estimateCategory null 정리")
    void markUsageManual_partnerOrder_clearsEstimateCategory() {
        product.markUsageManual(UsageScope.PARTNER_ORDER, EstimateCategory.COMMERCIAL_MULTI);

        assertThat(product.getUsageScope()).isEqualTo(UsageScope.PARTNER_ORDER);
        assertThat(product.getEstimateCategory()).isNull();
        assertThat(product.isUsageScopeManual()).isTrue();
    }

    @Test
    @DisplayName("markUsageManual — null scope 는 NONE 으로 처리")
    void markUsageManual_nullScope_treatedAsNone() {
        product.markUsageManual(null, EstimateCategory.HOME_MULTI);

        assertThat(product.getUsageScope()).isEqualTo(UsageScope.NONE);
        assertThat(product.getEstimateCategory()).isNull();
        assertThat(product.isUsageScopeManual()).isTrue();
    }

    @Test
    @DisplayName("clearUsageManual — 플래그만 false 로 복귀, scope/category 값 유지")
    void clearUsageManual_onlyResetsFlagKeepsValues() {
        product.markUsageManual(UsageScope.BOTH, EstimateCategory.SINGLE_SET);
        assertThat(product.isUsageScopeManual()).isTrue();

        product.clearUsageManual();

        assertThat(product.isUsageScopeManual()).isFalse();
        // 값은 유지 — 다음 sync 가 시트 기준으로 재분류
        assertThat(product.getUsageScope()).isEqualTo(UsageScope.BOTH);
        assertThat(product.getEstimateCategory()).isEqualTo(EstimateCategory.SINGLE_SET);
    }

    @Test
    @DisplayName("기본 usageScopeManual — false (시트 자동 분류)")
    void defaultUsageScopeManual_isFalse() {
        assertThat(product.isUsageScopeManual()).isFalse();
    }
}
