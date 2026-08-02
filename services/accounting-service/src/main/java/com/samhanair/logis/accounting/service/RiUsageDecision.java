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
                        focusToken, focusKind,
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

    private static Boolean decideAccessoryScope(String focusToken, String focusKind, List<Row> rows,
                                                Map<String, LegacySetMatcher.Usage> usage) {
        boolean hasPresentMain = rows.stream().anyMatch(row -> isPresentMain(row.kind()));
        boolean hasFailedMain = rows.stream()
                .filter(row -> isFailedMain(row.kind()))
                .anyMatch(row -> !fullyConsumed(usage, row.sourceKey()));
        boolean singleZone = false;
        Boolean result = Boolean.TRUE;
        for (Row row : rows) {
            if (isPresentMain(row.kind())) {
                singleZone = true;
            }
            if (!focusToken.equals(row.modelToken()) || !focusKind.equals(row.kind())) {
                continue;
            }
            // Code.js:733-734 — 대상 행이 SINGLE zone에 들어가기 전이면
            // riUsage 분기를 타지 않고 기존 확인=true를 유지한다.
            Boolean rowResult;
            if (!singleZone || !hasPresentMain) {
                rowResult = Boolean.TRUE;
            } else if (fullyConsumed(usage, row.sourceKey())) {
                // Code.js:702-703 — 자기 소비 완료는 항상 true.
                rowResult = Boolean.TRUE;
            } else if (hasFailedMain) {
                // Code.js:697-705 — failed-main 집합은 INDOOR/OUTDOOR만 본다.
                rowResult = Boolean.FALSE;
            } else {
                // Code.js:706-708 — 나머지는 기존 단가 판정(null)으로 돌린다.
                rowResult = null;
            }
            if (Boolean.FALSE.equals(rowResult)) {
                result = Boolean.FALSE;
            } else if (rowResult == null && !Boolean.FALSE.equals(result)) {
                result = null;
            }
        }
        return result;
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
