package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class RiUsageDecisionTest {

    @Test
    void mainIsTrueOnlyWhenEverySourceRowUnitIsConsumed() {
        assertThat(RiUsageDecision.decide("INDOOR", List.of(
                new RiUsageDecision.Row("D1", "INDOOR"),
                new RiUsageDecision.Row("D1", "INDOOR")),
                Map.of("D1", new LegacySetMatcher.Usage(2, 2)))).isTrue();
        assertThat(RiUsageDecision.decide("INDOOR", List.of(
                new RiUsageDecision.Row("D1", "INDOOR"),
                new RiUsageDecision.Row("D1", "INDOOR")),
                Map.of("D1", new LegacySetMatcher.Usage(2, 1)))).isFalse();
    }

    @Test
    void accessoryIsFalseWhenMainInTheSameScopeIsIncomplete() {
        assertThat(RiUsageDecision.decide("PANEL", List.of(
                new RiUsageDecision.Row("D1", "PANEL"),
                new RiUsageDecision.Row("D1", "INDOOR")),
                Map.of("PANEL", new LegacySetMatcher.Usage(1, 0),
                        "INDOOR", new LegacySetMatcher.Usage(1, 0)))).isFalse();
    }

    @Test
    void accessoryIsTrueWithoutMainAndFallsBackWhenAllMainIsComplete() {
        assertThat(RiUsageDecision.decide("PANEL", List.of(
                new RiUsageDecision.Row("D1", "PANEL")),
                Map.of("PANEL", new LegacySetMatcher.Usage(1, 0)))).isTrue();
        assertThat(RiUsageDecision.decide("PANEL", List.of(
                new RiUsageDecision.Row("PANEL", "D1", "PANEL", "PANEL"),
                new RiUsageDecision.Row("INDOOR", "D1", "INDOOR", "INDOOR")),
                Map.of("PANEL", new LegacySetMatcher.Usage(1, 0),
                        "INDOOR", new LegacySetMatcher.Usage(1, 1)))).isNull();
    }
}
