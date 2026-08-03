package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class LegacyVerificationChainTest {

    @Test
    void portsEveryLegacyBranchAndKeepsOrderedZoneTransitions() {
        List<LegacyVerificationChain.Row> rows = List.of(
                row("운임", "운임", "MATERIAL", false),
                row("구형50", "NS080MWXVGW", "MATERIAL", true),
                row("구형납품가", "LEGACY-OTHER", "MATERIAL", true),
                row("유연호스 1WAY", "AXJ-YA1509N", "MATERIAL", false),
                row("본체", "AC023CN1DBC1", "INDOOR", false),
                row("상업 멀티", "AM023TNVDBH1", "MATERIAL", false),
                row("패널", "PC1BWCK3NW", "PANEL", false),
                row("홈 멀티", "AJ040RXH4BC1", "MATERIAL", false),
                row("비대상 본체", "QA797-PART-01", "INDOOR", false),
                row("패널2", "PC12345", "PANEL", false));

        List<LegacyVerificationChain.RoutedRow> routed = LegacyVerificationChain.route(rows);

        assertThat(LegacyVerificationChain.branch(routed.get(0), true))
                .isEqualTo(LegacyVerificationChain.Branch.FREIGHT_OR_CUTTING);
        assertThat(LegacyVerificationChain.branch(routed.get(1), true))
                .isEqualTo(LegacyVerificationChain.Branch.OLD_RATE_50);
        assertThat(LegacyVerificationChain.branch(routed.get(2), true))
                .isEqualTo(LegacyVerificationChain.Branch.OLD_DELIVERY);
        assertThat(LegacyVerificationChain.branch(routed.get(3), true))
                .isEqualTo(LegacyVerificationChain.Branch.ACCESSORY_DELIVERY);
        assertThat(LegacyVerificationChain.branch(routed.get(4), true))
                .isEqualTo(LegacyVerificationChain.Branch.SINGLE_MAIN);
        assertThat(routed.get(5).zone()).isEqualTo(LegacyVerificationChain.Zone.COMM_MULTI);
        assertThat(LegacyVerificationChain.branch(routed.get(6), true))
                .isEqualTo(LegacyVerificationChain.Branch.MULTI_RATE);
        assertThat(routed.get(7).zone()).isEqualTo(LegacyVerificationChain.Zone.HOME_MULTI);
        assertThat(LegacyVerificationChain.branch(routed.get(8), true))
                .isEqualTo(LegacyVerificationChain.Branch.MULTI_RATE);
        assertThat(LegacyVerificationChain.branch(routed.get(9), true))
                .isEqualTo(LegacyVerificationChain.Branch.MULTI_RATE);

        assertThat(LegacyVerificationChain.branch(routed.get(3), false))
                .isEqualTo(LegacyVerificationChain.Branch.ALWAYS_TRUE);
        assertThat(LegacyVerificationChain.branch(routed.get(6), false))
                .isEqualTo(LegacyVerificationChain.Branch.ALWAYS_TRUE);
    }

    @Test
    void targetPredicateAndZoneAreRequiredBeforeRiUsageCanRun() {
        List<LegacyVerificationChain.Row> rows = List.of(
                row("비대상 본체", "QA797-PART-01", "INDOOR", false),
                row("패널", "PC1BWCK3NW", "PANEL", false),
                row("대상 본체", "AC023CN1DBC1", "INDOOR", false),
                row("패널2", "PC12345", "PANEL", false));

        List<LegacyVerificationChain.RoutedRow> routed = LegacyVerificationChain.route(rows);

        assertThat(routed.get(0).zone()).isEqualTo(LegacyVerificationChain.Zone.UNKNOWN);
        assertThat(LegacyVerificationChain.branch(routed.get(1), true))
                .isEqualTo(LegacyVerificationChain.Branch.DEFAULT);
        assertThat(routed.get(2).zone()).isEqualTo(LegacyVerificationChain.Zone.SINGLE);
        assertThat(LegacyVerificationChain.branch(routed.get(3), true))
                .isEqualTo(LegacyVerificationChain.Branch.SINGLE_ACCESSORY);

        Boolean verified = LegacyVerificationChain.riUsageDecision(
                routed.get(3), routed,
                Map.of("main", new LegacySetMatcher.Usage(1, 0),
                        "panel", new LegacySetMatcher.Usage(1, 0)),
                new BigDecimal("1"), new BigDecimal("1"));
        assertThat(verified).isFalse();
    }

    @Test
    void frontBranchesProduceTheirOwnResultAndNeverReceiveRiUsageOverride() {
        List<LegacyVerificationChain.Row> rows = List.of(
                row("본체", "AC023CN1DBC1", "INDOOR", false),
                row("상업 멀티", "AM023TNVDBH1", "MATERIAL", false),
                row("패널", "PC1BWCK3NW", "PANEL", false),
                row("운임", "운임", "MATERIAL", false));
        List<LegacyVerificationChain.RoutedRow> routed = LegacyVerificationChain.route(rows);
        DiscountRevalidator revalidator = new DiscountRevalidator();

        assertThat(LegacyVerificationChain.riUsageDecision(
                routed.get(2), routed, Map.of(), new BigDecimal("55000"), new BigDecimal("70000")))
                .isNull();
        DiscountRevalidator.Revalidation multi = revalidator.revalidateByLegacyBranch(
                "패널", "PC1BWCK3NW", new BigDecimal("52000"), new BigDecimal("100000"),
                new BigDecimal("70000"), null,
                DiscountRevalidator.GlobalDiscount.found(new BigDecimal("0.45"), new BigDecimal("0.48")),
                com.samhanair.logis.accounting.client.ProductLabelMatch.Status.MATCHED,
                LegacyVerificationChain.Branch.MULTI_RATE,
                LegacyVerificationChain.Zone.COMM_MULTI);
        assertThat(multi.expectedRate()).isEqualTo(48);
        assertThat(multi.verified()).isTrue();

        DiscountRevalidator.Revalidation freight = revalidator.revalidateByLegacyBranch(
                "운임", "운임", null, null, null, null,
                DiscountRevalidator.GlobalDiscount.unavailable(),
                com.samhanair.logis.accounting.client.ProductLabelMatch.Status.NOT_FOUND,
                LegacyVerificationChain.Branch.FREIGHT_OR_CUTTING,
                LegacyVerificationChain.Zone.UNKNOWN);
        assertThat(freight.verified()).isTrue();
    }

    @Test
    void oldBranchesUseLegacyRateOrDeliveryComparison() {
        DiscountRevalidator revalidator = new DiscountRevalidator();
        DiscountRevalidator.Revalidation fifty = revalidator.revalidateByLegacyBranch(
                "구형50", "NS080MWXVGW", new BigDecimal("50000"), new BigDecimal("100000"),
                new BigDecimal("70000"), null, DiscountRevalidator.GlobalDiscount.unavailable(),
                com.samhanair.logis.accounting.client.ProductLabelMatch.Status.MATCHED,
                LegacyVerificationChain.Branch.OLD_RATE_50, LegacyVerificationChain.Zone.UNKNOWN);
        DiscountRevalidator.Revalidation delivery = revalidator.revalidateByLegacyBranch(
                "구형납품가", "LEGACY-OTHER", new BigDecimal("70000"), new BigDecimal("100000"),
                new BigDecimal("70000"), null, DiscountRevalidator.GlobalDiscount.unavailable(),
                com.samhanair.logis.accounting.client.ProductLabelMatch.Status.MATCHED,
                LegacyVerificationChain.Branch.OLD_DELIVERY, LegacyVerificationChain.Zone.UNKNOWN);

        assertThat(fifty.expectedRate()).isEqualTo(50);
        assertThat(fifty.verified()).isTrue();
        assertThat(delivery.verified()).isTrue();
    }

    @Test
    void mainRiUsageRetainsAllScopesWhileAccessoryDecisionRemainsPerScope() {
        List<LegacyVerificationChain.Row> rows = List.of(
                row("D1", "본체", "AC023CN1DBC1", "INDOOR", false),
                row("D2", "본체", "AC023CN1DBC1", "INDOOR", false));
        List<LegacyVerificationChain.RoutedRow> routed = LegacyVerificationChain.route(rows);

        assertThat(LegacyVerificationChain.riUsageDecision(
                routed.get(0), routed,
                Map.of("main-D1", new LegacySetMatcher.Usage(1, 1),
                        "main-D2", new LegacySetMatcher.Usage(1, 0)),
                new BigDecimal("1"), new BigDecimal("1")))
                .isFalse();
    }

    private static LegacyVerificationChain.Row row(
            String itemName, String modelToken, String kind, boolean oldProduct) {
        String sourceKey = kind.equals("PANEL") ? "panel" : kind.equals("INDOOR") ? "main" : modelToken;
        return new LegacyVerificationChain.Row("P1", "D1", sourceKey, itemName, modelToken, kind, oldProduct);
    }

    private static LegacyVerificationChain.Row row(
            String scopeKey, String itemName, String modelToken, String kind, boolean oldProduct) {
        return new LegacyVerificationChain.Row("P1", scopeKey, "main-" + scopeKey,
                itemName, modelToken, kind, oldProduct);
    }
}
