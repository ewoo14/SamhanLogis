package com.samhanair.logis.product.quantitysync;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Iterator;
import java.util.Map;

/**
 * 두 {@code condition_json} 값이 PostgreSQL jsonb {@code =} 연산자와 같은 답을 내도록
 * 비교한다.
 *
 * <p><b>재수렴 R4 결함 B [MED]</b> — {@link JsonNode#equals(Object)}는 노드 구현 타입까지
 * 비교해 {@code IntNode(1)}과 {@code DoubleNode(1.0)}을 다르다고 판정한다. 반면 V24:307의
 * REPLACE 중복 검사(deferred constraint trigger)는 {@code r1.condition_json = r2.condition_json}
 * (jsonb {@code =})를 쓰는데, PostgreSQL jsonb는 숫자를 {@code numeric}으로 저장·비교하므로
 * {@code '{"a":1}'::jsonb = '{"a":1.0}'::jsonb}는 {@code true}다. 두 계층의 "같다"의 정의가
 * 달라, Java 사전 검증이 통과시킨 입력을 DB가 거부하면 그 예외가 GlobalExceptionHandler의
 * 범용 409("동시 편집 충돌 또는 제약 위반")로 뭉개진다(결함 A 와 같은 마스킹 경로, 원인은
 * 다름).
 *
 * <p>이 클래스는 {@link QuantitySyncRuleValidator}의 condition 비교 자리를 jsonb와 같은
 * 답을 내도록 바꾸는 유일한 지점이다 — 새 비교 자리가 추가돼도 이 메서드를 쓰면 자동으로
 * 같은 semantics를 갖는다(U-2, 경로 수 무관).
 */
final class QuantitySyncConditionEquality {

    private QuantitySyncConditionEquality() {
    }

    /**
     * PostgreSQL jsonb {@code =} 연산자와 같은 답을 내는 구조적 동등 비교.
     *
     * <ul>
     *   <li>숫자 — 표현 타입(int/long/double/BigDecimal) 무관, 수치값이 같으면 같다
     *       ({@link JsonNode#decimalValue()}의 {@code compareTo()==0} — scale 무시,
     *       {@code 1}과 {@code 1.0}이 같다).</li>
     *   <li>object — key 집합이 같고 각 key의 값이 재귀적으로 같으면 같다(키 순서 무관).</li>
     *   <li>array — 길이가 같고 같은 인덱스의 원소가 재귀적으로 같으면 같다(순서 유의 —
     *       jsonb는 배열 순서를 보존한다).</li>
     *   <li>string/boolean/null — 정확히 같은 타입 + 값이어야 같다.</li>
     *   <li>서로 다른 JSON 타입 계열(예: object vs array, number vs string)은 항상 다르다.</li>
     * </ul>
     */
    static boolean jsonbEquals(JsonNode a, JsonNode b) {
        if (a == null || b == null) {
            return a == b;
        }
        if (a.isNumber() && b.isNumber()) {
            return numberEquals(a, b);
        }
        if (a.isObject() && b.isObject()) {
            return objectEquals(a, b);
        }
        if (a.isArray() && b.isArray()) {
            return arrayEquals(a, b);
        }
        if (a.isTextual() && b.isTextual()) {
            return a.asText().equals(b.asText());
        }
        if (a.isBoolean() && b.isBoolean()) {
            return a.asBoolean() == b.asBoolean();
        }
        return a.isNull() && b.isNull();
    }

    /**
     * 🚨 2026-07-28 R5 A2-① fix — {@code decimalValue()}는 {@link JsonNode}가 유한하지 않은
     * double(Infinity/-Infinity/NaN)을 담고 있으면 {@link NumberFormatException}을 던진다.
     * {@code "1e400"}처럼 double 표현 범위를 넘는 JSON 숫자를 Jackson이 {@code DoubleNode
     * (Infinity)}로 파싱했을 때 이 메서드가 REPLACE 중복 검사(QuantitySyncRuleValidator)에서
     * 호출되면 500으로 죽었다(재현: 정확히 Double.MAX_VALUE 경계에서 201→500 전환). 이제
     * {@link QuantitySyncRuleValidator#validateOptionPair}가 저장 이전에 비유한 숫자를 400으로
     * 먼저 거부하므로 이 분기는 정상 경로에서 도달하지 않아야 하지만, 어떤 경로로 도달해도
     * 이 메서드 자체는 절대 예외를 던지지 않고 항상 안전하게 "다르다"로 답한다 — Infinity는
     * PostgreSQL jsonb에도 애초에 저장될 수 없는 값이라(numeric 타입 무한대 미지원) "같다"고
     * 답할 근거가 없다.
     */
    private static boolean numberEquals(JsonNode a, JsonNode b) {
        double ad = a.doubleValue();
        double bd = b.doubleValue();
        if (!Double.isFinite(ad) || !Double.isFinite(bd)) {
            return false;
        }
        return a.decimalValue().compareTo(b.decimalValue()) == 0;
    }

    private static boolean objectEquals(JsonNode a, JsonNode b) {
        if (a.size() != b.size()) {
            return false;
        }
        Iterator<Map.Entry<String, JsonNode>> fields = a.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            if (!b.has(field.getKey()) || !jsonbEquals(field.getValue(), b.get(field.getKey()))) {
                return false;
            }
        }
        return true;
    }

    private static boolean arrayEquals(JsonNode a, JsonNode b) {
        if (a.size() != b.size()) {
            return false;
        }
        for (int i = 0; i < a.size(); i++) {
            if (!jsonbEquals(a.get(i), b.get(i))) {
                return false;
            }
        }
        return true;
    }
}
