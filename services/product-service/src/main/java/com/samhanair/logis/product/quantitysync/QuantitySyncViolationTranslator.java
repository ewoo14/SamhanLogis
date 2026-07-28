package com.samhanair.logis.product.quantitysync;

import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * V24 {@code quantity_sync_validate_rule_graph()} deferred constraint trigger가 던지는
 * PostgreSQL 예외를 사용자에게 원인을 드러내는 한국어 메시지로 번역한다.
 *
 * <p><b>재수렴 R4 결함 A [HIGH]</b> — {@code estimateCategories} 변경처럼 이 트리거에 새로
 * 도달 가능해진 경로가 나올 때마다 Java 쪽에 그 경로 전용 사전 검증(guard)을 하나씩 추가하는
 * 방식이 네 라운드 연속(단종/삭제 → optionIn → usageScope=NONE → estimateCategories) 반복됐다
 * — 매 라운드가 "직전 라운드가 찾은 경로"만 막아 다음 라운드는 항상 아직 안 본 경로를
 * 찾아냈다.
 *
 * <p>이 클래스는 경로별 가드를 하나 더 추가하는 대신, 이 트리거가 실패를 알리는 <b>유일한
 * 통로</b>({@link org.springframework.dao.DataIntegrityViolationException}로 번역된 SQL 예외의
 * 메시지)를 가로챈다. {@code GlobalExceptionHandler}가 모든 quantity_sync 트리거 위반을 이
 * 클래스로 먼저 확인하므로, 이 트리거에 새로 도달하는 어떤 Java 경로가 나오든(기존 경로 ·
 * 이번 fix가 다루는 경로 · 아직 아무도 안 본 미래의 경로 포함) 원인이 자동으로 드러난다 —
 * 경로 수와 무관하다(U-1).
 *
 * <p><b>한계(정직히 기록)</b> — deferred trigger는 <i>commit 시점</i>에 실패하고 그 실패로
 * transaction 전체가 rollback된다. 이 시점에는 "어떤 품목/어떤 규칙이 관련됐는지"를 알아낼
 * 요청 컨텍스트가 이미 사라져 있다({@link ProductService#assertNotReferencedByEnabledQuantitySyncRule}
 * 같은 사전 가드는 mutation 전에 조회하므로 ruleKey를 메시지에 넣을 수 있지만, 이 번역기는
 * 그럴 수 없다 — rollback 후 DB를 다시 조회해도 위반이 발생했던 상태 자체가 이미 없다). 따라서
 * 이 메시지는 "무엇이 위반됐는지"(종류)는 구체적으로 드러내지만 "어떤 규칙 때문인지"(ruleKey)는
 * 담지 않는다 — 그 특정 정보가 필요하면 여전히 사전 가드가 유효하다(이 클래스는 사전 가드를
 * 대체하지 않고, 사전 가드가 없는/놓친 모든 경로의 안전망 역할을 한다).
 */
public final class QuantitySyncViolationTranslator {

    /** V24 트리거의 모든 RAISE EXCEPTION 메시지가 공유하는 내부 네임스페이스 접두어. */
    private static final String ERROR_MARKER = "ERROR: quantity_sync ";

    /**
     * 알려진 사유 → 한국어 번역. 메시지가 이 key로 시작하면 그대로 사용한다.
     *
     * <p>순서 중요 — {@link #toUserMessage(String)}가 첫 매치를 사용하므로, 한쪽이 다른 쪽의
     * 접두어가 되는 항목이 있다면 더 긴(구체적인) 항목을 먼저 둔다(현재는 그런 항목 없음).
     */
    private static final Map<String, String> KNOWN_REASONS = new LinkedHashMap<>();

    static {
        // ProductService.assertNotReferencedByEnabledQuantitySyncRule()과 같은 취지의 한국어
        // 문구(ruleKey 접미어만 뺌 — 이 계층에는 그 정보가 없다, 클래스 Javadoc "한계" 참조).
        KNOWN_REASONS.put("source and target must stay inside rule category",
                "수량 동기화 규칙이 참조하는 품목의 노출 카테고리가 바뀌어 규칙 제약을 벗어났습니다.");
        KNOWN_REASONS.put("cannot reference deleted or invisible product",
                "수량 동기화 규칙이 참조하는 품목이 삭제되었거나 비노출 상태가 되어 규칙 제약을 위반했습니다.");
        // QuantitySyncRuleValidator.invalid("동일 condition의 REPLACE target이 중복됩니다.")와
        // 완전히 같은 문구 — 결함 B의 2차 방어선(Java 사전 검증이 놓친 경우라도 이 트리거가
        // 여전히 같은 문장으로 드러낸다).
        KNOWN_REASONS.put("duplicate REPLACE condition and target",
                "동일 condition의 REPLACE target이 중복됩니다.");
        KNOWN_REASONS.put("source target graph contains a cycle",
                "수량 동기화 규칙 source/target graph에 순환이 발생합니다.");
        KNOWN_REASONS.put("cannot connect a BUNDLE to its own component",
                "BUNDLE 품목은 자신의 구성품을 수량 동기화 대상으로 연결할 수 없습니다.");
        KNOWN_REASONS.put("source and target cannot be the same product",
                "수량 동기화 규칙의 source와 target은 같은 품목일 수 없습니다.");
        KNOWN_REASONS.put("rule must have active source and target rows",
                "수량 동기화 규칙에는 활성 source/target이 하나 이상 있어야 합니다.");
        KNOWN_REASONS.put("condition_json must be an object",
                "수량 동기화 규칙 condition은 object 형식이어야 합니다.");
        KNOWN_REASONS.put("condition_json must contain one operator",
                "수량 동기화 규칙 condition은 하나의 연산자만 포함해야 합니다.");
        KNOWN_REASONS.put("condition_json operator is not allowed",
                "수량 동기화 규칙 condition에 허용되지 않은 연산자가 있습니다.");
        KNOWN_REASONS.put("option condition must be [key,value]",
                "수량 동기화 규칙 option 조건은 [key,value] 형식이어야 합니다.");
        KNOWN_REASONS.put("option key must not be blank",
                "수량 동기화 규칙 option key는 비어 있을 수 없습니다.");
        KNOWN_REASONS.put("optionEquals value must be scalar",
                "수량 동기화 규칙 optionEquals 값은 단일 값이어야 합니다.");
        KNOWN_REASONS.put("optionIn value must be a non-empty array",
                "수량 동기화 규칙 optionIn 값은 비어 있지 않은 배열이어야 합니다.");
        KNOWN_REASONS.put("all/any value must be a non-empty array",
                "수량 동기화 규칙 all/any 조건 값은 비어 있지 않은 배열이어야 합니다.");
    }

    private QuantitySyncViolationTranslator() {
    }

    /**
     * 예외 cause 체인(자기 자신 포함)에서 V24 트리거가 던진 원본 사유 문자열(namespace
     * 접두어 제거, 트리거의 동적 접미어 포함)을 찾는다.
     *
     * <p>{@code "ERROR: quantity_sync "} 마커를 메시지 <b>어디서든</b> 찾는다 — Spring/Hibernate
     * 버전에 따라 감싸는 접두어("Hibernate transaction: Unable to commit ...")가 달라질 수
     * 있어 메시지 시작 위치에 고정하지 않는다(실측: {@link org.springframework.dao.DataIntegrityViolationException}
     * 최상위 메시지 자체에 이미 포함돼 있었고, 그 cause인 {@link SQLException}에도 동일하게
     * 포함돼 있었다 — 둘 중 어느 것을 먼저 만나도 찾아진다).
     *
     * @param ex 최상위 예외(전형적으로 {@link org.springframework.dao.DataIntegrityViolationException})
     * @return 이 트리거와 무관한 예외(다른 CHECK 제약 · FK 위반 등)면 {@link Optional#empty()}
     */
    public static Optional<String> extractReason(Throwable ex) {
        Throwable cause = ex;
        int guard = 0;
        while (cause != null && guard++ < 32) {
            String reason = extractFromMessage(cause.getMessage());
            if (reason != null) {
                return Optional.of(reason);
            }
            cause = cause.getCause();
        }
        return Optional.empty();
    }

    private static String extractFromMessage(String message) {
        if (message == null) {
            return null;
        }
        int markerIndex = message.indexOf(ERROR_MARKER);
        if (markerIndex < 0) {
            return null;
        }
        String fromReason = message.substring(markerIndex + "ERROR: ".length());
        int newline = fromReason.indexOf('\n');
        String firstLine = newline >= 0 ? fromReason.substring(0, newline) : fromReason;
        return firstLine.trim();
    }

    /**
     * {@link #extractReason(Throwable)}이 반환한 원문("quantity_sync ..." 접두 포함)을
     * 사용자 노출 한국어 메시지로 바꾼다.
     *
     * <p>알려진 사유는 친절한 한국어로, <b>미지의 사유도</b> 최소한 뭉개지지 않고 원문이
     * 그대로 드러난다 — 이 트리거에 새 {@code RAISE EXCEPTION}이 추가돼도(U-1) "동시 편집
     * 충돌 또는 제약 위반" 같은 opaque한 메시지로 되돌아가지 않는다.
     */
    public static String toUserMessage(String reason) {
        String body = reason.substring("quantity_sync ".length());
        for (Map.Entry<String, String> known : KNOWN_REASONS.entrySet()) {
            if (body.startsWith(known.getKey())) {
                return known.getValue();
            }
        }
        return "수량 동기화 규칙 제약으로 인해 처리할 수 없습니다: " + body;
    }
}
