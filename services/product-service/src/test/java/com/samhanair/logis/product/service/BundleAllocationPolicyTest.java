package com.samhanair.logis.product.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.product.domain.BundleComponent;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

/** #1143 비중 계약의 RED-first 회귀 테스트. */
class BundleAllocationPolicyTest {

    @Test
    void 자동_비중의_합이_10이_아니면_저장을_거부한다() {
        assertThatThrownBy(() -> BundleAllocationPolicy.validate(
                List.of(
                        BundleAllocationPolicy.item(BundleComponent.AllocationMode.AUTO, 6, null),
                        BundleAllocationPolicy.item(BundleComponent.AllocationMode.AUTO, 3, null))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("10");
    }

    @Test
    void 고정과_자동을_구분하고_반올림_단위는_데이터로_표현한다() {
        var fixed = BundleAllocationPolicy.item(
                BundleComponent.AllocationMode.FIXED, 0, new BigDecimal("808000"));
        var automatic = BundleAllocationPolicy.item(BundleComponent.AllocationMode.AUTO, 4, null);

        BundleAllocationPolicy.validate(List.of(
                fixed,
                BundleAllocationPolicy.item(BundleComponent.AllocationMode.AUTO, 6, null),
                automatic));

        org.assertj.core.api.Assertions.assertThat(fixed.mode())
                .isEqualTo(BundleComponent.AllocationMode.FIXED);
        org.assertj.core.api.Assertions.assertThat(automatic.weight()).isEqualTo(4);
        org.assertj.core.api.Assertions.assertThat(BundleAllocationPolicy.DEFAULT_ROUND_UNIT)
                .isEqualByComparingTo("1000");
    }
}
