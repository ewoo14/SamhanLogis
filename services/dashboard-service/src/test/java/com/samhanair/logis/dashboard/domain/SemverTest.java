package com.samhanair.logis.dashboard.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class SemverTest {

    @ParameterizedTest(name = "{0} compareTo {1} = {2}")
    @CsvSource({
            "2026/07/24-9, 2026/07/25-1, -1",
            "2026/07/25-1, 2026/07/25-2, -1",
            "2026/07/25-2, 2026/07/25-10, -1",
            "2026/07/25-10, 2026/07/25-2, 1",
            "2026/07/25-1, 2026/07/25-1, 0"
    })
    void appVersion_compare_orders_development_version_by_date_then_sequence(
            String left,
            String right,
            int expectedSign) {
        assertThat(Integer.signum(Semver.compare(left, right))).isEqualTo(expectedSign);
    }

    @Test
    void appVersion_keeps_legacy_semver_comparison_without_parsing_it_as_a_date() {
        assertThat(Semver.compare("0.1.0", "0.1.0")).isZero();
        assertThat(Semver.compare("0.1.0", "2026/07/25-1")).isNegative();
        assertThat(Semver.compare("2026/07/25-1", "0.1.0")).isPositive();
    }

    @ParameterizedTest(name = "{0} compareTo {1} = {2}")
    @CsvSource({
            "v1.0.0, 1.0.0, 0",
            "V1.0.0, 1.0.0, 0",
            "1.0.0+build.1, 1.0.0, 0",
            "1.10.0, 1.9.0, 1",
            "1.0.10, 1.0.9, 1",
            "1.0.0-rc.1, 1.0.0, -1",
            "1.0.0-9, 1.0.0-11, -1",
            "1.2.3, 1.2.3, 0"
    })
    void compare_handles_semver_edges(String left, String right, int expectedSign) {
        assertThat(Integer.signum(Semver.compare(left, right))).isEqualTo(expectedSign);
    }

    @ParameterizedTest(name = "{0} is valid")
    @ValueSource(strings = {
            "1.0.0",
            "v1.0.0",
            "1.0.0+build.1",
            "1.0.0-rc.1",
            "2026/07/25-1"
    })
    void requireValid_accepts_valid_semver(String value) {
        assertThatCode(() -> Semver.requireValid(value, "version")).doesNotThrowAnyException();
    }

    @ParameterizedTest(name = "{0} is invalid")
    @ValueSource(strings = {
            "",
            "1.0",
            "1.0.0.0",
            "01.0.0",
            "1.0.x",
            "1.0.0-rc_1"
    })
    void requireValid_rejects_invalid_semver(String value) {
        assertThatThrownBy(() -> Semver.requireValid(value, "version"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest(name = "{0}은 신규 개발 버전으로 거부한다")
    @ValueSource(strings = {
            "",
            "2026-07-25-1",
            "2026/7/5-1",
            "2026/02/30-1",
            "2026/07/25-0",
            "2026/07/25-01",
            "0.1.0"
    })
    void requireDevelopmentVersion_rejects_non_development_format(String value) {
        assertThatThrownBy(() -> Semver.requireDevelopmentVersion(value, "version"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("YYYY/MM/DD-{번호}");
    }

    @Test
    void requireDevelopmentVersion_accepts_zero_padded_date_and_numeric_sequence() {
        assertThatCode(() -> Semver.requireDevelopmentVersion("2026/07/05-10", "version"))
                .doesNotThrowAnyException();
    }
}
