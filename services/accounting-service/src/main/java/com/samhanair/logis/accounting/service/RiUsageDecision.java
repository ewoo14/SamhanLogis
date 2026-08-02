package com.samhanair.logis.accounting.service;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Code.js:690-712의 riUsage 기반 확인 분기. */
final class RiUsageDecision {

    private RiUsageDecision() {
    }

    static Boolean decide(String focusKind, List<Row> rows,
                          Map<String, LegacySetMatcher.Usage> usage) {
        return decide(focusKind, focusKind, rows, usage);
    }

    static Boolean decide(String focusToken, String focusKind, List<Row> rows,
                          Map<String, LegacySetMatcher.Usage> usage) {
        List<Row> focusRows = rows.stream().filter(row -> focusToken.equals(row.modelToken())
                && focusKind.equals(row.kind())).toList();
        if (focusRows.isEmpty()) {
            return null;
        }
        if (isMain(focusKind)) {
            return focusRows.stream().allMatch(row -> fullyConsumed(usage, row.sourceKey()));
        }
        if (!isAccessory(focusKind)) {
            return Boolean.TRUE;
        }

        List<Boolean> perScope = focusRows.stream().map(Row::scopeKey).distinct()
                .map(scope -> decideAccessoryScope(
                        focusRows.stream().filter(row -> Objects.equals(scope, row.scopeKey())).toList(),
                        rows.stream().filter(row -> Objects.equals(scope, row.scopeKey())).toList(),
                        usage))
                .toList();
        if (perScope.stream().anyMatch(Boolean.FALSE::equals)) {
            return Boolean.FALSE;
        }
        if (perScope.stream().anyMatch(value -> value == null)) {
            return null;
        }
        return Boolean.TRUE;
    }

    private static Boolean decideAccessoryScope(List<Row> focusRows, List<Row> rows,
                                                Map<String, LegacySetMatcher.Usage> usage) {
        if (focusRows.stream().allMatch(row -> fullyConsumed(usage, row.sourceKey()))) {
            return Boolean.TRUE;
        }
        boolean hasPresentMain = rows.stream().anyMatch(row -> isPresentMain(row.kind()));
        if (!hasPresentMain) {
            return Boolean.TRUE;
        }
        boolean hasFailedMain = rows.stream()
                .filter(row -> isFailedMain(row.kind()))
                .anyMatch(row -> !fullyConsumed(usage, row.sourceKey()));
        return hasFailedMain ? Boolean.FALSE : null;
    }

    private static boolean fullyConsumed(Map<String, LegacySetMatcher.Usage> usage, String sourceKey) {
        LegacySetMatcher.Usage value = usage.get(sourceKey);
        return value != null && value.used() == value.total();
    }

    private static boolean isMain(String kind) {
        return isPresentMain(kind);
    }

    private static boolean isAccessory(String kind) {
        return "PANEL".equals(kind) || "REMOTE".equals(kind) || "MATERIAL".equals(kind);
    }

    private static boolean isFailedMain(String kind) {
        return "INDOOR".equals(kind) || "OUTDOOR".equals(kind);
    }

    private static boolean isPresentMain(String kind) {
        return isFailedMain(kind) || "SUB_INDOOR".equals(kind);
    }

    record Row(String sourceKey, String scopeKey, String modelToken, String kind) {
        Row(String sourceKey, String kind) {
            this(sourceKey, sourceKey, kind, kind);
        }
    }
}
