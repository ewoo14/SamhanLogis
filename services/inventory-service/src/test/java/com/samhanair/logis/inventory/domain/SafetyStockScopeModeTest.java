package com.samhanair.logis.inventory.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** 안전재고 외부 문자열 범위를 도메인 enum으로 수렴하는 계약 테스트. */
class SafetyStockScopeModeTest {

    @Test
    void parse_acceptsOnlyExplicitModes() {
        assertThat(SafetyStockScopeMode.parse("ALL")).isEqualTo(SafetyStockScopeMode.ALL);
        assertThat(SafetyStockScopeMode.parse("SELECTED")).isEqualTo(SafetyStockScopeMode.SELECTED);
    }

    @Test
    void parse_rejectsMissingOrUnknownMode() {
        assertThatThrownBy(() -> SafetyStockScopeMode.parse(null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SafetyStockScopeMode.parse("EVERYTHING"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
