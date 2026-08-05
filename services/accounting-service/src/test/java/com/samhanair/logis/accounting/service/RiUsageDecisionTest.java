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
    void accessoryBeforeIncompleteMainUsesUnknownZoneTrue() {
        assertThat(RiUsageDecision.decide("PANEL", List.of(
                new RiUsageDecision.Row("D1", "PANEL"),
                new RiUsageDecision.Row("D1", "INDOOR")),
                Map.of("PANEL", new LegacySetMatcher.Usage(1, 0),
                        "INDOOR", new LegacySetMatcher.Usage(1, 0)))).isTrue();
    }

    @Test
    void accessoryAfterIncompleteMainUsesFailedMainDecision() {
        assertThat(RiUsageDecision.decide("PANEL", List.of(
                new RiUsageDecision.Row("INDOOR", "D1", "INDOOR", "INDOOR"),
                new RiUsageDecision.Row("PANEL", "D1", "PANEL", "PANEL")),
                Map.of("PANEL", new LegacySetMatcher.Usage(1, 0),
                        "INDOOR", new LegacySetMatcher.Usage(1, 0)))).isFalse();
    }

    @Test
    void accessoryAfterIncompleteSubIndoorFallsBackBecauseItIsNotFailedMain() {
        assertThat(RiUsageDecision.decide("MATERIAL", List.of(
                new RiUsageDecision.Row("Q", "D1", "Q", "SUB_INDOOR"),
                new RiUsageDecision.Row("M", "D1", "M", "MATERIAL")),
                Map.of("Q", new LegacySetMatcher.Usage(1, 0),
                        "M", new LegacySetMatcher.Usage(1, 0)))).isNull();
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
                        "INDOOR", new LegacySetMatcher.Usage(1, 1)))).isTrue();
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
        assertThat(LegacyModelKindClassifier.fallbackKind("PC1BWCK3NW"))
                .isEqualTo("PANEL");
        assertThat(LegacyModelKindClassifier.fallbackKind("AR-EC05"))
                .isEqualTo("REMOTE");
        assertThat(LegacyModelKindClassifier.fallbackKind("AC023CA1DBC1"))
                .isEqualTo("MATERIAL");
        assertThat(LegacyModelKindClassifier.fallbackKind("AP052CA1DBC1"))
                .isEqualTo("MATERIAL");
        assertThat(LegacyModelKindClassifier.fallbackKind("AF17B6474GZQ"))
                .isEqualTo("MATERIAL");
        assertThat(LegacyModelKindClassifier.riUsageKind("PANEL", "PC1BWCK3NW"))
                .isEqualTo("PANEL");
    }

    @Test
    void subIndoorAloneStillCountsAsMainForAccessoryFallback() {
        assertThat(RiUsageDecision.decide("FPC-1412YAF2", "MATERIAL", List.of(
                new RiUsageDecision.Row("Q-1", "D1", "AR06A9170HNQ", "SUB_INDOOR"),
                new RiUsageDecision.Row("MAT-1", "D1", "FPC-1412YAF2", "MATERIAL")),
                Map.of("Q-1", new LegacySetMatcher.Usage(1, 0),
                        "MAT-1", new LegacySetMatcher.Usage(1, 0))))
                .isNull();
    }

    @Test
    void legacyMainPresenceAndFailedMainMatrixAreBothCovered() {
        for (String mainKind : List.of("INDOOR", "OUTDOOR", "SUB_INDOOR")) {
            assertThat(RiUsageDecision.decide("MAIN", mainKind,
                    List.of(new RiUsageDecision.Row("MAIN", "D1", "MAIN", mainKind)),
                    Map.of("MAIN", new LegacySetMatcher.Usage(1, 1)))).isTrue();
            assertThat(RiUsageDecision.decide("MAIN", mainKind,
                    List.of(new RiUsageDecision.Row("MAIN", "D1", "MAIN", mainKind)),
                    Map.of("MAIN", new LegacySetMatcher.Usage(1, 0)))).isFalse();
        }

        List<RiUsageDecision.Row> indoorAndMaterial = List.of(
                new RiUsageDecision.Row("I", "D1", "I", "INDOOR"),
                new RiUsageDecision.Row("M", "D1", "M", "MATERIAL"));
        assertThat(RiUsageDecision.decide("M", "MATERIAL", indoorAndMaterial,
                Map.of("I", new LegacySetMatcher.Usage(1, 1),
                        "M", new LegacySetMatcher.Usage(1, 0)))).isNull();
        assertThat(RiUsageDecision.decide("M", "MATERIAL", indoorAndMaterial,
                Map.of("I", new LegacySetMatcher.Usage(1, 0),
                        "M", new LegacySetMatcher.Usage(1, 0)))).isFalse();
        assertThat(RiUsageDecision.decide("M", "MATERIAL", indoorAndMaterial,
                Map.of("I", new LegacySetMatcher.Usage(1, 0),
                        "M", new LegacySetMatcher.Usage(1, 1)))).isTrue();

        List<RiUsageDecision.Row> subAndMaterial = List.of(
                new RiUsageDecision.Row("Q", "D1", "Q", "SUB_INDOOR"),
                new RiUsageDecision.Row("M", "D1", "M", "MATERIAL"));
        assertThat(RiUsageDecision.decide("M", "MATERIAL", subAndMaterial,
                Map.of("Q", new LegacySetMatcher.Usage(1, 0),
                        "M", new LegacySetMatcher.Usage(1, 0)))).isNull();
        assertThat(RiUsageDecision.decide("M", "MATERIAL", subAndMaterial,
                Map.of("Q", new LegacySetMatcher.Usage(1, 1),
                        "M", new LegacySetMatcher.Usage(1, 0)))).isNull();

        assertThat(RiUsageDecision.decide("M", "MATERIAL",
                List.of(new RiUsageDecision.Row("M", "D1", "M", "MATERIAL")),
                Map.of("M", new LegacySetMatcher.Usage(1, 0)))).isTrue();
        assertThat(RiUsageDecision.decide("X", "ACCESSORY",
                List.of(new RiUsageDecision.Row("X", "D1", "X", "ACCESSORY")),
                Map.of("X", new LegacySetMatcher.Usage(1, 0)))).isTrue();
    }

    @Test
    void differentScopesDoNotCollapseTwoLegacyTrueResultsIntoFalse() {
        List<RiUsageDecision.Row> rows = List.of(
                new RiUsageDecision.Row("M-A", "DOC-A", "M", "MATERIAL"),
                new RiUsageDecision.Row("M-B", "DOC-B", "M", "MATERIAL"),
                new RiUsageDecision.Row("O-B", "DOC-B", "O", "OUTDOOR"));
        assertThat(RiUsageDecision.decide("M", "MATERIAL", rows,
                Map.of("M-A", new LegacySetMatcher.Usage(1, 0),
                        "M-B", new LegacySetMatcher.Usage(1, 1),
                        "O-B", new LegacySetMatcher.Usage(1, 0))))
                .isTrue();
    }
}
