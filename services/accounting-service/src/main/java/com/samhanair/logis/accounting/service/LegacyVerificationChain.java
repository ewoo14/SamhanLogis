package com.samhanair.logis.accounting.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * Code.js:483-498, 668-735의 ordered zone/verification branch chain.
 *
 * <p>이 타입은 세트 {@code riUsage} 계산을 별도 후처리로 취급하지 않는다. 먼저 원천 행
 * 순서대로 레거시 zone을 확정하고, 그 확정 결과로 최종 branch를 선택한다. 따라서 앞 branch의
 * {@code true} 또는 가격 판정을 뒤의 riUsage가 다시 덮을 수 없다.
 */
final class LegacyVerificationChain {

    private static final Pattern FREIGHT_OR_CUTTING = Pattern.compile("(운임|절삭)");
    private static final Pattern ACCESSORY_LABEL = Pattern.compile("(유연호스|발통세트|일자발|방진가대)");
    private static final Pattern MULTI_LABEL = Pattern.compile("(?i)(멀티|MULTI)");
    private static final Pattern TARGET_MODEL = Pattern.compile("^(A[CP]\\d{3}|AF\\d{2}|AR\\d{2}).*");
    private static final Pattern OLD_RATE_TOKEN = Pattern.compile("^(AM|NJ|NS|AVX).*");

    private LegacyVerificationChain() {
    }

    enum Zone {
        UNKNOWN,
        SINGLE,
        COMM_MULTI,
        HOME_MULTI
    }

    enum Branch {
        /** Code.js:669-670. */
        FREIGHT_OR_CUTTING,
        /** Code.js:672-674 and :715-717 when isMultiApplied=false. */
        ALWAYS_TRUE,
        /** Code.js:675-678. */
        OLD_RATE_50,
        /** Code.js:679-682 and :687-689. */
        OLD_DELIVERY,
        /** Code.js:687-689. */
        ACCESSORY_DELIVERY,
        /** Code.js:690-708. */
        SINGLE_ACCESSORY,
        /** Code.js:709-710. */
        SINGLE_MAIN,
        /** Code.js:711-713. */
        SINGLE_DEFAULT,
        /** Code.js:718-731. */
        MULTI_RATE,
        /** Code.js:733-734. */
        DEFAULT
    }

    /** 최종 branch 선택에 필요한, API 원천 행의 순서 보존 형태. */
    record Row(String partnerCode, String scopeKey, String sourceKey,
               String itemName, String modelToken, String kind, boolean oldProduct) {
    }

    record RoutedRow(Row row, Zone zone) {
    }

    /**
     * 전표(scope)별로 currentZone을 초기화하고 입력 순서대로 전이한다.
     * Code.js의 item._zone은 전환 행 자신부터 새 zone을 가진다.
     */
    static List<RoutedRow> route(List<Row> rows) {
        Map<String, Zone> zoneByScope = new LinkedHashMap<>();
        List<RoutedRow> result = new ArrayList<>(rows.size());
        for (Row row : rows) {
            String scope = scopeKey(row);
            Zone zone = zoneByScope.getOrDefault(scope, Zone.UNKNOWN);
            String token = upper(row.modelToken());
            if (isCommercialMultiToken(token)) {
                zone = Zone.COMM_MULTI;
            } else if (isHomeMultiToken(token)) {
                zone = Zone.HOME_MULTI;
            } else if (isTargetModelCode(token) && isPresentMain(row.kind())) {
                zone = Zone.SINGLE;
            }
            zoneByScope.put(scope, zone);
            result.add(new RoutedRow(row, zone));
        }
        return result;
    }

    /** 레거시 if/else-if 순서 그대로 최종 branch를 선택한다. */
    static Branch branch(RoutedRow routed, boolean isMultiApplied) {
        Row row = routed.row();
        String itemName = row.itemName() == null ? "" : row.itemName();
        String token = upper(row.modelToken());
        if (FREIGHT_OR_CUTTING.matcher(itemName).find()) {
            return Branch.FREIGHT_OR_CUTTING;
        }
        if (row.oldProduct()) {
            if (!isMultiApplied) {
                return Branch.ALWAYS_TRUE;
            }
            return OLD_RATE_TOKEN.matcher(token).matches()
                    ? Branch.OLD_RATE_50 : Branch.OLD_DELIVERY;
        }
        if (ACCESSORY_LABEL.matcher(itemName).find() || token.startsWith("AXJ")) {
            return isMultiApplied ? Branch.ACCESSORY_DELIVERY : Branch.ALWAYS_TRUE;
        }
        if (routed.zone() == Zone.SINGLE) {
            if (isAccessory(row.kind())) {
                return Branch.SINGLE_ACCESSORY;
            }
            if (isPresentMain(row.kind())) {
                return Branch.SINGLE_MAIN;
            }
            return Branch.SINGLE_DEFAULT;
        }
        if (routed.zone() == Zone.COMM_MULTI || routed.zone() == Zone.HOME_MULTI
                || MULTI_LABEL.matcher(itemName).find()) {
            return isMultiApplied ? Branch.MULTI_RATE : Branch.ALWAYS_TRUE;
        }
        return Branch.DEFAULT;
    }

    /**
     * SINGLE branch에만 riUsage를 적용한다. 앞 branch에 해당하면 null을 반환해 호출자가
     * 기존 revalidation 결과를 그대로 보존하게 한다.
     */
    static Boolean riUsageDecision(RoutedRow focus, List<RoutedRow> rows,
                                   Map<String, LegacySetMatcher.Usage> usage,
                                   BigDecimal unitPrice, BigDecimal deliveryPrice) {
        Branch focusBranch = branch(focus, true);
        if (focusBranch == Branch.SINGLE_MAIN) {
            return focusRows(focus, rows).stream()
                    .allMatch(row -> fullyConsumed(usage, row.row().sourceKey()));
        }
        if (focusBranch == Branch.SINGLE_DEFAULT) {
            return Boolean.TRUE;
        }
        if (focusBranch != Branch.SINGLE_ACCESSORY) {
            return null;
        }

        Boolean result = Boolean.TRUE;
        for (RoutedRow focusRow : focusRows(focus, rows)) {
            List<RoutedRow> scopeRows = rows.stream()
                    .filter(row -> sameScope(focusRow.row(), row.row()))
                    .toList();
            boolean hasSingleMain = scopeRows.stream()
                    .anyMatch(row -> row.zone() == Zone.SINGLE && isPresentMain(row.row().kind()));
            boolean hasFailedMain = scopeRows.stream()
                    .filter(row -> isFailedMain(row.row().kind()))
                    .anyMatch(row -> !fullyConsumed(usage, row.row().sourceKey()));

            Boolean rowResult;
            if (!hasSingleMain) {
                rowResult = Boolean.TRUE;
            } else if (fullyConsumed(usage, focusRow.row().sourceKey())) {
                rowResult = Boolean.TRUE;
            } else if (hasFailedMain) {
                rowResult = Boolean.FALSE;
            } else {
                rowResult = integerWonEquals(unitPrice, deliveryPrice);
            }
            if (Boolean.FALSE.equals(rowResult)) {
                result = Boolean.FALSE;
            }
        }
        return result;
    }

    private static List<RoutedRow> focusRows(RoutedRow focus, List<RoutedRow> rows) {
        return rows.stream()
                .filter(row -> Objects.equals(focus.row().partnerCode(), row.row().partnerCode()))
                .filter(row -> Objects.equals(focus.row().modelToken(), row.row().modelToken()))
                .filter(row -> Objects.equals(focus.row().kind(), row.row().kind()))
                .filter(row -> branch(row, true) == branch(focus, true))
                .toList();
    }

    private static boolean sameScope(Row left, Row right) {
        return Objects.equals(left.partnerCode(), right.partnerCode())
                && Objects.equals(left.scopeKey(), right.scopeKey());
    }

    private static boolean fullyConsumed(Map<String, LegacySetMatcher.Usage> usage, String sourceKey) {
        LegacySetMatcher.Usage value = usage.get(sourceKey);
        return value != null && value.used() == value.total();
    }

    private static boolean integerWonEquals(BigDecimal left, BigDecimal right) {
        if (left == null || right == null) {
            return false;
        }
        return left.setScale(0, RoundingMode.HALF_UP)
                .compareTo(right.setScale(0, RoundingMode.HALF_UP)) == 0;
    }

    private static boolean isCommercialMultiToken(String token) {
        return token.startsWith("AM") && hasMultiMarker(token);
    }

    private static boolean isHomeMultiToken(String token) {
        return token.startsWith("AJ") && hasMultiMarker(token);
    }

    private static boolean hasMultiMarker(String token) {
        return token.length() >= 7 && (token.charAt(6) == 'X' || token.charAt(6) == 'N');
    }

    private static boolean isTargetModelCode(String token) {
        return token != null && TARGET_MODEL.matcher(token).matches();
    }

    private static boolean isAccessory(String kind) {
        return "PANEL".equals(kind) || "REMOTE".equals(kind) || "MATERIAL".equals(kind);
    }

    private static boolean isPresentMain(String kind) {
        return "INDOOR".equals(kind) || "OUTDOOR".equals(kind) || "SUB_INDOOR".equals(kind);
    }

    private static boolean isFailedMain(String kind) {
        return "INDOOR".equals(kind) || "OUTDOOR".equals(kind);
    }

    private static String scopeKey(Row row) {
        return String.valueOf(row.partnerCode()) + "\u0000" + String.valueOf(row.scopeKey());
    }

    private static String upper(String value) {
        return value == null ? "" : value.toUpperCase(java.util.Locale.ROOT);
    }
}
