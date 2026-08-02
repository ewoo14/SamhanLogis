package com.samhanair.logis.accounting.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 레거시 일마감의 싱글 세트 수량 단위 소비 판정.
 *
 * <p>근거: {@code tools/legacy-gas/일마감 프로그램/Code.js:568-666}.
 * 원본 문서별 pool을 만들고 실내기 후보마다 필수 실외기와 선택 구성품을 같은
 * 문서에서만 찾아 가격 합계가 일치할 때만 소비한다. {@code ri}는 품목 의미가
 * 아니라 원본 행 번호이므로 반환 키는 문서와 행 번호를 함께 가진다.
 */
public final class SetRiUsageMatcher {

    public Map<RowKey, Usage> match(List<Row> rows, List<SetDefinition> definitions,
                                    BigDecimal optionDiscount) {
        Map<RowKey, MutableUsage> usage = new LinkedHashMap<>();
        Map<String, List<Row>> byDocument = new LinkedHashMap<>();
        for (Row row : rows) {
            usage.put(new RowKey(row.documentKey(), row.ri()), new MutableUsage(1, 0));
            byDocument.computeIfAbsent(row.documentKey(), ignored -> new ArrayList<>()).add(row);
        }
        List<SetDefinition> ordered = definitions.stream()
                .sorted(Comparator.comparingInt((SetDefinition d) -> d.components().size()).reversed())
                .toList();
        for (List<Row> documentRows : byDocument.values()) {
            List<Row> indoorRows = documentRows.stream()
                    .filter(row -> "INDOOR".equals(row.kind()))
                    .toList();
            for (Row indoor : indoorRows) {
                for (SetDefinition definition : ordered) {
                    Component indoorComponent = definition.components().stream()
                            .filter(component -> "INDOOR".equals(component.kind())
                                    && component.token().equals(indoor.token()))
                            .findFirst().orElse(null);
                    Component outdoor = definition.components().stream()
                            .filter(component -> "OUTDOOR".equals(component.kind()))
                            .findFirst().orElse(null);
                    if (indoorComponent == null || outdoor == null) {
                        continue;
                    }
                    List<Row> selected = new ArrayList<>();
                    selected.add(indoor);
                    Row out = unused(documentRows, usage, outdoor.token(), "OUTDOOR", selected);
                    if (out == null) {
                        continue;
                    }
                    selected.add(out);
                    boolean complete = true;
                    BigDecimal expected = indoorComponent.price().add(outdoor.price());
                    for (Component component : definition.components()) {
                        if ("INDOOR".equals(component.kind()) || "OUTDOOR".equals(component.kind())) {
                            continue;
                        }
                        Row optional = unused(documentRows, usage, component.token(), component.kind(), selected);
                        if (optional != null) {
                            selected.add(optional);
                            expected = expected.add(component.price());
                        }
                    }
                    expected = expected.subtract(optionDiscount == null ? BigDecimal.ZERO : optionDiscount);
                    BigDecimal actual = selected.stream().map(Row::unitPrice)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    if (actual.abs().compareTo(expected.abs()) != 0) {
                        continue;
                    }
                    selected.forEach(row -> usage.get(new RowKey(row.documentKey(), row.ri())).used++);
                    break;
                }
            }
        }
        Map<RowKey, Usage> result = new LinkedHashMap<>();
        usage.forEach((key, value) -> result.put(key, new Usage(value.total, value.used)));
        return result;
    }

    private static Row unused(List<Row> rows, Map<RowKey, MutableUsage> usage, String token,
                              String kind, List<Row> selected) {
        return rows.stream().filter(row -> token.equals(row.token()) && kind.equals(row.kind()))
                .filter(row -> usage.get(new RowKey(row.documentKey(), row.ri())).used == 0)
                .filter(row -> selected.stream().noneMatch(s -> s.ri() == row.ri()))
                .findFirst().orElse(null);
    }

    public record Row(String documentKey, int ri, String token, String kind, BigDecimal unitPrice) {}
    public record Component(String token, String kind, BigDecimal price) {}
    public record SetDefinition(String token, List<Component> components) {}
    public record RowKey(String documentKey, int ri) {}
    public record Usage(int total, int used) {}

    private static final class MutableUsage {
        private final int total;
        private int used;

        private MutableUsage(int total, int used) {
            this.total = total;
            this.used = used;
        }
    }
}
