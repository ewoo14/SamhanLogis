package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SetRiUsageMatcherTest {

    @Test
    @DisplayName("같은 원본 행의 실내기·실외기·구성품 가격이 세트 정답과 같으면 riUsage가 완전 소비된다")
    void consumesCompleteSetBySourceRow() {
        var rows = List.of(
                new SetRiUsageMatcher.Row("doc-1", 3, "AC123INDOOR", "INDOOR", new BigDecimal("600")),
                new SetRiUsageMatcher.Row("doc-1", 4, "AC123OUTDOOR", "OUTDOOR", new BigDecimal("400")),
                new SetRiUsageMatcher.Row("doc-1", 5, "PANEL-1", "PANEL", new BigDecimal("100")));
        var definition = new SetRiUsageMatcher.SetDefinition("AC123SET", List.of(
                new SetRiUsageMatcher.Component("AC123INDOOR", "INDOOR", new BigDecimal("600")),
                new SetRiUsageMatcher.Component("AC123OUTDOOR", "OUTDOOR", new BigDecimal("400")),
                new SetRiUsageMatcher.Component("PANEL-1", "PANEL", new BigDecimal("100"))));

        var result = new SetRiUsageMatcher().match(rows, List.of(definition), BigDecimal.ZERO);

        assertThat(result).containsEntry(new SetRiUsageMatcher.RowKey("doc-1", 3),
                new SetRiUsageMatcher.Usage(1, 1));
        assertThat(result).containsEntry(new SetRiUsageMatcher.RowKey("doc-1", 4),
                new SetRiUsageMatcher.Usage(1, 1));
        assertThat(result).containsEntry(new SetRiUsageMatcher.RowKey("doc-1", 5),
                new SetRiUsageMatcher.Usage(1, 1));
    }

    @Test
    @DisplayName("다른 문서의 구성품은 소비하지 않아 riUsage가 문서 경계를 넘지 않는다")
    void doesNotConsumeAcrossDocuments() {
        var rows = List.of(
                new SetRiUsageMatcher.Row("doc-1", 3, "AC123INDOOR", "INDOOR", new BigDecimal("600")),
                new SetRiUsageMatcher.Row("doc-2", 4, "AC123OUTDOOR", "OUTDOOR", new BigDecimal("400")));
        var definition = new SetRiUsageMatcher.SetDefinition("AC123SET", List.of(
                new SetRiUsageMatcher.Component("AC123INDOOR", "INDOOR", new BigDecimal("600")),
                new SetRiUsageMatcher.Component("AC123OUTDOOR", "OUTDOOR", new BigDecimal("400"))));

        var result = new SetRiUsageMatcher().match(rows, List.of(definition), BigDecimal.ZERO);

        assertThat(result.values()).allMatch(usage -> usage.used() == 0);
    }
}
