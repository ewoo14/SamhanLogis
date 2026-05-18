package com.samhanair.logis.slip.vendor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.ReceiptOcrClientImpl;
import com.samhanair.logis.slip.service.ReceiptOcrAuditRecorder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * SP-09-5 Phase 9 vendor placeholder 가드 일관성 회귀 테스트 — slip-service Naver Clova OCR.
 *
 * <p>Spring context 없는 순수 단위 테스트. {@link ReceiptOcrClientImpl} (SP-09-3 Clova OCR) 에 대해:
 *
 * <ol>
 *   <li>4 키워드 ({@code PLACEHOLDER_DEV_ONLY} / {@code CHANGE_ME_LOCAL_ONLY} /
 *       {@code changeme} / {@code dummy}) 모두 대소문자 무시 차단 검증 (OCR_SUBMIT_FAILED)</li>
 *   <li>빈 키 차단 검증</li>
 *   <li>false-positive 가드 — 합법 키워드가 차단되지 않는지 확인</li>
 *   <li>REQUIRES_NEW audit 패턴 — {@link ReceiptOcrAuditRecorder} 구조 검증</li>
 * </ol>
 */
class Phase9OcrPlaceholderGuardConsistencyTest {

    /** 4 표준 placeholder 키워드 (SP-09 vendor 통일 기준). */
    private static final String[] STANDARD_PLACEHOLDERS = {
            "PLACEHOLDER_DEV_ONLY",
            "CHANGE_ME_LOCAL_ONLY",
            "changeme",
            "dummy"
    };

    private static final byte[] DUMMY_IMAGE = "fake-image-bytes".getBytes();
    private static final String DUMMY_FILENAME = "receipt.jpg";

    // ═══════════════════════════════════════════════════════════════════════
    // ReceiptOcrClientImpl (SP-09-3 Clova OCR) placeholder 가드
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("ReceiptOcrClientImpl (SP-09-3 Clova OCR) placeholder 가드")
    class ReceiptOcrClientImplPlaceholderGuard {

        private ReceiptOcrClientImpl client;

        @BeforeEach
        void setUp() {
            client = new ReceiptOcrClientImpl();
            // CLOVA 모드로 강제 — placeholder 차단 로직 실행
            ReflectionTestUtils.setField(client, "defaultSubmitMethod", "CLOVA");
            // invoke url 유효 값 세팅 (api-key 만 placeholder 테스트 케이스용)
            ReflectionTestUtils.setField(client, "clovaInvokeUrl",
                    "https://clova.apigw.ntruss.com/custom/v1/fake");
        }

        @ParameterizedTest(name = "Clova apiKey={0} → OCR_SUBMIT_FAILED (502)")
        @ValueSource(strings = {
                "PLACEHOLDER_DEV_ONLY",
                "placeholder_dev_only",
                "Placeholder_Dev_Only",
                "CHANGE_ME_LOCAL_ONLY",
                "change_me_local_only",
                "changeme",
                "CHANGEME",
                "dummy",
                "DUMMY"
        })
        @DisplayName("clovaApiKey 4 표준 placeholder 모두 OCR_SUBMIT_FAILED 차단")
        void clovaApiKey_placeholder_shouldThrowOcrSubmitFailed(String placeholder) {
            ReflectionTestUtils.setField(client, "clovaApiKey", placeholder);
            ReflectionTestUtils.setField(client, "clovaSecretKey", "real-secret-key-abc");

            assertThatThrownBy(() -> client.submit(DUMMY_IMAGE, DUMMY_FILENAME, "CLOVA"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                            .as("placeholder apiKey → OCR_SUBMIT_FAILED(502)")
                            .isEqualTo(ErrorCode.OCR_SUBMIT_FAILED));
        }

        @ParameterizedTest(name = "Clova secretKey={0} → OCR_SUBMIT_FAILED (502)")
        @ValueSource(strings = {
                "PLACEHOLDER_DEV_ONLY",
                "CHANGE_ME_LOCAL_ONLY",
                "changeme",
                "dummy"
        })
        @DisplayName("clovaSecretKey placeholder 도 OCR_SUBMIT_FAILED 차단")
        void clovaSecretKey_placeholder_shouldThrowOcrSubmitFailed(String placeholder) {
            ReflectionTestUtils.setField(client, "clovaApiKey", "real-api-key-xyz");
            ReflectionTestUtils.setField(client, "clovaSecretKey", placeholder);

            assertThatThrownBy(() -> client.submit(DUMMY_IMAGE, DUMMY_FILENAME, "CLOVA"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.OCR_SUBMIT_FAILED));
        }

        @ParameterizedTest(name = "Clova invokeUrl={0} → OCR_SUBMIT_FAILED (502)")
        @ValueSource(strings = {
                "PLACEHOLDER_DEV_ONLY",
                "CHANGE_ME_LOCAL_ONLY",
                "changeme",
                "dummy"
        })
        @DisplayName("clovaInvokeUrl placeholder 도 OCR_SUBMIT_FAILED 차단")
        void clovaInvokeUrl_placeholder_shouldThrowOcrSubmitFailed(String placeholder) {
            ReflectionTestUtils.setField(client, "clovaApiKey", "real-api-key-xyz");
            ReflectionTestUtils.setField(client, "clovaSecretKey", "real-secret-key-abc");
            ReflectionTestUtils.setField(client, "clovaInvokeUrl", placeholder);

            assertThatThrownBy(() -> client.submit(DUMMY_IMAGE, DUMMY_FILENAME, "CLOVA"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.OCR_SUBMIT_FAILED));
        }

        @Test
        @DisplayName("빈 clovaApiKey → OCR_SUBMIT_FAILED (미설정 차단)")
        void clovaApiKey_blank_shouldThrowOcrSubmitFailed() {
            ReflectionTestUtils.setField(client, "clovaApiKey", "");
            ReflectionTestUtils.setField(client, "clovaSecretKey", "real-secret");

            assertThatThrownBy(() -> client.submit(DUMMY_IMAGE, DUMMY_FILENAME, "CLOVA"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.OCR_SUBMIT_FAILED));
        }

        @ParameterizedTest(name = "Clova apiKey={0} → 차단 안 됨 (false-positive 가드)")
        @ValueSource(strings = {
                "test",
                "clova-sandbox-key-9a3f",
                "real-clova-key-production"
        })
        @DisplayName("합법 키워드는 placeholder 로 차단되지 않음 (false-positive 가드)")
        void clovaApiKey_legitimate_shouldNotBlockOnPlaceholderGuard(String legitimateKey) {
            ReflectionTestUtils.setField(client, "clovaApiKey", legitimateKey);
            ReflectionTestUtils.setField(client, "clovaSecretKey", "real-secret-key-abc");

            // 합법 키 → 미구현 예외 (placeholder 차단 아님)
            assertThatThrownBy(() -> client.submit(DUMMY_IMAGE, DUMMY_FILENAME, "CLOVA"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> {
                        BusinessException be = (BusinessException) ex;
                        assertThat(be.getErrorCode()).isEqualTo(ErrorCode.OCR_SUBMIT_FAILED);
                        assertThat(be.getMessage())
                                .as("합법 키는 placeholder 차단 메시지가 아닌 미구현 메시지여야 한다")
                                .doesNotContain("placeholder");
                    });
        }

        @Test
        @DisplayName("DRY_RUN 모드는 자격증명 없이 즉시 mock 성공 반환")
        void dryRun_shouldReturnMockSuccessWithoutCredentials() {
            ReflectionTestUtils.setField(client, "clovaApiKey", "");
            ReflectionTestUtils.setField(client, "clovaSecretKey", "");
            ReflectionTestUtils.setField(client, "clovaInvokeUrl", "");

            var result = client.submit(DUMMY_IMAGE, DUMMY_FILENAME, "DRY_RUN");

            assertThat(result).isNotNull();
            assertThat(result.success())
                    .as("DRY_RUN 모드는 항상 success=true 를 반환해야 한다")
                    .isTrue();
            assertThat(result.vendorName())
                    .as("DRY_RUN mock 가게명은 '테스트마트' 이어야 한다")
                    .isEqualTo("테스트마트");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ReceiptOcrAuditRecorder REQUIRES_NEW 패턴 검증
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("ReceiptOcrAuditRecorder REQUIRES_NEW 패턴 (SP-09-3)")
    class ReceiptOcrAuditRecorderPattern {

        @Test
        @DisplayName("ReceiptOcrAuditRecorder 는 ReceiptOcrParseService 와 별도 클래스이다")
        void receiptOcrAuditRecorder_isSeparateBean() {
            Class<?> auditRecorderClass = ReceiptOcrAuditRecorder.class;
            Class<?> parseServiceClass = com.samhanair.logis.slip.service.ReceiptOcrParseService.class;

            assertThat(auditRecorderClass)
                    .as("ReceiptOcrAuditRecorder 는 ReceiptOcrParseService 와 다른 클래스이어야 한다")
                    .isNotEqualTo(parseServiceClass);

            assertThat(auditRecorderClass.getDeclaringClass())
                    .as("ReceiptOcrAuditRecorder 는 inner class 가 아니어야 한다 (self-invocation 방지)")
                    .isNull();
        }

        @Test
        @DisplayName("ReceiptOcrAuditRecorder.record() 에 @Transactional(REQUIRES_NEW) 어노테이션 확인")
        void receiptOcrAuditRecorder_hasRequiresNewAnnotation() throws NoSuchMethodException {
            var method = ReceiptOcrAuditRecorder.class
                    .getMethod("record",
                            java.util.UUID.class,
                            String.class,
                            String.class,
                            java.util.UUID.class,
                            String.class);

            Transactional txAnnotation = method.getAnnotation(Transactional.class);

            assertThat(txAnnotation)
                    .as("record() 에 @Transactional 어노테이션이 있어야 한다")
                    .isNotNull();
            assertThat(txAnnotation.propagation())
                    .as("record() 의 전파 속성은 REQUIRES_NEW 이어야 한다")
                    .isEqualTo(Propagation.REQUIRES_NEW);
        }

        @Test
        @DisplayName("ReceiptOcrAuditRecorder.FIELD_OCR_DRAFT 상수 = 'ocr-draft'")
        void receiptOcrAuditRecorder_fieldConstant() {
            assertThat(ReceiptOcrAuditRecorder.FIELD_OCR_DRAFT)
                    .as("FIELD_OCR_DRAFT 상수는 'ocr-draft' 이어야 한다")
                    .isEqualTo("ocr-draft");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ReceiptOcrResult 구조 검증 — DRY_RUN mock 값 일관성
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("ReceiptOcrResult DRY_RUN stub 값 일관성")
    class ReceiptOcrResultDryRunConsistency {

        private ReceiptOcrClientImpl client;

        @BeforeEach
        void setUp() {
            client = new ReceiptOcrClientImpl();
            ReflectionTestUtils.setField(client, "defaultSubmitMethod", "DRY_RUN");
        }

        @Test
        @DisplayName("DRY_RUN stub — vendorName=테스트마트, totalAmount=12345, vatAmount=1234")
        void dryRun_stubValues_areConsistent() {
            var result = client.submit(DUMMY_IMAGE, DUMMY_FILENAME, "DRY_RUN");

            assertThat(result.vendorName()).isEqualTo("테스트마트");
            assertThat(result.totalAmount()).isEqualByComparingTo("12345");
            assertThat(result.vatAmount()).isEqualByComparingTo("1234");
            assertThat(result.issuedAt()).isNotNull();
        }
    }
}
