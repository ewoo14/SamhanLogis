package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class LegacySetMatcherTest {

    @Test
    void matchesFirstCompleteSetByIndoorOutdoorAndComponentPrice() {
        LegacySetMatcher matcher = new LegacySetMatcher();
        List<LegacySetMatcher.InvoiceLine> pool = List.of(
                new LegacySetMatcher.InvoiceLine("AC060CN4PBH1", "INDOOR", new BigDecimal("100000")),
                new LegacySetMatcher.InvoiceLine("AC060CXAPBH1", "OUTDOOR", new BigDecimal("200000")));
        List<LegacySetMatcher.SetCandidate> candidates = List.of(
                new LegacySetMatcher.SetCandidate("AC060CS4PBH2SY", List.of(
                        new LegacySetMatcher.Component("AC060CN4PBH1", "INDOOR", new BigDecimal("100000")),
                        new LegacySetMatcher.Component("AC060CXAPBH1", "OUTDOOR", new BigDecimal("200000")))));

        assertThat(matcher.findFirstCompleteSet(pool, candidates)).contains("AC060CS4PBH2SY");
    }

    @Test
    void matchesOutdoorWhenOptionalCatalogComponentIsNotOnTheInvoice() {
        LegacySetMatcher matcher = new LegacySetMatcher();
        List<LegacySetMatcher.InvoiceLine> pool = List.of(
                new LegacySetMatcher.InvoiceLine("AC060CN4PBH1", "INDOOR", new BigDecimal("100000")),
                new LegacySetMatcher.InvoiceLine("AC060CXAPBH1", "OUTDOOR", new BigDecimal("200000")));
        List<LegacySetMatcher.SetCandidate> candidates = List.of(
                new LegacySetMatcher.SetCandidate("AC060CS4PBH2SY", List.of(
                        new LegacySetMatcher.Component("AC060CN4PBH1", "INDOOR", new BigDecimal("100000")),
                        new LegacySetMatcher.Component("AC060CXAPBH1", "OUTDOOR", new BigDecimal("200000")),
                        new LegacySetMatcher.Component("OPTION-4WAY", "OPTION", new BigDecimal("30000")))));

        assertThat(matcher.findFirstCompleteSet(pool, candidates)).contains("AC060CS4PBH2SY");
    }

    @Test
    void usesStableLargestCandidateOrderAndDeliveryPriceAggregateWithDiscount() {
        LegacySetMatcher matcher = new LegacySetMatcher();
        List<LegacySetMatcher.InvoiceLine> pool = List.of(
                new LegacySetMatcher.InvoiceLine("INDOOR", "INDOOR", new BigDecimal("100"), "P1"),
                new LegacySetMatcher.InvoiceLine("OUTDOOR", "OUTDOOR", new BigDecimal("180"), "P1"),
                new LegacySetMatcher.InvoiceLine("OPTION", "OPTION", BigDecimal.ZERO, "P1"));
        List<LegacySetMatcher.SetCandidate> candidates = List.of(
                new LegacySetMatcher.SetCandidate("AP230SHORT", List.of(
                        new LegacySetMatcher.Component("INDOOR", "INDOOR", new BigDecimal("100")),
                        new LegacySetMatcher.Component("OUTDOOR", "OUTDOOR", new BigDecimal("200")))),
                new LegacySetMatcher.SetCandidate("AP230LONG", List.of(
                        new LegacySetMatcher.Component("INDOOR", "INDOOR", new BigDecimal("100")),
                        new LegacySetMatcher.Component("OUTDOOR", "OUTDOOR", new BigDecimal("200")),
                        new LegacySetMatcher.Component("OPTION", "OPTION", new BigDecimal("30")))));

        List<LegacySetMatcher.Match> matches = matcher.findMatches(pool, candidates,
                Map.of("P1", DiscountRevalidator.GlobalDiscount.found(
                        null, null, null, null, null, new BigDecimal("20"), null, null)));

        assertThat(matches).extracting(LegacySetMatcher.Match::setName).containsExactly("AP230SHORT");
    }

    @Test
    void expandsAndConsumesEachPositiveQuantityAsAnIndependentLegacyPoolLine() {
        LegacySetMatcher matcher = new LegacySetMatcher();
        List<LegacySetMatcher.InvoiceLine> pool = List.of(
                new LegacySetMatcher.InvoiceLine("INDOOR", "INDOOR", new BigDecimal("100"), "P1"),
                new LegacySetMatcher.InvoiceLine("INDOOR", "INDOOR", new BigDecimal("100"), "P1"),
                new LegacySetMatcher.InvoiceLine("OUTDOOR", "OUTDOOR", new BigDecimal("200"), "P1"),
                new LegacySetMatcher.InvoiceLine("OUTDOOR", "OUTDOOR", new BigDecimal("200"), "P1"));
        List<LegacySetMatcher.SetCandidate> candidates = List.of(
                new LegacySetMatcher.SetCandidate("SET", List.of(
                        new LegacySetMatcher.Component("INDOOR", "INDOOR", new BigDecimal("100")),
                        new LegacySetMatcher.Component("OUTDOOR", "OUTDOOR", new BigDecimal("200")))));

        assertThat(matcher.findMatches(pool, candidates, Map.of())).hasSize(2);
    }
}
