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
import java.util.Base64;
import java.util.regex.Pattern;
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
    private static final int MAX_TEXT_LENGTH = 4_096;
    private static final int MAX_ALT_LENGTH = 200;
    private static final int MAX_IMAGE_BYTES = 50 * 1024;

    private static final Map<String, String> ELEMENT_BANDS = Map.of(
            "TITLE", "HEADER",
            "META_ROWS", "HEADER",
            "APPROVAL_GRID", "HEADER",
            "CONTENT_PARAGRAPHS", "BODY",
            "FIELD_TABLE", "BODY",
            "ATTACHMENT_TABLE", "BODY",
            "CLOSING", "FOOTER");
    private static final Set<String> LEGACY_ELEMENT_TYPES = ELEMENT_BANDS.keySet();
    private static final Set<String> V2_ELEMENT_TYPES = Set.of(
            "TITLE", "META_ROWS", "APPROVAL_GRID", "CONTENT_PARAGRAPHS", "FIELD_TABLE",
            "ATTACHMENT_TABLE", "CLOSING", "FIELD", "TEXT", "DETAIL", "IMAGE");
    private static final Set<String> DETAIL_COLUMN_KEYS = Set.of(
            "productName", "modelName", "specification", "quantity",
            "supplyAmount", "vatAmount", "lineTotal", "note");
    private static final Set<String> BINDING_VALUES = Set.of(
            "header.title", "header.docNo", "header.issueDate", "closing.note");
    private static final Pattern FIELD_BINDING = Pattern.compile(
            "body\\.fieldRow\\[[A-Za-z0-9_.-]{1,100}\\]");
    private static final Set<String> STYLE_KEYS = Set.of("fontSize", "bold", "align", "border");
    /** M-B: schema v1 요소가 가질 수 없는 v2 전용 예약 필드. */
    private static final Set<String> RESERVED_V2_ELEMENT_FIELDS = Set.of(
            "geometry", "style", "binding", "text", "repeatBinding", "columns", "src", "alt");

    private final ObjectMapper objectMapper;

    /** schemaVersion과 JSONB document를 저장 가능한 typed payload로 검증한다. */
    public DocumentPayload validate(Short schemaVersion, JsonNode document) {
        if (schemaVersion == null || !com.samhanair.logis.groupware.domain.DocumentTemplate
                .SUPPORTED_SCHEMA_VERSIONS.contains(schemaVersion)) {
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
        checkDocument(document, schemaVersion);
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

    /** 자동 업데이트 전까지 신규 renderer 요소가 ACTIVE 양식으로 배포되지 않도록 하는 임시 게이트 판정. */
    public boolean containsActivationBlockedElements(DocumentPayload document) {
        return document != null && document.bands() != null
                && document.bands().stream()
                .flatMap(band -> band.elements() == null ? java.util.stream.Stream.empty() : band.elements().stream())
                .anyMatch(element -> "DETAIL".equals(element.type()) || "IMAGE".equals(element.type()));
    }

    private void checkDocument(JsonNode document, short schemaVersion) {
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
                        || !V2_ELEMENT_TYPES.contains(element.get("type").asText())
                        || (schemaVersion == 1 && !LEGACY_ELEMENT_TYPES.contains(element.get("type").asText()))) {
                    reject("문서 요소가 유효하지 않습니다");
                }
                addKey(keys, element.get("key").asText());
                String type = element.get("type").asText();
                if ("DETAIL".equals(type) && !"BODY".equals(band.get("kind").asText())) {
                    reject("DETAIL 요소는 BODY band에 있어야 합니다");
                }
                if (ELEMENT_BANDS.containsKey(type) && !ELEMENT_BANDS.get(type).equals(band.get("kind").asText())) {
                    reject(type + " 요소의 band 배치가 올바르지 않습니다");
                }
                // 🔴 M-B: schema v1 요소는 {key,type} 만 정의된다(spec §2.1). checkV2Element(geometry/
                // style/binding 범위·화이트리스트 검증)는 schemaVersion==2 에서만 호출되므로, v1 요청에
                // geometry/style/binding/text 를 실어 보내면 — 이 필드들은 DocumentPayload.Element record가
                // (버전 무관하게) 실제로 인식하는 이름이라 순수 unknown 필드처럼 드롭되지 않고 — 무검증 상태로
                // 그대로 역직렬화·영속된다. 한 번 append-only 이력(V12/V13)에 각인되면 되돌릴 수 없어 v1
                // 문서에 검증되지 않은 v2 속성이 영구 남는 우회 채널이었다. v1 요소는 이 예약 필드를 가질 수 없다
                // (순수 미인식 필드는 기존과 동일하게 계속 드롭 허용 — valid-unknown-field.json 참고).
                // M-C: FE `LegacyDocElement` 유니온은 geometry/style/binding/text 필드 자체가 없다
                // (G3 — 레거시 요소는 어떤 schemaVersion 에서도 geometry 를 갖지 않는다). v2 문서 안의
                // 레거시 타입 요소도 이 필드들을 가질 수 없게 막지 않으면, BE 는 저장을 허용(v2 이므로
                // checkV2Element 가 통과)하고 FE parser 는 레거시 타입을 항상 {key,type} 로만 재조립해
                // 조용히 스트립한다 — 재저장 시 BE 만 보존하던 값이 무음 소실된다(3층 비대칭).
                if (schemaVersion == 1 || LEGACY_ELEMENT_TYPES.contains(type)) {
                    for (String reserved : RESERVED_V2_ELEMENT_FIELDS) {
                        if (element.has(reserved)) {
                            reject((schemaVersion == 1 ? "schema v1 문서 요소는 " : "레거시 문서 요소는 ")
                                    + reserved + " 필드를 가질 수 없습니다: " + type);
                        }
                    }
                }
                if (schemaVersion == 2) checkV2Element(element, type);
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
        if (counts.getOrDefault("DETAIL", 0) > 1) {
            reject("DETAIL 요소는 최대 하나만 허용됩니다");
        }
    }

    private static void checkV2Element(JsonNode element, String type) {
        if ("DETAIL".equals(type)) {
            if (!"body.lineItems".equals(element.path("repeatBinding").asText())) {
                reject("DETAIL 요소 repeatBinding이 허용 목록에 없습니다");
            }
            JsonNode columns = element.get("columns");
            if (columns == null || !columns.isArray() || columns.size() == 0 || columns.size() > DETAIL_COLUMN_KEYS.size()) {
                reject("DETAIL 요소 columns는 1개 이상 8개 이하여야 합니다");
            }
            Set<String> seen = new HashSet<>();
            for (JsonNode column : columns) {
                if (!column.isTextual() || !DETAIL_COLUMN_KEYS.contains(column.asText()) || !seen.add(column.asText())) {
                    reject("DETAIL 요소 columns에 허용되지 않은 열 또는 중복 열이 있습니다");
                }
            }
        } else if ("IMAGE".equals(type)) {
            if (element.has("binding") || !validImageSource(element.get("src"))) {
                reject("IMAGE 요소 src가 허용 정책을 만족하지 않습니다");
            }
            if (!validString(element.get("alt"), MAX_ALT_LENGTH)) {
                reject("IMAGE 요소 alt는 비어 있지 않은 문자열이어야 합니다");
            }
        } else if ("FIELD".equals(type)) {
            JsonNode binding = element.get("binding");
            if (binding == null || !binding.isTextual()
                    || (!BINDING_VALUES.contains(binding.asText()) && !FIELD_BINDING.matcher(binding.asText()).matches())) {
                reject("FIELD 요소 binding이 허용 목록에 없습니다");
            }
        }
        if (element.has("binding")) {
            // M-D: binding 은 요소 타입과 무관하게 allowlist 강제를 받아야 한다. 종전에는 이 검사가
            // type=="FIELD" 일 때만 실행돼, TEXT(또는 향후 신설될) 요소가 "binding" 필드를 함께 실어
            // 보내면 어떤 값이든(임의 문자열 포함) 무검증으로 Element record 에 역직렬화·영속됐다.
            JsonNode binding = element.get("binding");
            if (!binding.isTextual()
                    || (!BINDING_VALUES.contains(binding.asText()) && !FIELD_BINDING.matcher(binding.asText()).matches())) {
                reject(type + " 요소 binding이 허용 목록에 없습니다");
            }
        }
        if ("TEXT".equals(type)) {
            JsonNode text = element.get("text");
            if (text == null || !text.isTextual() || isFeTrimEmpty(text.asText())) {
                reject("TEXT 요소 text는 비어 있지 않은 문자열이어야 합니다");
            }
            // M-A: FE/BE 길이 한계가 어긋나면(과거 FE 65,536 vs BE 4,096) FE 가 통과시킨 요청이 BE 에서
            // "비어 있지 않은 문자열이어야 합니다"로 거부되어 사용자가 실제 원인(길이 초과)을 알 수 없었다.
            if (text.asText().length() > MAX_TEXT_LENGTH) {
                reject("TEXT 요소 text는 " + MAX_TEXT_LENGTH + "자 이하여야 합니다");
            }
        }
        JsonNode geometry = element.get("geometry");
        if (geometry != null) checkGeometry(geometry);
        JsonNode style = element.get("style");
        if (style != null) checkStyle(style);
    }

    private static boolean validImageSource(JsonNode source) {
        if (source == null || !source.isTextual()) return false;
        String value = source.asText();
        if ("/print-logo.svg".equals(value)) return true;
        var matcher = Pattern.compile("^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$")
                .matcher(value);
        if (!matcher.matches()) return false;
        try {
            byte[] decoded = Base64.getDecoder().decode(matcher.group(2));
            return decoded.length > 0 && decoded.length <= MAX_IMAGE_BYTES;
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private static void checkGeometry(JsonNode geometry) {
        Set<String> geometryKeys = Set.of("x", "y", "w", "h");
        if (!geometry.isObject() || !hasOnlyKeys(geometry, geometryKeys)
                || !geometryKeys.stream().allMatch(key -> geometry.has(key) && geometry.get(key).isNumber())) {
            reject("geometry는 x, y, w, h만 포함한 객체여야 합니다");
        }
        double x = geometry.path("x").asDouble(Double.NaN);
        double y = geometry.path("y").asDouble(Double.NaN);
        double w = geometry.path("w").asDouble(Double.NaN);
        double h = geometry.path("h").asDouble(Double.NaN);
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(w) || !Double.isFinite(h)
                || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 100 || y + h > 100) {
            reject("geometry는 밴드 상대 백분율 범위여야 합니다");
        }
    }

    private static void checkStyle(JsonNode style) {
        if (!style.isObject() || !hasOnlyKeys(style, STYLE_KEYS)) reject("style에 허용되지 않은 속성이 있습니다");
        if (style.has("fontSize") && (!style.get("fontSize").isNumber()
                || !Double.isFinite(style.get("fontSize").asDouble())
                || style.get("fontSize").asDouble() <= 0 || style.get("fontSize").asDouble() > 200)) {
            reject("style fontSize가 유효하지 않습니다");
        }
        if (style.has("bold") && !style.get("bold").isBoolean()) reject("style bold가 유효하지 않습니다");
        if (style.has("align") && (!style.get("align").isTextual()
                || !Set.of("left", "center", "right").contains(style.get("align").asText()))) {
            reject("style align이 유효하지 않습니다");
        }
        if (style.has("border") && !style.get("border").isBoolean()) reject("style border가 유효하지 않습니다");
    }

    private static boolean hasOnlyKeys(JsonNode node, Set<String> allowed) {
        var names = node.fieldNames();
        while (names.hasNext()) {
            if (!allowed.contains(names.next())) return false;
        }
        return true;
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
        return validString(node, MAX_KEY_LENGTH);
    }

    private static boolean validString(JsonNode node, int maxLength) {
        return node != null && node.isTextual() && !isFeTrimEmpty(node.asText())
                && node.asText().length() <= maxLength;
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
