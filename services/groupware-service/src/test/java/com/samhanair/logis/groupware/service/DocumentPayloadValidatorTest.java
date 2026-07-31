package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.groupware.domain.DocumentPayload;
import com.samhanair.logis.groupware.domain.DocumentTemplate;
import com.samhanair.logis.groupware.dto.DocumentTemplateCreateRequest;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.zip.CRC32;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageTypeSpecifier;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.metadata.IIOMetadata;
import javax.imageio.metadata.IIOMetadataNode;
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
    void authoringMode_isPreservedAndUnknownValuesFailSafeToWord() throws Exception {
        JsonNode excelDocument = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) excelDocument).put("mode", "EXCEL");

        assertThat(validator.validate((short) 1, excelDocument).mode()).isEqualTo("EXCEL");

        JsonNode unknownDocument = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) unknownDocument).put("mode", "PDF");
        assertThat(validator.validate((short) 1, unknownDocument).mode()).isEqualTo("WORD");

        assertThat(validator.validate((short) 1, fixture("valid-default.json").get("document")).normalizedMode())
                .isEqualTo("WORD");
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

    @Test
    void DS4_imageSourcePolicy_messageDescribesStructurePolicyNotRendererDecodability() throws Exception {
        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "contract-message-image").put("type", "IMAGE")
                .put("src", "data:image/png;base64,bm90IGFuIGltYWdl").put("alt", "손상 이미지");

        assertThatThrownBy(() -> validator.validate((short) 2, document))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("허용된 PNG/JPEG/WebP data URL")
                .hasMessageNotContaining("실제로 열 수 있는");
    }

    /**
     * 🔴 PR#968 R1 정책 반전(구 {@code DS4_imageSourcePolicy_rejectsSignatureValidButTruncatedPngThroughImageIO}):
     * R1 적대검증이 저장소 실 자산(pwa-192.png)을 51%(1,409/2,743B)에서 자른 입력으로 라이브 Chromium을
     * 실측했다 — {@code <img>}는 192x192로 정상 load하는데 BE(구 코드)는 {@code ImageIO.read()}가
     * IIOException("Error reading PNG image data")을 던져 거부했다(I-3 위반, C1이 통과시킨 것을 BE가
     * 거부). jshell 실측(#968 R1 fix): 이 "IDAT scanline이 비어 있는" 합성 fixture와 실 다운로드 중단
     * 재현 fixture는 Java ImageIO 관점에서 **동일한 예외·동일한 메시지**를 던져 구분할 수 없다 —
     * 즉 "완전히 빈 IDAT"과 "부분적으로 존재하는 IDAT"을 헤더 파싱만으로 갈라낼 신뢰할 수 있는 신호가
     * 없다. 기획 C2("BE는 디코드 가능성을 보장하지 않는다")를 PNG에도 WebP와 동일하게 적용해 —
     * IHDR가 파싱 가능하고 예산 내이면 구조적으로 유효하다고 본다. 실제 렌더 가능 여부는 C1(FE
     * {@code <img>.decode()})과 C3(렌더 시점 경고)가 담당한다.
     */
    @Test
    void PR968R1_D2_png_acceptsHeaderValidButEmptyIdatBecauseBeNoLongerGuaranteesDecodability() throws Exception {
        // PNG signature/IHDR/CRC는 맞지만 IDAT scanline이 비어 있는 실제 ImageIO 입력이다.
        String truncatedPng = Base64.getEncoder().encodeToString(realPngBomb(1, 1, 6, 0));
        byte[] decoded = Base64.getDecoder().decode(truncatedPng);
        assertThat(decoded).hasSizeGreaterThan(8);
        assertThat(Arrays.copyOf(decoded, 8))
                .containsExactly((byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
        try {
            assertThat(ImageIO.read(new ByteArrayInputStream(decoded)))
                    .as("사전조건(회귀 불변): ImageIO 완전 디코드는 여전히 이 입력에서 실패한다"
                            + " — fix는 이 실패를 더 이상 거부 사유로 쓰지 않을 뿐이다")
                    .isNull();
        } catch (IOException expected) {
            // ImageIO 구현에 따라 빈 IDAT은 null 대신 IIOException으로 보고할 수 있다.
        }

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "truncated-png").put("type", "IMAGE")
                .put("src", "data:image/png;base64," + truncatedPng).put("alt", "잘린 PNG");

        assertThat(validator.validate((short) 2, document))
                .as("IHDR가 파싱 가능하고 예산 내이면 IDAT 완전 디코드 실패만으로 거부하지 않는다(정책 반전)")
                .isNotNull();
    }

    /**
     * 🔴 PR#968 R1 D2 RED-first(실 사용자 경로 — I-3): 저장소 실 자산 pwa-192.png(2,743B)을 R1이
     * 라이브 Chromium으로 실측한 것과 동일하게 1,409B(≈51%)에서 자른다 — "다운로드가 51%에서 끊긴
     * PNG"의 정확한 재현이다. Chromium {@code <img>}는 이 입력을 192x192로 정상 load한다(R1 실측,
     * 여기서는 재실행하지 않고 스펙 원문 수치를 인용). fix 전 BE는 {@code ImageIO.read()} 완전 디코드
     * 실패로 이 입력을 거부해 I-3(정상 이미지를 거부하지 않는다)을 위반했다.
     */
    @Test
    void PR968R1_D2_png_acceptsRealAssetTruncatedAtDownloadInterruptionPoint() throws Exception {
        byte[] original = repositoryAsset("clients/desktop/public/pwa-192.png");
        assertThat(original).hasSize(2_743);
        byte[] truncated = Arrays.copyOf(original, 1_409);
        assertThat(Arrays.copyOf(truncated, 8))
                .as("사전조건: PNG 시그니처는 살아 있어야 한다")
                .containsExactly((byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
        try {
            assertThat(ImageIO.read(new ByteArrayInputStream(truncated)))
                    .as("사전조건(회귀 불변): 51% 절단은 ImageIO 완전 디코드를 여전히 실패시킨다")
                    .isNull();
        } catch (IOException expected) {
            // 구현에 따라 null 대신 IIOException으로 보고될 수 있다(위 정책 반전 테스트와 동일 사유).
        }

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "half-truncated-download-png").put("type", "IMAGE")
                .put("src", "data:image/png;base64," + Base64.getEncoder().encodeToString(truncated))
                .put("alt", "다운로드 중단 PNG");

        assertThat(validator.validate((short) 2, document))
                .as("R1 실측: 51% 절단 pwa-192.png은 Chromium에서 192x192로 정상 load되므로 BE가 거부하면 I-3 위반이다")
                .isNotNull();
    }

    /**
     * 🔴 PR#968 R1 D2 RED-first(실 사용자 경로 — I-3): 저장소 실 자산 pwa-192.png의 첫 IDAT 페이로드
     * 중간 바이트를 뒤집고 CRC32를 그 손상된 바이트 기준으로 재계산한다 — "PNG signature/IHDR/CRC는
     * 맞지만 압축 스트림 내용 자체가 손상된"(R1 스펙 PNG_IDAT_PAYLOAD_CORRUPT_CRC_FIXED, BYTES=2743)
     * 재현이다. R1 라이브 실측에서 Chromium {@code <img>}는 이 입력도 192x192로 정상 load했다.
     */
    @Test
    void PR968R1_D2_png_acceptsIdatPayloadCorruptedWithCrcRecalculated() throws Exception {
        byte[] original = repositoryAsset("clients/desktop/public/pwa-192.png");
        byte[] corrupted = corruptFirstIdatPayloadKeepCrcValid(original);
        assertThat(corrupted).hasSize(original.length);
        assertThat(corrupted).isNotEqualTo(original);
        try {
            assertThat(ImageIO.read(new ByteArrayInputStream(corrupted)))
                    .as("사전조건(회귀 불변): IDAT 페이로드 손상은 ImageIO 완전 디코드를 여전히 실패시킨다")
                    .isNull();
        } catch (IOException expected) {
            // 구현에 따라 null 대신 IIOException으로 보고될 수 있다.
        }

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "corrupt-idat-crc-fixed-png").put("type", "IMAGE")
                .put("src", "data:image/png;base64," + Base64.getEncoder().encodeToString(corrupted))
                .put("alt", "IDAT 손상 PNG");

        assertThat(validator.validate((short) 2, document))
                .as("R1 실측: IDAT 내용 손상(CRC는 유효) PNG도 Chromium에서 192x192로 정상 load되므로 BE가 거부하면 I-3 위반이다")
                .isNotNull();
    }

    /**
     * 회귀 울타리(PR#968 R1 D2 fix가 과잉 완화하지 않았는지 확인) — IHDR 자체가 손상되어 치수를
     * 판독할 수 없는 입력은 여전히 거부되어야 한다. jshell 실측: 아래 세 형태 전부 header 파싱
     * 단계({@code reader.getWidth(0)})에서 "I/O error reading PNG header!"로 실패하며, 이는 IDAT
     * 단계 실패("Error reading PNG image data")와 구분되는 별도 예외 메시지다 — fix는 IDAT 단계
     * 실패만 관대하게 다루고 header 단계 실패는 그대로 거부한다.
     */
    @Test
    void PR968R1_D2_png_stillRejectsHeaderLevelCorruption() throws Exception {
        byte[] invalidColorType = realPngBomb(4, 4, 5, 4); // colorType=5는 PNG 스펙상 존재하지 않는다
        byte[] zeroWidth = realPngBomb(0, 4, 6, 4);
        byte[] garbageAfterSignature = new byte[64];
        System.arraycopy(new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, 0, garbageAfterSignature, 0, 8);
        new java.util.Random(42).nextBytes(garbageAfterSignature);
        System.arraycopy(new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, 0, garbageAfterSignature, 0, 8);

        for (byte[] bytes : List.of(invalidColorType, zeroWidth, garbageAfterSignature)) {
            var document = fixture("valid-default.json").get("document").deepCopy();
            ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                    .addObject().put("key", "header-corrupt-png").put("type", "IMAGE")
                    .put("src", "data:image/png;base64," + Base64.getEncoder().encodeToString(bytes))
                    .put("alt", "헤더 손상 PNG");
            assertThatThrownBy(() -> validator.validate((short) 2, document))
                    .as("IHDR 자체가 파싱 불가능한 입력은 계속 거부되어야 한다")
                    .isInstanceOf(BusinessException.class);
        }
    }

    /** R1-4 회귀 울타리 — 정상 WebP(단순 손실 VP8) 업로드가 fix 이후에도 막히면 안 된다. */
    @Test
    void R1_4_webp_acceptsStructurallyValidVp8Lossy() throws Exception {
        byte[] webp = minimalValidWebpVp8(4, 4);
        assertThat(new String(Arrays.copyOfRange(webp, 0, 4), StandardCharsets.US_ASCII)).isEqualTo("RIFF");
        assertThat(new String(Arrays.copyOfRange(webp, 8, 12), StandardCharsets.US_ASCII)).isEqualTo("WEBP");

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "valid-webp").put("type", "IMAGE")
                .put("src", "data:image/webp;base64," + Base64.getEncoder().encodeToString(webp))
                .put("alt", "정상 WebP 로고");

        assertThat(validator.validate((short) 2, document)).isNotNull();
    }

    /** R1-4 회귀 울타리 — 정상 WebP(무손실 VP8L) 업로드도 fix 이후 막히면 안 된다. */
    @Test
    void R1_4_webp_acceptsStructurallyValidVp8Lossless() throws Exception {
        byte[] webp = minimalValidWebpVp8L(4, 4);

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "valid-webp-lossless").put("type", "IMAGE")
                .put("src", "data:image/webp;base64," + Base64.getEncoder().encodeToString(webp))
                .put("alt", "정상 WebP(무손실) 로고");

        assertThat(validator.validate((short) 2, document)).isNotNull();
    }

    @Test
    void R3_webp_acceptsVp8lHeaderWithoutImagePayloadBecauseChromiumLoadsIt() throws Exception {
        byte[] headerOnly = headerOnlyWebpVp8L(4, 4);

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "header-only-vp8l").put("type", "IMAGE")
                .put("src", "data:image/webp;base64," + Base64.getEncoder().encodeToString(headerOnly))
                .put("alt", "헤더만 있는 VP8L");

        // #951 R3의 거부 기대를 반전한다. 새 Chromium 실측에서 동일한 5바이트 VP8L
        // 입력은 <img> load 4x4로 정상 렌더된다. 이를 계속 거부하면 I-3(정상 이미지
        // 거부 금지)를 위반하므로, 형태별 방어를 추가하지 않고 렌더 엔진 판정을 따른다.
        assertThat(validator.validate((short) 2, document)).isNotNull();
    }

    @Test
    void R3_webp_rejectsVp8xWithoutImageSubchunk() throws Exception {
        byte[] extensionHeaderOnly = buildWebp("VP8X", new byte[10]);

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "header-only-vp8x").put("type", "IMAGE")
                .put("src", "data:image/webp;base64," + Base64.getEncoder().encodeToString(extensionHeaderOnly))
                .put("alt", "이미지 청크 없는 VP8X");

        assertThatThrownBy(() -> validator.validate((short) 2, document))
                .as("VP8X 확장 헤더만 있고 이미지 서브청크가 없는 입력은 디코드 가능한 이미지가 아니다")
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void R3_webp_acceptsVp8xContainerWithVp8ImageSubchunk() throws Exception {
        byte[] extended = minimalValidWebpVp8xWithVp8Image();

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "valid-vp8x").put("type", "IMAGE")
                .put("src", "data:image/webp;base64," + Base64.getEncoder().encodeToString(extended))
                .put("alt", "정상 VP8X 컨테이너");

        assertThat(validator.validate((short) 2, document)).isNotNull();
    }

    @Test
    void R3_webp_acceptsChromiumProducedVp8xWithMetadata() throws Exception {
        // Chromium canvas.toDataURL('image/webp')가 실제로 생성한 4x4 WebP(ICC 메타데이터 + VP8X + VP8).
        String chromiumWebp = "UklGRhwCAABXRUJQVlA4WAoAAAAgAAAAAwAAAwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggLgAAANABAJ0BKgQABAABQCYloAJ0ugH4AAOwAP7lCv/4s5GI7PN/9tD+tD+tD/pQAAA=";

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "chromium-webp").put("type", "IMAGE")
                .put("src", "data:image/webp;base64," + chromiumWebp)
                .put("alt", "Chromium WebP 로고");

        assertThat(validator.validate((short) 2, document)).isNotNull();
    }

    /** K-3 회귀 울타리 — 저장소 실제 마스코트의 첫 ANMF 프레임을 포함한 애니메이션 WebP. */
    @Test
    void R5_webp_acceptsRepositoryAnimationAssetFrame() throws Exception {
        byte[] webp = firstAnimationFrameFromRepositoryAsset();
        assertThat(new String(Arrays.copyOfRange(webp, 12, 16), StandardCharsets.US_ASCII))
                .isEqualTo("VP8X");
        assertThat(new String(Arrays.copyOfRange(webp, 30, 34), StandardCharsets.US_ASCII))
                .isEqualTo("ANIM");
        assertThat(new String(Arrays.copyOfRange(webp, 44, 48), StandardCharsets.US_ASCII))
                .isEqualTo("ANMF");

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "repository-animation-webp").put("type", "IMAGE")
                .put("src", "data:image/webp;base64," + Base64.getEncoder().encodeToString(webp))
                .put("alt", "저장소 실제 애니메이션 마스코트 자산");

        assertThat(validator.validate((short) 2, document)).isNotNull();
    }

    /**
     * #965 회귀 울타리: 합성 fixture가 아니라 저장소 실재 이미지의 현재 계약을 고정한다.
     * 원본 애니메이션 WebP는 50KB 상한으로 거부하고, 같은 원본에서 실제 ANMF 첫 프레임만
     * 잘라 만든 8,876B 파생본과 저장소 실 PNG 4종은 validator가 허용해야 한다.
     */
    @Test
    void R5_realRepositoryImageFence_preservesAllowlistSizeAndBudgetContract() throws Exception {
        byte[] originalMascot = repositoryAsset("clients/web/design-system/src/assets/mascot/samhani.webp");
        assertThat(originalMascot).hasSize(71_880);
        var oversizedDocument = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) oversizedDocument.at("/bands/0/elements"))
                .addObject().put("key", "repository-mascot-original").put("type", "IMAGE")
                .put("src", "data:image/webp;base64," + Base64.getEncoder().encodeToString(originalMascot))
                .put("alt", "저장소 마스코트 원본");
        assertThatThrownBy(() -> validator.validate((short) 2, oversizedDocument))
                .as("원본 71,880B는 50KB 상한을 넘어 거부되어야 한다")
                .isInstanceOf(BusinessException.class);

        byte[] animationFrame = firstAnimationFrameFromRepositoryAsset();
        assertThat(animationFrame).hasSize(8_876);
        var frameDocument = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) frameDocument.at("/bands/0/elements"))
                .addObject().put("key", "repository-mascot-frame").put("type", "IMAGE")
                .put("src", "data:image/webp;base64," + Base64.getEncoder().encodeToString(animationFrame))
                .put("alt", "저장소 마스코트 첫 프레임");
        assertThat(validator.validate((short) 2, frameDocument)).isNotNull();

        List<Path> pngAssets = List.of(
                Path.of("clients/desktop/public/pwa-192.png"),
                Path.of("clients/desktop/public/pwa-512.png"),
                Path.of("clients/desktop/android/app/src/main/res/drawable/splash.png"),
                Path.of("clients/desktop/android/app/src/main/res/mipmap-mdpi/ic_launcher.png"));
        List<Integer> expectedSizes = List.of(2_743, 9_707, 4_040, 1_869);
        for (int index = 0; index < pngAssets.size(); index++) {
            byte[] png = repositoryAsset(pngAssets.get(index).toString());
            assertThat(png).hasSize(expectedSizes.get(index));
            var pngDocument = fixture("valid-default.json").get("document").deepCopy();
            ((com.fasterxml.jackson.databind.node.ArrayNode) pngDocument.at("/bands/0/elements"))
                    .addObject().put("key", "repository-png-" + index).put("type", "IMAGE")
                    .put("src", "data:image/png;base64," + Base64.getEncoder().encodeToString(png))
                    .put("alt", "저장소 실 PNG " + index);
            assertThat(validator.validate((short) 2, pngDocument))
                    .as("저장소 실 PNG %s가 거부되지 않아야 한다", pngAssets.get(index))
                    .isNotNull();
        }
    }

    /**
     * 🔴 R1-4 RED-first(이슈 #913 코멘트 "손상 WebP" — 개발책임자 결정 2026-07-27로 이 PR에
     * 흡수): RIFF/WEBP 시그니처(offset 0~11)는 유효하지만 그 뒤 VP8 청크 데이터가 통째로
     * 잘렸다. 구 코드(RIFF/WEBP 12바이트만 보고 webp면 즉시 true)라면 이 파일도 통과했다 —
     * 아래 사전조건 단언이 그 사실을 직접 확인한다.
     */
    @Test
    void R1_4_webp_rejectsSignatureValidButTruncatedContent() throws Exception {
        byte[] truncated = truncatedWebpMissingChunkData();
        assertThat(new String(Arrays.copyOfRange(truncated, 0, 4), StandardCharsets.US_ASCII))
                .as("사전조건: RIFF 시그니처는 유효해야 한다(구 코드라면 이미 여기서 통과했다)")
                .isEqualTo("RIFF");
        assertThat(new String(Arrays.copyOfRange(truncated, 8, 12), StandardCharsets.US_ASCII))
                .as("사전조건: WEBP 시그니처는 유효해야 한다(구 코드라면 이미 여기서 통과했다)")
                .isEqualTo("WEBP");

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "truncated-webp").put("type", "IMAGE")
                .put("src", "data:image/webp;base64," + Base64.getEncoder().encodeToString(truncated))
                .put("alt", "잘린 WebP");

        assertThatThrownBy(() -> validator.validate((short) 2, document))
                .as("RIFF/WEBP signature만 맞고 청크 데이터가 잘린 입력은 거부되어야 한다")
                .isInstanceOf(BusinessException.class);
    }

    /**
     * 🔴 R1-4: 파일 길이는 정상 WebP와 완전히 동일하지만(길이/RIFF 크기 일치 검사만으로는
     * 못 잡는다) VP8 시작 코드 바이트만 조용히 손상된 경우 — "내용이 깨진" 손상을 길이
     * 불일치가 아니라 시작 코드 검사가 잡아야 함을 보여준다.
     */
    @Test
    void R1_4_webp_rejectsSignatureValidButCorruptStartCode() throws Exception {
        byte[] valid = minimalValidWebpVp8(4, 4);
        byte[] corrupted = corruptWebpStartCode(valid);
        assertThat(corrupted).hasSize(valid.length);

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "corrupt-startcode-webp").put("type", "IMAGE")
                .put("src", "data:image/webp;base64," + Base64.getEncoder().encodeToString(corrupted))
                .put("alt", "손상 WebP");

        assertThatThrownBy(() -> validator.validate((short) 2, document))
                .as("길이는 정상이지만 VP8 시작 코드가 깨진 입력은 거부되어야 한다")
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

    /**
     * 🔴 H15 RED-first (PM 2차 지적 재현): "가짜" 폭탄(IDAT 없음/빈)은 reader 가 목적지 버퍼
     * 할당 "전"에 실패해 실측이 왜곡된다(PM 실서버: 22ms·메모리 무변동 = 오측정). 이 테스트는
     * PM 이 재현·실측에 쓴 것과 동일한 "진짜" 폭탄(실 IDAT 스캔라인 2줄, 나머지는 선언만) —
     * PM 사례 A: 7999×7999 RGBA = 63,984,001px, 구(舊) 픽셀 예산(64,000,000) 바로 아래라
     * 픽셀-개수 기준 검사는 통과시켰지만 실제로는 4B/px × 픽셀수 ≈ 244MiB 를 할당했다(PM 실측:
     * 컨테이너 376.1→621.6MiB, +245MiB).
     *
     * 하드 게이트는 예외 메시지 내용이다 — {@code checkImageDecodedByteBudget}은
     * {@code ImageIO.read()} 호출 "이전에" reject()를 던지므로, 메시지가 나온다는 것 자체가
     * 비싼 read() 경로에 도달하지 않았다는 코드 경로 증거다. 힙 peak/소요시간은 정보성 출력만
     * 한다 — RED-first 검증 중 {@code MemoryPoolMXBean#getPeakUsage()} 조차 스위트 전체 실행 시
     * 무관한 다른 테스트의 잔여 힙과 섞여(실측 147MB vs 단독실행 398MB) CI 하드 게이트로 쓰기엔
     * 노이즈가 컸다.
     */
    @Test
    void H15_pmCaseA_rgbaJustUnderOldPixelBudgetIsNowRejectedByByteBudget() throws Exception {
        byte[] bomb = realPngBomb(7999, 7999, 6, 2);
        long declaredPixels = 7999L * 7999L;
        assertThat(declaredPixels).as("PM 사례 A: 구 픽셀 예산(64,000,000) 바로 아래").isEqualTo(63_984_001L);
        String dataUri = "data:image/png;base64," + Base64.getEncoder().encodeToString(bomb);

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "bomb-image-a").put("type", "IMAGE")
                .put("src", dataUri).put("alt", "PM 사례 A 폭탄");

        var heapPools = java.lang.management.ManagementFactory.getMemoryPoolMXBeans().stream()
                .filter(pool -> pool.getType() == java.lang.management.MemoryType.HEAP)
                .toList();
        for (var pool : heapPools) {
            try {
                pool.resetPeakUsage();
            } catch (UnsupportedOperationException ignored) {
                // 이 풀은 peak 추적 미지원 — 정보성 출력에서만 쓰이므로 실패해도 무해하다.
            }
        }
        long startNanos = System.nanoTime();
        Throwable thrown = catchThrowable(() -> validator.validate((short) 2, document));
        long elapsedMs = (System.nanoTime() - startNanos) / 1_000_000;
        long peakUsedBytes = heapPools.stream()
                .mapToLong(pool -> {
                    var usage = pool.getPeakUsage();
                    return usage == null ? 0L : usage.getUsed();
                })
                .max().orElse(0L);
        System.out.println("H15 PM-A 실측(원문·정보성): 7999x7999 RGBA(진짜 폭탄, wire=" + bomb.length
                + "B) -> elapsed=" + elapsedMs + "ms, 힙 풀 peak used=" + peakUsedBytes + " bytes ("
                + (peakUsedBytes / (1024 * 1024)) + " MB), 예외=" + thrown);

        assertThat(thrown).as("거부되어야 한다(PM 실측: fix 전 245MiB 할당 후에도 결국 거부는 됐었다)")
                .isInstanceOf(BusinessException.class);
        assertThat(thrown)
                .as("read() 호출 이전 바이트 예산 단계에서 거부됐다는 직접 증거(코드 경로)")
                .hasMessageContaining("이미지가 너무 커서 처리할 수 없습니다");
    }

    /** PM 사례 B 회귀: 구 픽셀 예산을 넘던 케이스는 새 바이트 예산에서도 당연히 계속 거부된다. */
    @Test
    void H15_pmCaseB_rgbaOverOldPixelBudgetStaysRejected() throws Exception {
        byte[] bomb = realPngBomb(8001, 8001, 6, 2);
        String dataUri = "data:image/png;base64," + Base64.getEncoder().encodeToString(bomb);
        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "bomb-image-b").put("type", "IMAGE")
                .put("src", dataUri).put("alt", "PM 사례 B 폭탄");

        assertThatThrownBy(() -> validator.validate((short) 2, document))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미지가 너무 커서 처리할 수 없습니다");
    }

    /** PM 사례 C 회귀: 평범한 크기(1000×1000 RGBA)는 새 바이트 예산에서도 계속 통과해야 한다
     * (1000×1000×4B ≈ 3.8MB, 64MiB 예산의 6% 수준). */
    @Test
    void H15_pmCaseC_normalSmallRgbaStillPasses() throws Exception {
        byte[] normal = realPngBomb(1000, 1000, 6, 1000); // idatRows=height -> 진짜 완전한 이미지
        assertThat(ImageIO.read(new ByteArrayInputStream(normal)))
                .as("사전조건: 완전히 디코드되는 정상 이미지여야 한다").isNotNull();
        String dataUri = "data:image/png;base64," + Base64.getEncoder().encodeToString(normal);
        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "normal-image-c").put("type", "IMAGE")
                .put("src", dataUri).put("alt", "PM 사례 C 정상 이미지");

        assertThat(validator.validate((short) 2, document)).isNotNull();
    }

    /**
     * H15 보강: 위 RED-first 테스트가 "손상된"(스캔라인 부족) 입력이었다면, 이 테스트는 진짜로 끝까지
     * 디코드되는 유효한 대형 이미지로 같은 결함을 증명한다. 1비트 흑백 10000×10000 PNG는 100,000,000
     * 픽셀이지만 비트팩킹 덕에 12,227바이트로 압축돼(실측) 기존 MAX_IMAGE_BYTES(50KB) 봉투를 여유
     * 있게 통과한다 — fix 전에는 "실제로 열 수 있는 이미지"이므로 그대로 저장을 허용했고(H15 결함),
     * fix 후에는 예측 디코드 크기(100,000,000B×1B/px 근사 ≈ 95.4MB)가 새 바이트 예산(64MiB)을
     * 초과해 read() 호출 자체 없이 거부된다. accept↔reject 는 자원 측정과 달리 완전히 결정적이다.
     */
    @Test
    void H15_genuinelyDecodableOversizedImageIsRejectedByByteBudget() throws Exception {
        byte[] bigValidPng = oneBitPng(10000, 10000);
        // DocumentPayloadValidator.MAX_IMAGE_BYTES(50*1024)는 private — 값만 그대로 인용한다.
        assertThat(bigValidPng.length)
                .as("100,000,000px 1비트 이미지도 비트팩킹 압축으로 50KB 봉투 안에 들어간다")
                .isLessThan(50 * 1024);
        // 대조군: 이 바이트 배열은 진짜로 끝까지 디코드된다(손상 이미지가 아니다) — fix 이전 코드가
        // 이 입력을 "정상"으로 받아들였던 것과 같은 근거다.
        assertThat(ImageIO.read(new ByteArrayInputStream(bigValidPng)))
                .as("사전조건: 이 PNG는 실제로 디코드 가능해야 한다(손상 이미지 테스트가 아니다)")
                .isNotNull();

        String dataUri = "data:image/png;base64," + Base64.getEncoder().encodeToString(bigValidPng);
        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "big-valid-image").put("type", "IMAGE")
                .put("src", dataUri).put("alt", "초대형 유효 이미지");

        assertThatThrownBy(() -> validator.validate((short) 2, document))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미지가 너무 커서 처리할 수 없습니다");
    }

    /** H15가 PNG 전용이 아니라 JPEG(SOF 선언 치수)에도 동일하게 적용되는지 기능 확인. */
    @Test
    void H15_jpegHugeDeclaredDimensionsAreRejected() throws Exception {
        byte[] bomb = minimalJpegWithDeclaredDimensions(15000, 15000);
        String dataUri = "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(bomb);

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "bomb-image-jpeg").put("type", "IMAGE")
                .put("src", dataUri).put("alt", "폭탄");

        assertThatThrownBy(() -> validator.validate((short) 2, document))
                .isInstanceOf(BusinessException.class);
    }

    /**
     * H15-c 회귀: 이번 fix가 정상 이미지를 막으면 안 된다. 인터레이스(Adam7) PNG, 프로그레시브 JPEG,
     * 평범한 1x1 PNG가 fix 이후에도 계속 통과하는지 확인한다.
     */
    @Test
    void H15c_interlacedPngStillPasses() throws Exception {
        byte[] png = interlacedPng(64, 64);
        assertThat(png[28]).as("IHDR interlace 바이트가 Adam7(1)이어야 회귀 확인 대상이 실제로 인터레이스다")
                .isEqualTo((byte) 1);
        String dataUri = "data:image/png;base64," + Base64.getEncoder().encodeToString(png);

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "interlaced-logo").put("type", "IMAGE")
                .put("src", dataUri).put("alt", "인터레이스 로고");

        assertThat(validator.validate((short) 2, document)).isNotNull();
    }

    @Test
    void H15c_progressiveJpegStillPasses() throws Exception {
        byte[] jpeg = progressiveJpeg(64, 64);
        String dataUri = "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(jpeg);

        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "progressive-logo").put("type", "IMAGE")
                .put("src", dataUri).put("alt", "프로그레시브 로고");

        assertThat(validator.validate((short) 2, document)).isNotNull();
    }

    @Test
    void H15c_normal1x1PngStillPasses() throws Exception {
        var document = fixture("valid-default.json").get("document").deepCopy();
        ((com.fasterxml.jackson.databind.node.ArrayNode) document.at("/bands/0/elements"))
                .addObject().put("key", "tiny-logo").put("type", "IMAGE")
                .put("src", "data:image/png;base64,"
                        + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
                .put("alt", "정상 로고");

        assertThat(validator.validate((short) 2, document)).isNotNull();
    }

    /**
     * 🔴 PM 2차 검증 지적: IHDR + 빈 IDAT("펼쳐지지 않은" 폭탄)은 reader 가 목적지 픽셀 버퍼를
     * "할당하기 전"에 실패해 실제 공격이 되지 못한다(PM 실서버 실측: 22ms·메모리 무변동 = 오측정).
     * 진짜 공격은 IHDR 이 큰 치수를 선언하면서 IDAT 에 "일부"(선언 높이보다 훨씬 적은) 실 스캔라인을
     * 담는 것이다 — reader 는 IHDR 치수로 목적지를 먼저 할당한 "뒤" 에야 데이터 부족을 발견해
     * 실패한다. PM 의 make-bomb-png.cjs 와 동일한 구성(zlib deflate 실압축 IDAT). colorType:
     * 6=RGBA(4B/px) · 2=RGB(3B/px) · 0=Gray(1B/px).
     */
    private static byte[] realPngBomb(int width, int height, int colorType, int idatRows) throws IOException {
        var out = new ByteArrayOutputStream();
        out.write(new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A});
        var ihdr = ByteBuffer.allocate(13);
        ihdr.putInt(width);
        ihdr.putInt(height);
        ihdr.put((byte) 8); // bit depth
        ihdr.put((byte) colorType);
        ihdr.put((byte) 0); // compression
        ihdr.put((byte) 0); // filter
        ihdr.put((byte) 0); // interlace: none
        writeChunk(out, "IHDR", ihdr.array());

        int bytesPerPixel = colorType == 6 ? 4 : colorType == 2 ? 3 : 1;
        byte[] row = new byte[1 + width * bytesPerPixel]; // filter byte(0) + zero 픽셀 데이터
        var raw = new ByteArrayOutputStream();
        for (int i = 0; i < idatRows; i++) raw.write(row);
        byte[] idatRaw = raw.toByteArray();
        var deflater = new java.util.zip.Deflater(java.util.zip.Deflater.BEST_COMPRESSION);
        deflater.setInput(idatRaw);
        deflater.finish();
        var idatBuf = new byte[idatRaw.length + 64];
        int n = deflater.deflate(idatBuf);
        writeChunk(out, "IDAT", java.util.Arrays.copyOf(idatBuf, n));
        writeChunk(out, "IEND", new byte[0]);
        return out.toByteArray();
    }

    private static void writeChunk(ByteArrayOutputStream out, String type, byte[] data) throws IOException {
        byte[] typeBytes = type.getBytes(StandardCharsets.US_ASCII);
        out.write(ByteBuffer.allocate(4).putInt(data.length).array());
        out.write(typeBytes);
        out.write(data);
        CRC32 crc = new CRC32();
        crc.update(typeBytes);
        crc.update(data);
        out.write(ByteBuffer.allocate(4).putInt((int) crc.getValue()).array());
    }

    /**
     * PR#968 R1 D2 재현: 첫 IDAT 청크의 페이로드 중간 바이트를 뒤집고 CRC32를 그 손상된 바이트
     * 기준으로 재계산한다 — "CRC 검사는 통과하지만 압축 스트림 내용 자체는 손상된" 입력(R1 스펙
     * PNG_IDAT_PAYLOAD_CORRUPT_CRC_FIXED)을 만든다. 파일 길이는 원본과 동일하게 유지된다.
     */
    private static byte[] corruptFirstIdatPayloadKeepCrcValid(byte[] png) {
        byte[] out = png.clone();
        int offset = 8; // PNG 시그니처 뒤
        while (offset + 8 <= out.length) {
            int length = ((out[offset] & 0xFF) << 24) | ((out[offset + 1] & 0xFF) << 16)
                    | ((out[offset + 2] & 0xFF) << 8) | (out[offset + 3] & 0xFF);
            String type = new String(out, offset + 4, 4, StandardCharsets.US_ASCII);
            int dataStart = offset + 8;
            if ("IDAT".equals(type) && length > 4) {
                int flipAt = dataStart + length / 2;
                out[flipAt] = (byte) (out[flipAt] ^ 0xFF);
                CRC32 crc = new CRC32();
                crc.update(out, offset + 4, 4 + length);
                int crcValue = (int) crc.getValue();
                int crcOffset = dataStart + length;
                out[crcOffset] = (byte) (crcValue >>> 24);
                out[crcOffset + 1] = (byte) (crcValue >>> 16);
                out[crcOffset + 2] = (byte) (crcValue >>> 8);
                out[crcOffset + 3] = (byte) crcValue;
                return out;
            }
            offset = dataStart + length + 4;
        }
        throw new IllegalStateException("IDAT 청크를 찾을 수 없습니다");
    }

    /** SOF0(0xFFC0)에 (width, height)를 선언한 최소 JPEG. Huffman/quant 테이블·scan 데이터는 없다 —
     * getWidth()/getHeight() 헤더 피크는 SOF만으로 충분하다. */
    private static byte[] minimalJpegWithDeclaredDimensions(int width, int height) throws IOException {
        var out = new ByteArrayOutputStream();
        out.write(new byte[]{(byte) 0xFF, (byte) 0xD8}); // SOI
        out.write(new byte[]{(byte) 0xFF, (byte) 0xC0}); // SOF0
        out.write(new byte[]{0x00, 0x0B}); // length=11 (자기자신 포함)
        out.write(0x08); // precision
        out.write((height >> 8) & 0xFF);
        out.write(height & 0xFF);
        out.write((width >> 8) & 0xFF);
        out.write(width & 0xFF);
        out.write(0x01); // numComponents
        out.write(new byte[]{0x01, 0x11, 0x00}); // component id, sampling, qtable selector
        out.write(new byte[]{(byte) 0xFF, (byte) 0xD9}); // EOI
        return out.toByteArray();
    }

    /** Adam7 인터레이스 PNG를 ImageIO 표준 메타데이터 API로 생성한다(Oracle ImageIO 메타데이터
     * 가이드의 표준 관용구 — writer 기본 메타데이터 트리의 IHDR interlaceMethod를 Adam7로 덮어쓴다). */
    private static byte[] interlacedPng(int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                image.setRGB(x, y, 0xFF000000 | ((x * 37 + y * 91) & 0xFFFFFF));
            }
        }
        ImageWriter writer = ImageIO.getImageWritersByFormatName("png").next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        ImageTypeSpecifier typeSpecifier = ImageTypeSpecifier.createFromBufferedImageType(BufferedImage.TYPE_INT_ARGB);
        IIOMetadata metadata = writer.getDefaultImageMetadata(typeSpecifier, param);
        String formatName = metadata.getNativeMetadataFormatName();
        IIOMetadataNode root = (IIOMetadataNode) metadata.getAsTree(formatName);
        IIOMetadataNode ihdr = getOrCreateChild(root, "IHDR");
        // javax_imageio_png_1.0 스펙의 IHDR.interlaceMethod 열거값은 소문자 "adam7"/"none"이다
        // (probe 실측: IIOMetadataFormat#getAttributeEnumerations == [none, adam7]).
        ihdr.setAttribute("interlaceMethod", "adam7");
        metadata.setFromTree(formatName, root);

        var out = new ByteArrayOutputStream();
        try (var ios = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(ios);
            writer.write(metadata, new IIOImage(image, null, metadata), param);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }

    /** 진짜로 끝까지 디코드되는 유효한 대형 1비트(흑백) PNG를 만든다. 픽셀당 1비트라 8000×8000~
     * 12000×12000 규모도 비트팩킹+deflate 압축으로 수십 KB 이내로 들어간다(실측: 10000×10000
     * =12,227바이트) — "정상적으로 열리는 이미지"가 여전히 MAX_IMAGE_BYTES(50KB) 봉투를 통과하면서도
     * MAX_IMAGE_PIXELS를 초과할 수 있음을 보여준다. */
    private static byte[] oneBitPng(int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_BYTE_BINARY);
        var dataBuffer = (java.awt.image.DataBufferByte) image.getRaster().getDataBuffer();
        java.util.Arrays.fill(dataBuffer.getData(), (byte) 0x00);

        ImageWriter writer = ImageIO.getImageWritersByFormatName("png").next();
        var out = new ByteArrayOutputStream();
        try (var ios = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(ios);
            writer.write(null, new IIOImage(image, null, null), writer.getDefaultWriteParam());
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }

    private static IIOMetadataNode getOrCreateChild(IIOMetadataNode root, String name) {
        var nodes = root.getElementsByTagName(name);
        if (nodes.getLength() > 0) {
            return (IIOMetadataNode) nodes.item(0);
        }
        var child = new IIOMetadataNode(name);
        root.appendChild(child);
        return child;
    }

    private static byte[] progressiveJpeg(int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                image.setRGB(x, y, (x * 37 + y * 91) & 0xFFFFFF);
            }
        }
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setProgressiveMode(ImageWriteParam.MODE_DEFAULT);

        var out = new ByteArrayOutputStream();
        try (var ios = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(ios);
            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }

    /** libwebp이 유효한 VP8(단순 손실) 키프레임으로 인정하는 최소 구조 — RIFF 크기 ·
     * VP8 청크 크기 · 3바이트 시작 코드(0x9D 0x01 0x2A)까지 전부 올바른 "진짜" 최소 WebP.
     * frame tag(3바이트) = key_frame=0(bit0) · version=0(bits1-3) · show_frame=1(bit4) ·
     * first_part_size=3(bits5-23) → 0x70,0x00,0x00. width/height는 14bit 이하라 스케일=0. */
    private static byte[] minimalValidWebpVp8(int width, int height) throws IOException {
        byte[] chunkData = new byte[]{
                0x70, 0x00, 0x00,
                (byte) 0x9D, 0x01, 0x2A,
                (byte) (width & 0xFF), (byte) ((width >> 8) & 0xFF),
                (byte) (height & 0xFF), (byte) ((height >> 8) & 0xFF),
        };
        return buildWebp("VP8 ", chunkData);
    }

    /** libwebp이 유효한 VP8L(무손실) 이미지로 인정하는 최소 구조 — 1바이트 시그니처
     * (0x2F) + packed(width-1(14bit)|height-1(14bit)|alpha(1bit)|version(3bit)). */
    private static byte[] minimalValidWebpVp8L(int width, int height) throws IOException {
        long bits = (long) (width - 1) | ((long) (height - 1) << 14);
        byte[] chunkData = new byte[]{
                0x2F,
                (byte) (bits & 0xFF), (byte) ((bits >> 8) & 0xFF),
                (byte) ((bits >> 16) & 0xFF), (byte) ((bits >> 24) & 0xFF),
                0x00, // packed header 뒤의 최소 bitstream payload
        };
        return buildWebp("VP8L", chunkData);
    }

    private static byte[] headerOnlyWebpVp8L(int width, int height) throws IOException {
        long bits = (long) (width - 1) | ((long) (height - 1) << 14);
        byte[] chunkData = new byte[]{
                0x2F,
                (byte) (bits & 0xFF), (byte) ((bits >> 8) & 0xFF),
                (byte) ((bits >> 16) & 0xFF), (byte) ((bits >> 24) & 0xFF),
        };
        return buildWebp("VP8L", chunkData);
    }

    /** VP8X 확장 헤더만으로 통과하지 않도록 실제 VP8 이미지 서브청크를 함께 둔 변형. */
    private static byte[] minimalValidWebpVp8xWithVp8Image() throws IOException {
        byte[] extensionData = new byte[10];
        extensionData[4] = 0x03; // canvas width - 1 (4px)
        extensionData[7] = 0x03; // canvas height - 1 (4px)
        byte[] vp8Data = new byte[]{
                0x70, 0x00, 0x00,
                (byte) 0x9D, 0x01, 0x2A,
                0x04, 0x00, 0x04, 0x00,
        };
        var out = new ByteArrayOutputStream();
        int riffSize = 4 + 8 + extensionData.length + 8 + vp8Data.length;
        out.write(new byte[]{'R', 'I', 'F', 'F'});
        writeUInt32LE(out, riffSize);
        out.write(new byte[]{'W', 'E', 'B', 'P'});
        writeWebpChunk(out, "VP8X", extensionData);
        writeWebpChunk(out, "VP8 ", vp8Data);
        return out.toByteArray();
    }

    /** RIFF/WEBP/VP8 헤더(시그니처 포함)는 온전하지만 청크 데이터가 통째로 잘린 —
     * "손상 WebP"(이슈 #913 코멘트)의 가장 단순한 재현. RIFF가 선언한 크기(22바이트,
     * WEBP4+청크헤더8+데이터10)에 실제 파일은 훨씬 못 미친다. */
    private static byte[] truncatedWebpMissingChunkData() throws IOException {
        var out = new ByteArrayOutputStream();
        out.write(new byte[]{'R', 'I', 'F', 'F'});
        writeUInt32LE(out, 22); // 정상 파일이라면 가졌을 크기(거짓 선언 — 실제로는 데이터가 없다)
        out.write(new byte[]{'W', 'E', 'B', 'P'});
        out.write(new byte[]{'V', 'P', '8', ' '});
        writeUInt32LE(out, 10);
        // 청크 데이터 없이 여기서 파일이 끝난다.
        return out.toByteArray();
    }

    /** 파일 길이·RIFF 선언 크기는 정상 WebP와 동일하게 유지한 채 VP8 시작 코드 첫 바이트만
     * 깨서("내용이 조용히 손상된") 길이 기반 검사로는 못 잡는 손상을 재현한다. */
    private static byte[] corruptWebpStartCode(byte[] valid) {
        byte[] corrupted = valid.clone();
        corrupted[23] = 0x00; // 시작 코드 0x9D → 0x00
        return corrupted;
    }

    private static byte[] firstAnimationFrameFromRepositoryAsset() throws IOException {
        byte[] source = repositoryAsset("clients/web/design-system/src/assets/mascot/samhani.webp");
        int anmfOffset = findChunk(source, "ANMF", 12);
        assertThat(anmfOffset).as("마스코트 자산은 실제 애니메이션 ANMF 프레임을 가져야 한다")
                .isGreaterThan(0);
        int anmfSize = (int) readUInt32LE(source, anmfOffset + 4);
        int frameEnd = anmfOffset + 8 + anmfSize + (anmfSize & 1);
        byte[] singleFrame = Arrays.copyOf(source, frameEnd);
        int riffSize = singleFrame.length - 8;
        singleFrame[4] = (byte) riffSize;
        singleFrame[5] = (byte) (riffSize >> 8);
        singleFrame[6] = (byte) (riffSize >> 16);
        singleFrame[7] = (byte) (riffSize >> 24);
        return singleFrame;
    }

    private static byte[] repositoryAsset(String relativePath) throws IOException {
        Path relativeAsset = Path.of(relativePath);
        Path asset = null;
        for (Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath();
                current != null; current = current.getParent()) {
            Path candidate = current.resolve(relativeAsset);
            if (Files.exists(candidate)) {
                asset = candidate;
                break;
            }
        }
        assertThat(asset).as("저장소 실재 이미지 자산 경로를 찾을 수 있어야 한다").isNotNull();
        assertThat(Files.exists(asset)).as("저장소 실재 이미지 자산이 있어야 한다").isTrue();
        return Files.readAllBytes(asset);
    }

    private static int findChunk(byte[] bytes, String fourCc, int start) {
        int offset = start;
        while (offset + 8 <= bytes.length) {
            String current = new String(bytes, offset, 4, StandardCharsets.US_ASCII);
            int chunkSize = (int) readUInt32LE(bytes, offset + 4);
            if (fourCc.equals(current)) return offset;
            offset += 8 + chunkSize + (chunkSize & 1);
        }
        return -1;
    }

    private static long readUInt32LE(byte[] bytes, int offset) {
        return (bytes[offset] & 0xFFL)
                | ((bytes[offset + 1] & 0xFFL) << 8)
                | ((bytes[offset + 2] & 0xFFL) << 16)
                | ((bytes[offset + 3] & 0xFFL) << 24);
    }

    private static byte[] buildWebp(String fourCc, byte[] chunkData) throws IOException {
        var out = new ByteArrayOutputStream();
        int riffSize = 4 /* "WEBP" */ + 8 /* 청크 헤더 */ + chunkData.length + (chunkData.length & 1);
        out.write(new byte[]{'R', 'I', 'F', 'F'});
        writeUInt32LE(out, riffSize);
        out.write(new byte[]{'W', 'E', 'B', 'P'});
        writeWebpChunk(out, fourCc, chunkData);
        return out.toByteArray();
    }

    private static void writeWebpChunk(ByteArrayOutputStream out, String fourCc, byte[] chunkData) throws IOException {
        out.write(fourCc.getBytes(StandardCharsets.US_ASCII));
        writeUInt32LE(out, chunkData.length);
        out.write(chunkData);
        if ((chunkData.length & 1) != 0) out.write(0);
    }

    private static void writeUInt32LE(ByteArrayOutputStream out, int value) {
        out.write(value & 0xFF);
        out.write((value >> 8) & 0xFF);
        out.write((value >> 16) & 0xFF);
        out.write((value >> 24) & 0xFF);
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
