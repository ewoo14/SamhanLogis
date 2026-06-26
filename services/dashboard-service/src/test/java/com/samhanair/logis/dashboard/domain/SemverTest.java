package com.samhanair.logis.dashboard.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class SemverTest {

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
            "1.0.0-rc.1"
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
}
