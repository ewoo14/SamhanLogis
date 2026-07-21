package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** 일마감 외부 문자열 범위를 도메인 enum으로 수렴하는 계약 테스트. */
class DailyClosingScopeModeTest {

    @Test
    void parse_acceptsOnlyExplicitModes() {
        assertThat(DailyClosingScopeMode.parse("ALL")).isEqualTo(DailyClosingScopeMode.ALL);
        assertThat(DailyClosingScopeMode.parse("SELECTED")).isEqualTo(DailyClosingScopeMode.SELECTED);
    }

    @Test
    void parse_rejectsMissingOrUnknownMode() {
        assertThatThrownBy(() -> DailyClosingScopeMode.parse(null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DailyClosingScopeMode.parse("EVERYTHING"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
