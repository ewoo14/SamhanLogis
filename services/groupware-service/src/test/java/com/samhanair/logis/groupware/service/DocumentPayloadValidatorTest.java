package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.groupware.domain.DocumentPayload;
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
                "valid-unknown-field.json")) {
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
        JsonNode document = root.get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) document.at("/bands/0/elements/0"))
                .put("key", "k".repeat(101));
        assertThatThrownBy(() -> validator.validate((short) 1, document))
                .isInstanceOf(BusinessException.class);

        var tooManyBands = (com.fasterxml.jackson.databind.node.ArrayNode) document.withArray("bands");
        for (int i = 0; i < 30; i++) {
            tooManyBands.add(objectMapper.createObjectNode().put("key", "extra-" + i)
                    .put("kind", "BODY").set("elements", objectMapper.createArrayNode()));
        }
        assertThatThrownBy(() -> validator.validate((short) 1, document))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void unsupportedSchemaVersion_isRejectedBeforeDocumentParsing() throws Exception {
        JsonNode document = fixture("valid-default.json").get("document");
        assertThatThrownBy(() -> validator.validate((short) 2, document))
                .isInstanceOf(BusinessException.class);
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
}
