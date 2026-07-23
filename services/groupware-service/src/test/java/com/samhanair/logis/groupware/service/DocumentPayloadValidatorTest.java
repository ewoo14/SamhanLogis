package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.groupware.domain.DocumentPayload;
import com.samhanair.logis.groupware.domain.DocumentTemplate;
import com.samhanair.logis.groupware.dto.DocumentTemplateCreateRequest;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

/** FE parser와 공용 fixture corpus가 공유하는 BE 구조 validator 단위 테스트. */
class DocumentPayloadValidatorTest {

    private ObjectMapper objectMapper;
    private DocumentPayloadValidator validator;

    @BeforeEach
    void setUp() {
        // prod 는 Spring 자동구성 ObjectMapper(FAIL_ON_UNKNOWN_PROPERTIES=false) 를 주입하므로,
        // parity 를 위해 동일한 Jackson2ObjectMapperBuilder 결과로 검증한다. new ObjectMapper() 는
        // unknown 필드에서 예외를 던져 prod 의 drop-unknown 동작과 어긋난다.
        objectMapper = new Jackson2ObjectMapperBuilder().build();
        validator = new DocumentPayloadValidator(objectMapper);
    }

    @Test
    void validCorpus_isAccepted() throws Exception {
        for (String name : List.of("valid-default.json", "valid-reordered-sparse.json",
                "valid-unknown-field.json", "valid-schema-float-integral.json",
                "valid-ecmascript-control-whitespace.json")) {
            JsonNode root = fixture(name);
            assertThat(validator.validate(root.get("schemaVersion").shortValue(), root.get("document")))
                    .isNotNull();
        }
    }

    @Test
    void unknownElementField_isDroppedNotRejected() throws Exception {
        // FE parseElement 는 element 를 key/type 만으로 재구성(clean)하고, BE 도 동일하게 unknown 필드를
        // 드롭해 저장한다. 이 parity 가 깨지면(FAIL_ON_UNKNOWN=true) 이 케이스가 거부되어 실패한다.
        JsonNode root = fixture("valid-unknown-field.json");
        DocumentPayload payload = validator.validate(root.get("schemaVersion").shortValue(), root.get("document"));
        assertThat(payload).isNotNull();
        assertThat(payload.bands().get(0).elements().get(0).type()).isEqualTo("TITLE");
    }

    @Test
    void invalidCorpus_isRejected() throws Exception {
        for (String name : List.of("invalid-duplicate-key.json", "invalid-missing-singleton.json",
                "invalid-placement.json", "invalid-unknown-version.json", "invalid-paper.json",
                "invalid-v1-reserved-field.json")) {
            JsonNode root = fixture(name);
            assertThatThrownBy(() -> validator.validate(root.get("schemaVersion").shortValue(), root.get("document")))
                    .isInstanceOf(BusinessException.class);
        }
    }

    /**
     * 🔴 M-B RED-first: schemaVersion=1 요청은 checkV2Element(geometry/style/binding 범위 검사)를
     * 전혀 거치지 않는다. style/geometry 는 DocumentPayload.Element record 가 버전과 무관하게 실제로
     * 인식하는 필드명이라 "unknown 필드 드롭"의 보호를 받지 못하고, 유효 범위를 벗어난 값(허용되지 않는
     * align 값)이 그대로 typed record 로 역직렬화·영속될 수 있었다 — v1 요청으로 v2 검증을 완전히
     * 우회하는 채널이다. 이 fixture 는 REJECT 되어야 한다(수정 전 GREEN 통과 = 결함 재현 RED).
     */
    @Test
    void M2_v1RequestCannotSmuggleUnvalidatedV2StyleField() throws Exception {
        JsonNode root = fixture("invalid-v1-reserved-field.json");
        assertThatThrownBy(() -> validator.validate(root.get("schemaVersion").shortValue(), root.get("document")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("style");
    }

    /** 순수 미인식 필드(label/badgeHint 등)는 v1 에서도 여전히 드롭 허용된다 — M-B 회귀 방지. */
    @Test
    void M2_v1RequestStillToleratesGenuinelyUnknownFields() throws Exception {
        JsonNode root = fixture("valid-unknown-field.json");
        assertThat(validator.validate(root.get("schemaVersion").shortValue(), root.get("document"))).isNotNull();
    }

    /**
     * M-C: FE `LegacyDocElement` 는 geometry/style/binding/text 필드 자체가 없다(G3) — v2 문서 안의
     * 레거시 타입 요소가 이 필드를 가지면 BE 는 저장을 허용하는데 FE parser 는 레거시 타입을 항상
     * {key,type} 로만 재조립해 조용히 드롭한다. 재저장 시 BE 만 보존하던 값이 무음 소실되는 3층
     * 비대칭이므로 BE 도 v2 에서 레거시 타입의 예약 필드를 거부해야 한다.
     */
    @Test
    void M3_v2LegacyElementCannotCarryGeometryStyleBindingText() throws Exception {
        JsonNode root = fixture("invalid-v2-legacy-geometry.json");
        assertThatThrownBy(() -> validator.validate(root.get("schemaVersion").shortValue(), root.get("document")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("레거시");
    }

    /**
     * M-D: binding 은 요소 타입과 무관하게 allowlist 강제를 받아야 한다. 종전에는 binding 검사가
     * type=="FIELD" 일 때만 실행돼 TEXT 요소가 임의 문자열 binding 을 함께 실어 보내도 무검증으로
     * 영속될 수 있었다.
     */
    @Test
    void M4_textElementStrayBinding_isRejectedRegardlessOfType() throws Exception {
        JsonNode root = fixture("invalid-v2-text-stray-binding.json");
        assertThatThrownBy(() -> validator.validate(root.get("schemaVersion").shortValue(), root.get("document")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("binding");
    }

    @Test
    void M4_detailElementStrayBinding_isRejectedRegardlessOfRepeatBinding() throws Exception {
        JsonNode document = fixture("valid-default.json").get("document").deepCopy();
        var bodyElements = (com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/1/elements");
        bodyElements.addObject()
                .put("key", "detail-stray-binding")
                .put("type", "DETAIL")
                .put("repeatBinding", "body.lineItems")
                .put("binding", "body.secret")
                .set("columns", objectMapper.createArrayNode().add("productName"));

        assertThatThrownBy(() -> validator.validate((short) 2, document))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("binding");
    }

    @Test
    void boundaryLimits_areEnforced() throws Exception {
        JsonNode root = fixture("valid-default.json");
        JsonNode tooLongKey = root.get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) tooLongKey.at("/bands/0/elements/0"))
                .put("key", "k".repeat(101));
        assertThatThrownBy(() -> validator.validate((short) 1, tooLongKey))
                .isInstanceOf(BusinessException.class);

        JsonNode atBandLimit = root.get("document").deepCopy();
        var bandsAtLimit = (com.fasterxml.jackson.databind.node.ArrayNode) atBandLimit.withArray("bands");
        for (int i = 0; i < 29; i++) {
            bandsAtLimit.add(objectMapper.createObjectNode().put("key", "extra-" + i)
                    .put("kind", "BODY").set("elements", objectMapper.createArrayNode()));
        }
        assertThat(validator.validate((short) 1, atBandLimit)).isNotNull();

        JsonNode tooManyBands = root.get("document").deepCopy();
        var bandsOverLimit = (com.fasterxml.jackson.databind.node.ArrayNode) tooManyBands.withArray("bands");
        for (int i = 0; i < 30; i++) {
            bandsOverLimit.add(objectMapper.createObjectNode().put("key", "extra-over-" + i)
                    .put("kind", "BODY").set("elements", objectMapper.createArrayNode()));
        }
        assertThatThrownBy(() -> validator.validate((short) 1, tooManyBands))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("32개");

        JsonNode atElementLimit = root.get("document").deepCopy();
        var elementsAtLimit = (com.fasterxml.jackson.databind.node.ArrayNode) atElementLimit.at("/bands/1/elements");
        for (int i = 0; i < 61; i++) {
            elementsAtLimit.add(objectMapper.createObjectNode()
                    .put("key", "content-extra-" + i).put("type", "CONTENT_PARAGRAPHS"));
        }
        assertThatThrownBy(() -> validator.validate((short) 1, atElementLimit))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("최대 하나");

        JsonNode overElementLimit = root.get("document").deepCopy();
        var elementsOverLimit = (com.fasterxml.jackson.databind.node.ArrayNode) overElementLimit.at("/bands/1/elements");
        for (int i = 0; i < 62; i++) {
            elementsOverLimit.add(objectMapper.createObjectNode()
                    .put("key", "content-over-" + i).put("type", "CONTENT_PARAGRAPHS"));
        }
        assertThatThrownBy(() -> validator.validate((short) 1, overElementLimit))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("64개");
    }

    @Test
    void unicodeWhitespaceOnlyKey_matchesFeTrimAndIsRejected() throws Exception {
        JsonNode document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) document.at("/bands/0/elements/0"))
                .put("key", "\u00a0\u2003");

        assertThatThrownBy(() -> validator.validate((short) 1, document))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void requestScalars_areNotJacksonCoerced() throws Exception {
        DocumentTemplateCreateRequest integralFloat = objectMapper.readValue(
                readFixtureText("valid-schema-float-integral.json"), DocumentTemplateCreateRequest.class);
        assertThat(integralFloat.schemaVersion()).isEqualTo((short) 1);

        for (String name : List.of(
                "invalid-coercion-schema-string.json",
                "invalid-coercion-schema-float.json",
                "invalid-coercion-doc-type-number.json")) {
            String json = readFixtureText(name);
            assertThatThrownBy(() -> objectMapper.readValue(json, DocumentTemplateCreateRequest.class))
                    .isInstanceOf(Exception.class);
        }
    }

    @Test
    void unsupportedSchemaVersion_isRejectedBeforeDocumentParsing() throws Exception {
        JsonNode document = fixture("valid-default.json").get("document");
        assertThatThrownBy(() -> validator.validate((short) 3, document))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void R2_v2PayloadRoundTrip_keepsGeometryStyleBindingAndText() throws Exception {
        var document = fixture("valid-default.json").get("document").deepCopy();
        var bodyElements = (com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/1/elements");
        var field = bodyElements.addObject();
        field.put("key", "field-doc-no");
        field.put("type", "FIELD");
        field.put("binding", "header.docNo");
        field.set("geometry", objectMapper.createObjectNode()
                .put("x", 10).put("y", 20).put("w", 60).put("h", 8));
        field.set("style", objectMapper.createObjectNode()
                .put("fontSize", 14).put("bold", true).put("align", "center").put("border", true));
        var text = bodyElements.addObject();
        text.put("key", "text-title");
        text.put("type", "TEXT");
        text.put("text", "초안 제목");
        text.set("geometry", objectMapper.createObjectNode()
                .put("x", 5).put("y", 5).put("w", 90).put("h", 10));

        DocumentPayload payload = validator.validate((short) 2, document);

        // 🚨 R2 검증 결함: 종전 `anySatisfy(element -> { if (key.equals(...)) {...} })` 는 조건이 거짓인
        // 다른 요소에서 내부 assert 가 아예 실행되지 않아 "공허 충족"되었다 — Element.geometry() 를 강제로
        // null 반환하도록 만드는 뮤테이션에도 10/10 GREEN 이었다. 대상 요소를 key 로 명시적으로 찾아
        // 단언한다(대상이 없으면 이 조회 자체가 NoSuchElementException 으로 실패한다).
        DocumentPayload.Element fieldElement = elementByKey(payload, 1, "field-doc-no");
        assertThat(fieldElement.binding()).isEqualTo("header.docNo");
        assertThat(fieldElement.geometry()).as("field-doc-no geometry는 저장 왕복에서 소실되면 안 된다").isNotNull();
        assertThat(fieldElement.geometry().x()).isEqualTo(10);
        assertThat(fieldElement.geometry().y()).isEqualTo(20);
        assertThat(fieldElement.geometry().w()).isEqualTo(60);
        assertThat(fieldElement.geometry().h()).isEqualTo(8);
        assertThat(fieldElement.style()).as("field-doc-no style은 저장 왕복에서 소실되면 안 된다").isNotNull();
        assertThat(fieldElement.style().fontSize()).isEqualTo(14);
        assertThat(fieldElement.style().bold()).isTrue();
        assertThat(fieldElement.style().align()).isEqualTo("center");
        assertThat(fieldElement.style().border()).isTrue();

        DocumentPayload.Element textElement = elementByKey(payload, 1, "text-title");
        assertThat(textElement.text()).isEqualTo("초안 제목");
        assertThat(textElement.geometry()).as("text-title geometry는 저장 왕복에서 소실되면 안 된다").isNotNull();
        assertThat(textElement.geometry().w()).isEqualTo(90);
    }

    @Test
    void R2_DS4_v2PayloadRoundTrip_keepsDetailAndImageFields() throws Exception {
        var document = fixture("valid-default.json").get("document").deepCopy();
        var headerElements = (com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements");
        headerElements.addObject()
                .put("key", "company-logo")
                .put("type", "IMAGE")
                .put("src", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
                .put("alt", "회사 로고");
        var bodyElements = (com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/1/elements");
        bodyElements.addObject()
                .put("key", "line-items")
                .put("type", "DETAIL")
                .put("repeatBinding", "body.lineItems")
                .set("columns", objectMapper.createArrayNode()
                        .add("productName").add("quantity").add("supplyAmount")
                        .add("vatAmount").add("lineTotal"));

        DocumentPayload payload = validator.validate((short) 2, document);
        JsonNode roundTrip = objectMapper.valueToTree(payload);

        JsonNode image = roundTrip.at("/bands/0/elements/3");
        JsonNode detail = roundTrip.at("/bands/1/elements/3");
        assertThat(image.path("type").asText()).isEqualTo("IMAGE");
        assertThat(image.path("src").asText()).startsWith("data:image/png;base64,");
        assertThat(image.path("alt").asText()).isEqualTo("회사 로고");
        assertThat(detail.path("type").asText()).isEqualTo("DETAIL");
        assertThat(detail.path("repeatBinding").asText()).isEqualTo("body.lineItems");
        assertThat(detail.path("columns").toString()).contains("supplyAmount", "vatAmount", "lineTotal");
    }

    @Test
    void DS4_imageSourcePolicy_rejectsExternalAndTokenizedSources() throws Exception {
        for (String src : List.of(
                "https://example.com/logo.png",
                "/print-logo.svg?token=secret",
                "data:image/svg+xml;base64,PHN2Zy8+",
                "blob:https://example.com/id")) {
            var document = fixture("valid-default.json").get("document").deepCopy();
            ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                    .addObject().put("key", "unsafe-image").put("type", "IMAGE")
                    .put("src", src).put("alt", "로고");
            assertThatThrownBy(() -> validator.validate((short) 2, document))
                    .as(src)
                    .isInstanceOf(BusinessException.class);
        }
    }

    @Test
    void DS4_imageSourcePolicy_rejectsDecodableEnvelopeWithInvalidImageBytes() throws Exception {
        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "corrupt-image").put("type", "IMAGE")
                .put("src", "data:image/png;base64,bm90IGFuIGltYWdl").put("alt", "손상 이미지");

        assertThatThrownBy(() -> validator.validate((short) 2, document))
                .as("MIME과 Base64 길이만 맞는 손상 PNG는 저장되면 안 된다")
                .isInstanceOf(BusinessException.class);
    }

    /** key 로 대상 요소를 명시적으로 찾는다. 없으면 예외로 실패한다(공허 충족 방지). */
    private static DocumentPayload.Element elementByKey(DocumentPayload payload, int bandIndex, String key) {
        return payload.bands().get(bandIndex).elements().stream()
                .filter(element -> key.equals(element.key()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("요소를 찾을 수 없습니다: " + key));
    }

    /**
     * 🔴 BLOCKING-1 RED-first: 사용자가 속성 패널에서 style 을 부분 지정(예: 글꼴 크기만)하는 것은 UI 의
     * 정상 경로다. {@code validate(Short, DocumentPayload)}(activate() 재검증 경로와 동일)는 이미 저장된
     * typed 객체를 {@code objectMapper.valueToTree()} 로 재직렬화하는데, {@code Style}/{@code Geometry}
     * record 에 {@code @JsonInclude(NON_NULL)} 이 없으면 미지정 필드가 명시적 null 로 재직렬화되고
     * {@code checkStyle}/{@code checkGeometry} 는 "키가 있는데 null"을 유효하지 않은 값으로 거부한다 —
     * 저장은 201 로 성공했는데 activate() 재검증이 같은 payload 를 400 으로 거부하는 모순이었다.
     * fontSize 만/align 만/bold 만 지정한 3 변형 전부가 통과해야 한다.
     */
    @Test
    void BLOCKING1_partialStyleSurvivesReValidation_fontSizeOnly() throws Exception {
        assertReValidationSucceeds(new DocumentPayload.Style(14.0, null, null, null));
    }

    @Test
    void BLOCKING1_partialStyleSurvivesReValidation_alignOnly() throws Exception {
        assertReValidationSucceeds(new DocumentPayload.Style(null, null, "center", null));
    }

    @Test
    void BLOCKING1_partialStyleSurvivesReValidation_boldOnly() throws Exception {
        assertReValidationSucceeds(new DocumentPayload.Style(null, true, null, null));
    }

    private void assertReValidationSucceeds(DocumentPayload.Style partialStyle) throws Exception {
        JsonNode root = fixture("valid-default.json");
        var bodyElements = List.of(
                new DocumentPayload.Element("field-partial-style", "FIELD",
                        new DocumentPayload.Geometry(0.0, 0.0, 50.0, 10.0), partialStyle,
                        "header.docNo", null));
        var bands = List.of(
                new DocumentPayload.Band("header", "HEADER", List.of(
                        new DocumentPayload.Element("title", "TITLE"),
                        new DocumentPayload.Element("approval", "APPROVAL_GRID"))),
                new DocumentPayload.Band("body", "BODY", bodyElements),
                new DocumentPayload.Band("footer", "FOOTER", List.of(
                        new DocumentPayload.Element("closing", "CLOSING"))));
        DocumentPayload storedTypedPayload = new DocumentPayload("A4_PORTRAIT", bands);

        // activate()가 저장된 typed payload를 재검증할 때와 동일한 오버로드.
        DocumentPayload reValidated = validator.validate((short) 2, storedTypedPayload);

        assertThat(reValidated.bands().get(1).elements().get(0).style()).isEqualTo(partialStyle);
    }

    @Test
    void R4_v1RemainsSupportedAlongsideCurrentV2Schema() throws Exception {
        assertThat(DocumentTemplate.CURRENT_SCHEMA_VERSION).isEqualTo((short) 2);
        assertThat(DocumentTemplate.SUPPORTED_SCHEMA_VERSIONS).contains((short) 1, (short) 2);

        assertThat(validator.validate((short) 1, fixture("valid-default.json").get("document")))
                .isNotNull();
    }

    @Test
    void requestSizeAndDepthLimits_areEnforced() throws Exception {
        var large = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) large).put("padding", "x".repeat(65 * 1024));
        assertThatThrownBy(() -> validator.validate((short) 1, large))
                .isInstanceOf(BusinessException.class);

        var deep = fixture("valid-default.json").get("document").deepCopy();
        var cursor = (com.fasterxml.jackson.databind.node.ObjectNode) deep;
        for (int i = 0; i < 17; i++) {
            var child = objectMapper.createObjectNode();
            cursor.set("nested", child);
            cursor = child;
        }
        assertThatThrownBy(() -> validator.validate((short) 1, deep))
                .isInstanceOf(BusinessException.class);
    }

    private JsonNode fixture(String name) throws IOException {
        try (InputStream input = getClass().getResourceAsStream("/document-template-fixtures/" + name)) {
            if (input == null) throw new IllegalStateException(name);
            return objectMapper.readTree(input);
        }
    }

    private String readFixtureText(String name) throws IOException {
        try (InputStream input = getClass().getResourceAsStream("/document-template-fixtures/" + name)) {
            if (input == null) throw new IllegalStateException(name);
            return new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }
}
