package com.samhanair.logis.groupware.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.domain.DocumentPayload;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;
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
    /** H15(PM 2차 지적 반영): 픽셀 "개수"만으로 예산을 잡으면 색상 유형에 따라 실제 위험이 최대
     * 8배(16bit RGBA 8B/px) 벌어진다 — 7999×7999(구 예산 바로 아래, 63,984,001px) RGBA 는 픽셀 수
     * 기준으로는 통과하지만 실제로는 4B/px × 픽셀수 ≈ 244MiB 를 할당해(실측 컨테이너 +245MiB) 여전히
     * 자원을 과소비했다. 그래서 예산을 "디코드 목적지 버퍼 바이트 수"로 직접 잡는다 —
     * {@code ImageReader#getRawImageType()} 이 보고하는 실제 픽셀당 비트 수(PNG는 IHDR bitDepth×
     * colorType 채널 수, JPEG는 SOF 컴포넌트 수 기반, 인터레이스/진행형과 무관하게 항상 헤더 전용
     * 파싱)로 실제 목적지 크기를 미리 정확히 예측한다(실측: 7999×7999 RGBA 예측 244MB vs 실제 246MB —
     * 오차 1% 이내). 64MiB(=67,108,864B)는 구 픽셀 예산(64,000,000px)을 "가장 저렴한 색상 유형
     * (Gray/팔레트 1B/px)" 기준으로 그대로 계승해 그쪽은 여전히 관대하게 통과시키면서, RGBA(4B/px)는
     * 자동으로 4배 더 엄격해져(≈16.7M px 상한) 문제의 7999×7999 RGBA(~244MB, 3.6배 초과)를 명확히
     * 차단한다. A4 300dpi 전면(2480×3508=870만px) 8bit RGBA(~33.2MB)는 여유 있게 통과한다. */
    private static final long MAX_DECODED_IMAGE_BYTES = 64L * 1024 * 1024;
    /** rawType 을 판별할 수 없을 때 쓰는 보수적 배수(bytes/pixel) — 실측(H15c 회귀)상 관찰된
     * 최악값은 16bit RGBA 의 8B/px 이므로, 판별 불가 입력도 그 이상으로 가정해 과소평가를 막는다. */
    private static final int WORST_CASE_BYTES_PER_PIXEL_FALLBACK = 8;

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
            if (element.has("binding")) {
                reject("IMAGE 요소 src가 허용 정책을 만족하지 않습니다");
            }
            if (!validImageSource(element.get("src"))) {
                reject("IMAGE 요소 src는 허용된 PNG/JPEG/WebP data URL 또는 기본 로고여야 하며, 크기·구조 제한을 만족해야 합니다.");
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
            if (decoded.length == 0 || decoded.length > MAX_IMAGE_BYTES
                    || !hasImageSignature(matcher.group(1), decoded)) {
                return false;
            }
            // ImageIO는 PNG/JPEG의 파일 구조를 검사하지만, 이 결과가 실제 browser renderer의
            // 판정과 같다고 보장하지 않는다. 표준 JDK에는 WebP reader가 없으므로 WebP는 컨테이너
            // 구조만 검사한다. 최종 renderer 디코드 계약은 FE의 <img>.decode()가 담당한다.
            if ("webp".equals(matcher.group(1))) {
                return isStructurallyValidWebp(decoded);
            }
            // 🔴 I-3(#968 R1 실측): PNG는 이미 진짜 디코더(ImageIO.read())를 돌리는데도 렌더 엔진과
            // 어긋난다 — 저장소 pwa-192.png(2,743B)를 51%(1,409B)에서 자른 "다운로드 중단" 재현과
            // IDAT 페이로드만 손상시킨(CRC 재계산) 재현 둘 다, Chromium <img>는 192x192로 정상
            // load하지만 ImageIO.read()는 IIOException("Error reading PNG image data")을 던진다.
            // 완전한 픽셀 디코드 성공을 요구하면 C1(FE <img>.decode())이 통과시킨 이미지를 BE가
            // 거부해 저장을 막는다(I-3 위반). WebP와 동일한 계약으로 통일한다 — BE는 구조(IHDR
            // 파싱 가능 여부)와 자원예산만 확인하고, 최종 디코드 판정은 FE에 맡긴다(C2). IHDR 자체가
            // 손상되어 치수를 판독할 수 없는 입력은 checkImageDecodedByteBudget()의 header 파싱
            // 단계에서 여전히 거부된다("I/O error reading PNG header!" — IDAT 단계 실패와는 다른
            // 예외로, jshell 실측상 명확히 구분된다).
            if ("png".equals(matcher.group(1))) {
                return checkImageDecodedByteBudget(decoded);
            }
            // H15: ImageIO.read()는 PNG/JPEG 모두 IHDR/SOF에 선언된 가로×세로 치수(+색상 정보)만으로
            // 목적지 픽셀 버퍼를 "먼저" 할당하고, 그 다음에야 IDAT/scan 데이터를 실제로 읽는다 — IDAT이
            // 비었거나 부족해도 할당은 이미 끝난 뒤다. 57바이트짜리 "선언 치수만 거대한" 입력이 요청
            // 1건당 수백 MB를 할당해 컨테이너 실힙(prod 718MiB, MaxRAMPercentage=70.0 + mem_limit:1g)을
            // 고갈시킬 수 있다. 서명 검사는 앞 8바이트만 보므로 이 공격을 걸러내지 못한다.
            //
            // 🔴 PM 2차 지적(경계 실측): 가로×세로 "픽셀 개수"만으로 예산을 잡으면 색상 유형에 따라
            // 실제 위험이 최대 8배(16bit RGBA=8B/px vs 8bit Gray=1B/px) 벌어진다 — 예산 바로 아래
            // 픽셀 수의 RGBA 이미지(7999×7999=63,984,001px)가 여전히 실제로는 ~244MiB 를 할당했다
            // (실측: 컨테이너 메모리 376.1→621.6MiB). checkImageDecodedByteBudget()은 픽셀 개수가
            // 아니라 실제 디코드 목적지 "바이트 수"를 예산으로 삼는다. JPEG는 I-3 불일치가 실측되지
            // 않아(#968 R1 — 60% 절단 JPEG도 이미 ACCEPTED) 완전 디코드 요구를 그대로 유지한다.
            if (!checkImageDecodedByteBudget(decoded)) return false;
            return ImageIO.read(new ByteArrayInputStream(decoded)) != null;
        } catch (IllegalArgumentException | IOException ex) {
            return false;
        }
    }

    /**
     * 실제 픽셀 디코드(ImageIO.read, 목적지 버퍼 할당 포함) 전에, 그 할당이 실제로 몇 바이트가 될지
     * 헤더만으로 미리 예측해 예산을 넘으면 거부한다(H15). {@code ImageReader#getRawImageType}은
     * ImageIO 표준 계약상 헤더 메타데이터만으로 픽셀 형식(픽셀당 비트 수)을 판별하며 픽셀 버퍼를
     * 할당하지 않는다 — PNG는 IHDR의 bitDepth×colorType 채널 수, JPEG는 SOF 컴포넌트 수 기반이라
     * 인터레이스/진행형(progressive)/CMYK 여부와 무관하게 항상 헤더 전용이다(실측: 16bit RGBA
     * 64bpp·8bit RGBA 32bpp·8bit Gray/팔레트 8bpp 전부 실제 디코드 버퍼 크기와 1% 이내로 일치).
     *
     * <p>예산을 넘으면 {@link BusinessException}을 직접 던져 구조 검사 실패와 구분되는
     * 원인(해상도 초과)을 구체적으로 안내한다(H15-b).
     *
     * <p>reader를 찾지 못하거나 치수를 읽을 수 없는 경우 {@code false}를 반환한다. PNG 호출자(I-3,
     * #968 R1)는 이 메서드의 반환값을 그대로 최종 구조 판정으로 쓰므로(뒤이은 전체 픽셀 디코드를
     * 더 이상 요구하지 않는다), 여기서 판별 불가를 그냥 통과시키면 그 판정이 최종이 되어 버린다 —
     * 그래서 이제 명시적으로 {@code false}를 반환한다(과거에는 뒤이은 {@code ImageIO.read()}가
     * 결국 null을 반환하거나 예외를 던져 구조 검사 실패 문구로 거부되는 것에 기대어 조용히
     * 통과시켰다). JPEG 호출자는 이 메서드가 {@code false}면 즉시 거부하고, {@code true}면 여전히
     * {@code ImageIO.read()} 전체 디코드를 추가로 요구한다(동작 변화 없음 — 판별 불가 시 원래도
     * 뒤이은 read()가 결국 거부했다). {@code getRawImageType()}이 픽셀 형식을 특정하지 못해
     * {@code null}을 반환하는 경우는 "판단 보류"로 비싼 read()를 그냥 허용하지 않는다 — 폭 계산
     * 이전에 이 판별 불가 자체가 이미 위험 신호이므로 보수적 최악값
     * ({@link #WORST_CASE_BYTES_PER_PIXEL_FALLBACK})으로 예산을 강제한다(과소평가로 인한 우회를 막는다).
     *
     * @return IHDR/SOF 헤더가 파싱 가능하고 예측 디코드 바이트 수가 예산 이내이면 {@code true}
     */
    private static boolean checkImageDecodedByteBudget(byte[] decoded) throws IOException {
        try (var inputStream = ImageIO.createImageInputStream(new ByteArrayInputStream(decoded))) {
            if (inputStream == null) return false;
            var readers = ImageIO.getImageReaders(inputStream);
            if (!readers.hasNext()) return false;
            var reader = readers.next();
            try {
                // seekForwardOnly=true, ignoreMetadata=true — EXIF/ICC 등 부가 메타데이터 파싱까지
                // 건너뛰어 헤더 피크 자체도 최소 비용으로 유지한다.
                reader.setInput(inputStream, true, true);
                long width = reader.getWidth(0);
                long height = reader.getHeight(0);
                if (width <= 0 || height <= 0) return false;

                int bytesPerPixel;
                var rawType = reader.getRawImageType(0);
                if (rawType != null) {
                    // getPixelSize()는 비트 단위 — 바이트로 올림 변환(예: 24bpp RGB -> 3B, 1bpp -> 1B).
                    bytesPerPixel = (rawType.getColorModel().getPixelSize() + 7) / 8;
                } else {
                    bytesPerPixel = WORST_CASE_BYTES_PER_PIXEL_FALLBACK;
                }

                long predictedBytes = width * height * bytesPerPixel;
                if (predictedBytes > MAX_DECODED_IMAGE_BYTES) {
                    reject("IMAGE 요소 이미지가 너무 커서 처리할 수 없습니다(가로×세로 픽셀 수와 색상 "
                            + "정보 기준 상한 초과). 해상도를 줄이거나 이미지를 단순화해 다시 시도하세요.");
                }
                return true;
            } finally {
                reader.dispose();
            }
        }
    }

    private static boolean hasImageSignature(String mime, byte[] bytes) {
        if ("png".equals(mime)) {
            return bytes.length >= 8
                    && (bytes[0] & 0xFF) == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E
                    && bytes[3] == 0x47 && bytes[4] == 0x0D && bytes[5] == 0x0A
                    && bytes[6] == 0x1A && bytes[7] == 0x0A;
        }
        if ("jpeg".equals(mime)) {
            return bytes.length >= 3 && (bytes[0] & 0xFF) == 0xFF
                    && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF;
        }
        return "webp".equals(mime) && bytes.length >= 12
                && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P';
    }

    /**
     * R1-4/R3: WebP는 표준 JDK ImageIO reader가 없어 실제 픽셀 디코드로 무결성을 검증할 수
     * 없다. 따라서 RIFF 전체 청크를 끝까지 순회하고, 실제 이미지 서브청크가 하나 이상 있는지
     * 확인하는 보수적 구조 검사를 수행한다. VP8L의 5바이트 헤더는 Chromium <img>가 4x4로
     * 로드하는 실측이 있으므로 허용하고, VP8X 확장 헤더만 있는 입력은 저장 전에 거부한다. 애니메이션 WebP의 ANMF 프레임은 16바이트
     * 프레임 헤더 뒤에 VP8/VP8L 이미지 청크를 중첩하므로 그 내부도 같은 방식으로 검사한다.
     */
    private static boolean isStructurallyValidWebp(byte[] decoded) {
        if (decoded.length < 20) return false; // RIFF 헤더(12) + 첫 서브청크 헤더(8)
        long riffDeclaredSize = readUInt32LE(decoded, 4);
        if (riffDeclaredSize != decoded.length - 8L) return false; // 잘림/덧붙음 검출
        int offset = 12;
        boolean hasImageChunk = false;
        boolean hasExtendedHeader = false;
        while (offset < decoded.length) {
            if (decoded.length - offset < 8) return false;
            String fourCc = new String(decoded, offset, 4, StandardCharsets.US_ASCII);
            long chunkSize = readUInt32LE(decoded, offset + 4);
            long paddedChunkSize = chunkSize + (chunkSize & 1L);
            if (chunkSize > decoded.length - offset - 8L
                    || paddedChunkSize > decoded.length - offset - 8L) {
                return false;
            }
            int dataOffset = offset + 8;
            if ("VP8X".equals(fourCc)) {
                if (chunkSize != 10) return false;
                hasExtendedHeader = true;
            } else if ("VP8 ".equals(fourCc)) {
                if (!isStructurallyValidVp8(decoded, dataOffset, chunkSize)) return false;
                hasImageChunk = true;
            } else if ("VP8L".equals(fourCc)) {
                if (!isStructurallyValidVp8l(decoded, dataOffset, chunkSize)) return false;
                hasImageChunk = true;
            } else if ("ANMF".equals(fourCc)) {
                if (!isStructurallyValidAnmf(decoded, dataOffset, chunkSize)) return false;
                hasImageChunk = true;
            }
            offset += 8 + (int) paddedChunkSize;
        }
        // VP8X는 컨테이너 헤더만으로는 이미지가 아니다. VP8/VP8L 서브청크가 있어야 한다.
        return offset == decoded.length && hasImageChunk && (hasExtendedHeader || decoded[12] != 'V'
                || decoded[13] != 'P' || decoded[14] != '8' || decoded[15] != 'X');
    }

    private static boolean isStructurallyValidAnmf(byte[] bytes, int dataOffset, long chunkSize) {
        // ANMF 고정 프레임 헤더(좌표·크기·duration·blend/dispose) 뒤에 nested chunk가 온다.
        if (chunkSize < 16) return false;
        int frameEnd = dataOffset + (int) chunkSize;
        int offset = dataOffset + 16;
        boolean hasImageChunk = false;
        while (offset < frameEnd) {
            if (frameEnd - offset < 8) return false;
            String fourCc = new String(bytes, offset, 4, StandardCharsets.US_ASCII);
            long nestedChunkSize = readUInt32LE(bytes, offset + 4);
            long paddedChunkSize = nestedChunkSize + (nestedChunkSize & 1L);
            if (nestedChunkSize > frameEnd - offset - 8L
                    || paddedChunkSize > frameEnd - offset - 8L) {
                return false;
            }
            int nestedDataOffset = offset + 8;
            if ("VP8 ".equals(fourCc)) {
                if (!isStructurallyValidVp8(bytes, nestedDataOffset, nestedChunkSize)) return false;
                hasImageChunk = true;
            } else if ("VP8L".equals(fourCc)) {
                if (!isStructurallyValidVp8l(bytes, nestedDataOffset, nestedChunkSize)) return false;
                hasImageChunk = true;
            }
            offset += 8 + (int) paddedChunkSize;
        }
        return offset == frameEnd && hasImageChunk;
    }

    private static boolean isStructurallyValidVp8(byte[] bytes, int dataOffset, long chunkSize) {
        return chunkSize >= 10
                && (bytes[dataOffset + 3] & 0xFF) == 0x9D
                && (bytes[dataOffset + 4] & 0xFF) == 0x01
                && (bytes[dataOffset + 5] & 0xFF) == 0x2A;
    }

    private static boolean isStructurallyValidVp8l(byte[] bytes, int dataOffset, long chunkSize) {
        // Chromium <img>는 0x2F + 4바이트 packed canvas만 있는 5바이트 VP8L도 4x4로
        // 로드한다. BE 구조 검사가 이 정상 렌더 입력을 거부하면 I-3을 깨므로 payload 길이를
        // 열거해 추가 방어하지 않는다.
        return chunkSize >= 5 && (bytes[dataOffset] & 0xFF) == 0x2F;
    }

    private static long readUInt32LE(byte[] bytes, int offset) {
        return (bytes[offset] & 0xFFL)
                | ((bytes[offset + 1] & 0xFFL) << 8)
                | ((bytes[offset + 2] & 0xFFL) << 16)
                | ((bytes[offset + 3] & 0xFFL) << 24);
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
