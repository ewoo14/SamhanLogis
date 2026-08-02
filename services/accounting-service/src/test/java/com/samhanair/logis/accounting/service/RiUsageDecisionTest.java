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

    @Test
    void legacyQTokenReachesSubIndoorRiUsageEvenWhenCatalogSaysAccessory() {
        String model = "AR06A9170HNQ";

        assertThat(LegacyModelKindClassifier.riUsageKind("ACCESSORY", model))
                .isEqualTo("SUB_INDOOR");
        assertThat(RiUsageDecision.decide(model, "SUB_INDOOR", List.of(
                new RiUsageDecision.Row("SLIP-Q#1", "SLIP-Q", model, "SUB_INDOOR")),
                Map.of("SLIP-Q#1", new LegacySetMatcher.Usage(1, 0))))
                .isFalse();
    }

    @Test
    void concreteCatalogKindIsNotReclassifiedByLegacyToken() {
        assertThat(LegacyModelKindClassifier.riUsageKind("PANEL", "AR06A9170HNQ"))
                .isEqualTo("PANEL");
        assertThat(LegacyModelKindClassifier.riUsageKind("ACCESSORY", "QA797-PART-01"))
                .isEqualTo("ACCESSORY");
    }

    @Test
    void partiallyConsumedSubIndoorDoesNotFailACompletedSiblingRemote() {
        assertThat(RiUsageDecision.decide("REMOTE-1", "REMOTE", List.of(
                new RiUsageDecision.Row("REMOTE-1", "D1", "REMOTE-1", "REMOTE"),
                new RiUsageDecision.Row("Q-1", "D1", "AR06A9170HNQ", "SUB_INDOOR")),
                Map.of("REMOTE-1", new LegacySetMatcher.Usage(1, 1),
                        "Q-1", new LegacySetMatcher.Usage(2, 1))))
                .isTrue();
    }

    @Test
    void legacyClassifierIncludesApAndPcRulesWithoutOverridingConcreteCatalogKinds() {
        assertThat(LegacyModelKindClassifier.riUsageKind("ACCESSORY", "AP052CNPFBH1PP"))
                .isEqualTo("INDOOR");
        assertThat(LegacyModelKindClassifier.riUsageKind("ACCESSORY", "PC1BWCK3NW"))
                .isEqualTo("ACCESSORY");
        assertThat(LegacyModelKindClassifier.riUsageKind("PANEL", "PC1BWCK3NW"))
                .isEqualTo("PANEL");
    }
}
