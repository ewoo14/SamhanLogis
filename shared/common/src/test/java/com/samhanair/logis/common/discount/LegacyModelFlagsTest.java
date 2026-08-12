package com.samhanair.logis.common.discount;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LegacyModelFlagsTest {

    @Test
    void matchesEveryLegacySingleSetBranch() {
        assertThat(LegacyModelFlags.from("AC123456P")).isEqualTo(
                new LegacyModelFlags(true, false, false, false, false, false));
        assertThat(LegacyModelFlags.from("AC123454P")).isEqualTo(
                new LegacyModelFlags(false, true, false, false, false, false));
        assertThat(LegacyModelFlags.from("AC123454D")).isEqualTo(
                new LegacyModelFlags(false, true, false, false, false, false));
        assertThat(LegacyModelFlags.from("AC123451P")).isEqualTo(
                new LegacyModelFlags(false, false, true, false, false, false));
        assertThat(LegacyModelFlags.from("AC123451D")).isEqualTo(
                new LegacyModelFlags(false, false, true, false, false, false));
        assertThat(LegacyModelFlags.from("AP123456D1C")).isEqualTo(
                new LegacyModelFlags(false, false, false, true, false, false));
        assertThat(LegacyModelFlags.from("AP123456P")).isEqualTo(
                new LegacyModelFlags(false, false, false, true, false, false));
        assertThat(LegacyModelFlags.from("AP123456D1H")).isEqualTo(
                new LegacyModelFlags(false, false, false, false, true, false));
        assertThat(LegacyModelFlags.from("AP230123P")).isEqualTo(
                new LegacyModelFlags(false, false, false, true, false, false));
        assertThat(LegacyModelFlags.from("AP290123P")).isEqualTo(
                new LegacyModelFlags(false, false, false, true, false, false));
        assertThat(LegacyModelFlags.from("AC123456F")).isEqualTo(
                new LegacyModelFlags(false, false, false, false, false, true));
        assertThat(LegacyModelFlags.from("AP123456F")).isEqualTo(
                new LegacyModelFlags(false, false, false, false, false, true));
    }

    @Test
    void rejectsShortAndNonAcApCodes() {
        assertThat(LegacyModelFlags.from("AC12345")).isEqualTo(LegacyModelFlags.NONE);
        assertThat(LegacyModelFlags.from("ZZ123456P")).isEqualTo(LegacyModelFlags.NONE);
        assertThat(LegacyModelFlags.from(null)).isEqualTo(LegacyModelFlags.NONE);
    }

    @Test
    void preservesLegacy360MarkerInModelNameOnlyFixture() {
        assertThat(LegacyModelFlags.from("AM360AXVHHR1SY").is360()).isTrue();
    }
}
