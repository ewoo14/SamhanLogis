package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.slip.client.ProductSummary;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class BundleProductGuardTest {

    @Test
    void bundleMode_판정은_KEEP만_부모로_허용하고_나머지는_전개한다() {
        assertThat(BundleModePolicy.shouldExpand(summary("KEEP"))).isFalse();
        assertThat(BundleModePolicy.shouldExpand(summary("EXPAND"))).isTrue();
        assertThat(BundleModePolicy.shouldExpand(summary(null))).isTrue();
    }

    @Test
    void KEEP_부모는_정상_왕복을_허용한다() {
        ProductSummary keep = summary("KEEP");

        assertThatCode(() -> BundleProductGuard.rejectParents(List.of(keep)))
                .doesNotThrowAnyException();
    }

    @Test
    void EXPAND_부모는_평면_저장을_차단한다() {
        ProductSummary expand = summary("EXPAND");

        assertThatThrownBy(() -> BundleProductGuard.rejectParents(List.of(expand)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("세트 품목은 구성품으로 전개한 뒤 저장해야 합니다.");
    }

    @Test
    void bundleMode_누락은_기본_EXPAND로_차단한다() {
        ProductSummary legacy = new ProductSummary(UUID.randomUUID(), "세트", "SET", null,
                null, BigDecimal.ONE, "ACTIVE", false, "SET-1", "BUNDLE");

        assertThatThrownBy(() -> BundleProductGuard.rejectParents(List.of(legacy)))
                .isInstanceOf(BusinessException.class);
    }

    private ProductSummary summary(String bundleMode) {
        return new ProductSummary(UUID.randomUUID(), "세트", "SET", null,
                null, BigDecimal.ONE, "ACTIVE", false, "SET-1", "BUNDLE", null, bundleMode);
    }
}
