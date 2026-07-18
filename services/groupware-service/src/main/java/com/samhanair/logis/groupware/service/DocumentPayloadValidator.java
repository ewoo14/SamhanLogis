package com.samhanair.logis.groupware.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.domain.DocumentPayload;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * FE {@code parseDocumentTemplate}와 동일한 문서 레이아웃 구조 불변식을 검사한다.
 *
 * <p>이 validator는 JSONB 저장 전 경계에서 schemaVersion, paper, band/element 배치,
 * singleton 수, 중복 key 및 요청 상한을 모두 검사한다. Java DTO 역직렬화 전에 JsonNode를
 * 검사할 수 있어 malformed/unknown 구조도 DEFAULT fallback 정책과 일관되게 거부한다.
 */
@Component
@RequiredArgsConstructor
public class DocumentPayloadValidator {

    public static final int MAX_REQUEST_BYTES = 64 * 1024;
    public static final int MAX_DEPTH = 16;
    public static final int MAX_BANDS = 32;
    public static final int MAX_ELEMENTS_PER_BAND = 64;
    public static final int MAX_KEY_LENGTH = 100;

    private static final Map<String, String> ELEMENT_BANDS = Map.of(
            "TITLE", "HEADER",
            "META_ROWS", "HEADER",
            "APPROVAL_GRID", "HEADER",
            "CONTENT_PARAGRAPHS", "BODY",
            "FIELD_TABLE", "BODY",
            "ATTACHMENT_TABLE", "BODY",
            "CLOSING", "FOOTER");

    private final ObjectMapper objectMapper;

    /** schemaVersion과 JSONB document를 저장 가능한 typed payload로 검증한다. */
    public DocumentPayload validate(Short schemaVersion, JsonNode document) {
        if (schemaVersion == null || schemaVersion != 1) {
            reject("지원하지 않는 문서 양식 schemaVersion입니다");
        }
        if (document == null || !document.isObject()) {
            reject("문서 양식 document는 JSON object여야 합니다");
        }
        try {
            int bytes = objectMapper.writeValueAsString(document).getBytes(StandardCharsets.UTF_8).length;
            if (bytes > MAX_REQUEST_BYTES) {
                reject("문서 양식 요청은 64KB 이하여야 합니다");
            }
        } catch (Exception ex) {
            reject("문서 양식 JSON을 직렬화할 수 없습니다");
        }
        checkDepth(document, 0);
        checkDocument(document);
        try {
            return objectMapper.treeToValue(document, DocumentPayload.class);
        } catch (Exception ex) {
            reject("문서 양식 document 구조가 올바르지 않습니다");
            return null;
        }
    }

    /** 이미 typed 된 JSONB payload를 동일한 구조 검사로 재검증한다. */
    public DocumentPayload validate(Short schemaVersion, DocumentPayload document) {
        return validate(schemaVersion, objectMapper.valueToTree(document));
    }

    private void checkDocument(JsonNode document) {
        JsonNode paper = document.get("paper");
        if (paper == null || !"A4_PORTRAIT".equals(paper.asText())) {
            reject("지원하지 않는 문서 양식 용지입니다");
        }
        JsonNode bands = document.get("bands");
        if (bands == null || !bands.isArray()) {
            reject("문서 양식 bands가 배열이 아닙니다");
        }
        if (bands.size() > MAX_BANDS) {
            reject("문서 양식 band는 32개 이하여야 합니다");
        }

        Set<String> keys = new HashSet<>();
        Map<String, Integer> counts = new HashMap<>();
        for (JsonNode band : bands) {
            if (!band.isObject() || !validString(band.get("key")) || !validString(band.get("kind"))
                    || !Set.of("HEADER", "BODY", "FOOTER").contains(band.get("kind").asText())
                    || band.get("elements") == null || !band.get("elements").isArray()) {
                reject("문서 양식 band가 유효하지 않습니다");
            }
            addKey(keys, band.get("key").asText());
            JsonNode elements = band.get("elements");
            if (elements.size() > MAX_ELEMENTS_PER_BAND) {
                reject("문서 양식 band의 요소는 64개 이하여야 합니다");
            }
            for (JsonNode element : elements) {
                if (!element.isObject() || !validString(element.get("key")) || !validString(element.get("type"))
                        || !ELEMENT_BANDS.containsKey(element.get("type").asText())) {
                    reject("문서 요소가 유효하지 않습니다");
                }
                addKey(keys, element.get("key").asText());
                String type = element.get("type").asText();
                if (!ELEMENT_BANDS.get(type).equals(band.get("kind").asText())) {
                    reject(type + " 요소의 band 배치가 올바르지 않습니다");
                }
                counts.merge(type, 1, Integer::sum);
            }
        }
        if (counts.getOrDefault("TITLE", 0) != 1
                || counts.getOrDefault("APPROVAL_GRID", 0) != 1
                || counts.getOrDefault("CLOSING", 0) != 1) {
            reject("TITLE, APPROVAL_GRID, CLOSING 요소는 정확히 하나씩 있어야 합니다");
        }
        for (String type : Set.of("META_ROWS", "CONTENT_PARAGRAPHS", "FIELD_TABLE", "ATTACHMENT_TABLE")) {
            if (counts.getOrDefault(type, 0) > 1) {
                reject(type + " 요소는 최대 하나만 허용됩니다");
            }
        }
    }

    private void checkDepth(JsonNode node, int depth) {
        if (depth > MAX_DEPTH) {
            reject("문서 양식 JSON depth는 16 이하여야 합니다");
        }
        if (node.isContainerNode()) {
            Iterator<JsonNode> values = node.elements();
            while (values.hasNext()) {
                checkDepth(values.next(), depth + 1);
            }
        }
    }

    private static boolean validString(JsonNode node) {
        return node != null && node.isTextual() && !isFeTrimEmpty(node.asText())
                && node.asText().length() <= MAX_KEY_LENGTH;
    }

    /** FE JavaScript trim()과 동일하게 Unicode 공백만 있는 key를 거부한다. */
    private static boolean isFeTrimEmpty(String value) {
        int start = 0;
        int end = value.length();
        while (start < end) {
            int codePoint = value.codePointAt(start);
            if (!isFeWhitespace(codePoint)) break;
            start += Character.charCount(codePoint);
        }
        while (end > start) {
            int codePoint = value.codePointBefore(end);
            if (!isFeWhitespace(codePoint)) break;
            end -= Character.charCount(codePoint);
        }
        return start == end;
    }

    private static boolean isFeWhitespace(int codePoint) {
        // String.prototype.trim()의 ECMAScript WhiteSpace + LineTerminator 목록을
        // 명시한다. Character.isWhitespace는 U+001C~U+001F까지 공백으로 분류해
        // FE와 다르게 blank key로 판정하므로 사용하지 않는다.
        return codePoint == 0x0009
                || codePoint == 0x000A
                || codePoint == 0x000B
                || codePoint == 0x000C
                || codePoint == 0x000D
                || codePoint == 0x0020
                || codePoint == 0x00A0
                || codePoint == 0x1680
                || (codePoint >= 0x2000 && codePoint <= 0x200A)
                || codePoint == 0x2028
                || codePoint == 0x2029
                || codePoint == 0x202F
                || codePoint == 0x205F
                || codePoint == 0x3000
                || codePoint == 0xFEFF;
    }

    private static void addKey(Set<String> keys, String key) {
        if (!keys.add(key)) {
            reject("중복된 문서 양식 key입니다: " + key);
        }
    }

    private static void reject(String message) {
        throw new BusinessException(ErrorCode.INVALID_INPUT, message);
    }
}
