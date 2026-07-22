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
                "invalid-placement.json", "invalid-unknown-version.json", "invalid-paper.json")) {
            JsonNode root = fixture(name);
            assertThatThrownBy(() -> validator.validate(root.get("schemaVersion").shortValue(), root.get("document")))
                    .isInstanceOf(BusinessException.class);
        }
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

        assertThat(payload.bands().get(1).elements())
                .anySatisfy(element -> {
                    if ("field-doc-no".equals(element.key())) {
                        assertThat(element.binding()).isEqualTo("header.docNo");
                        assertThat(element.geometry().x()).isEqualTo(10);
                        assertThat(element.style().bold()).isTrue();
                    }
                })
                .anySatisfy(element -> {
                    if ("text-title".equals(element.key())) {
                        assertThat(element.text()).isEqualTo("초안 제목");
                        assertThat(element.geometry().w()).isEqualTo(90);
                    }
                });
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
