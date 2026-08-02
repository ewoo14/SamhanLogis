package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
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
}
