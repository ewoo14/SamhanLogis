package com.samhanair.logis.accounting.vendor;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.client.ETaxClientImpl;
import com.samhanair.logis.accounting.client.CodefClientImpl;
import com.samhanair.logis.accounting.client.KftcClientImpl;
import com.samhanair.logis.accounting.config.CodefProperties;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * SP-09-5 Phase 9 vendor placeholder 가드 일관성 회귀 테스트 — accounting-service 담당 2 vendor.
 *
 * <p>Spring context 없는 순수 단위 테스트. {@link ETaxClientImpl} (SP-09-1 NTS) 와
 * {@link KftcClientImpl} (SP-09-4 KFTC) 두 vendor 에 대해:
 *
 * <ol>
 *   <li>4 키워드 ({@code PLACEHOLDER_DEV_ONLY} / {@code CHANGE_ME_LOCAL_ONLY} /
 *       {@code changeme} / {@code dummy}) 모두 대소문자 무시 차단 검증</li>
 *   <li>빈 키 차단 검증</li>
 *   <li>false-positive 가드 — {@code test}, {@code sandbox} 등 합법 키워드가 차단되지 않는지 확인</li>
 * </ol>
 *
 * <p>ETaxClientImpl 의 {@code isPlaceholderApiKey()} 는 {@code CHANGE_ME_LOCAL_ONLY} 누락 버그를
 * 포함하므로 이 테스트를 통해 회귀를 감지한다.
 *
 * <p>테스트 배치 위치: accounting-service — NTS + KFTC 두 vendor 의 client 가 이 서비스에 위치.
 */
class Phase9VendorPlaceholderGuardConsistencyTest {

    /** 4 표준 placeholder 키워드 (SP-09-2~4 모든 vendor 에서 사용) — JavaDoc 참조용 documentation. */
    @SuppressWarnings("unused")
    private static final String[] STANDARD_PLACEHOLDERS = {
            "PLACEHOLDER_DEV_ONLY",
            "CHANGE_ME_LOCAL_ONLY",
            "changeme",
            "dummy"
    };

    /** 합법적인 키 샘플 — 차단되지 않아야 한다 (false-positive 가드, JavaDoc 참조용). */
    @SuppressWarnings("unused")
    private static final String[] LEGITIMATE_KEY_SAMPLES = {
            "test",
            "sandbox-key-9a3f",
            "real-nts-key-abc123",
            "kftc_prod_1234567890"
    };

    // ═══════════════════════════════════════════════════════════════════════
    // ETaxClientImpl (SP-09-1 NTS e-Tax) 검증
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("ETaxClientImpl (SP-09-1 NTS) placeholder 가드")
    class ETaxClientImplPlaceholderGuard {

        private ETaxClientImpl client;

        @BeforeEach
        void setUp() {
            client = new ETaxClientImpl();
            // 기본값 세팅: NTS 모드로 강제 (placeholder 차단 로직을 실행시키기 위해)
            ReflectionTestUtils.setField(client, "defaultSubmitMethod", "NTS");
            ReflectionTestUtils.setField(client, "ntsBaseUrl", "https://dummy.example.com");
        }

        @ParameterizedTest(name = "NTS apiKey={0} → ETAX_SUBMIT_FAILED (502)")
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
        @DisplayName("표준 placeholder 키워드 모두 ETAX_SUBMIT_FAILED 차단")
        void ntsApiKey_placeholder_shouldThrowEtaxSubmitFailed(String placeholder) {
            ReflectionTestUtils.setField(client, "ntsApiKey", placeholder);

            // TaxInvoice stub (submit 메서드에서 null 접근 방지를 위해 최소 mock)
            TaxInvoice stubInvoice = createStubTaxInvoice(false);

            assertThatThrownBy(() -> client.submit(stubInvoice, "NTS"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> {
                        BusinessException be = (BusinessException) ex;
                        assertThat(be.getErrorCode())
                                .as("placeholder 키 → ETAX_SUBMIT_FAILED(502) 이어야 한다")
                                .isEqualTo(ErrorCode.ETAX_SUBMIT_FAILED);
                    });
        }

        @Test
        @DisplayName("빈 NTS apiKey → ETAX_SUBMIT_FAILED (미설정 차단)")
        void ntsApiKey_blank_shouldThrowEtaxSubmitFailed() {
            ReflectionTestUtils.setField(client, "ntsApiKey", "");
            TaxInvoice stubInvoice = createStubTaxInvoice(false);

            assertThatThrownBy(() -> client.submit(stubInvoice, "NTS"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.ETAX_SUBMIT_FAILED));
        }

        @ParameterizedTest(name = "NTS apiKey={0} → 차단되지 않아야 함 (false-positive 가드)")
        @ValueSource(strings = {"test", "sandbox-key-9a3f", "real-nts-key-abc123"})
        @DisplayName("합법 키워드는 placeholder 로 차단되지 않음 (false-positive 가드)")
        void ntsApiKey_legitimate_shouldNotBlockOnPlaceholderGuard(String legitimateKey) {
            ReflectionTestUtils.setField(client, "ntsApiKey", legitimateKey);
            // 미구현 경로까지 진행 → invoice.getTaxInvoiceNo() log.warn 호출 → mock 필요
            TaxInvoice stubInvoice = createStubTaxInvoice(true);

            // NTS 실 API 미구현 → ETAX_SUBMIT_FAILED 로 떨어지지만 "API 미구현" 메시지여야 함.
            // placeholder 차단 메시지("placeholder 입니다")가 아님을 검증.
            assertThatThrownBy(() -> client.submit(stubInvoice, "NTS"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> {
                        BusinessException be = (BusinessException) ex;
                        assertThat(be.getErrorCode()).isEqualTo(ErrorCode.ETAX_SUBMIT_FAILED);
                        assertThat(be.getMessage())
                                .as("합법 키는 placeholder 차단 메시지가 아닌 미구현 메시지여야 한다")
                                .doesNotContain("placeholder");
                    });
        }

        /**
         * ETaxClientImpl CHANGE_ME_LOCAL_ONLY 차단 검증 (SP-09-5 cycle 1 fix 후 GREEN).
         *
         * <p>SP-09-5 회귀 가드 발견 → ETaxClientImpl.isPlaceholderApiKey() 에 CHANGE_ME_LOCAL_ONLY 추가됨.
         * 4 vendor (NTS/Aligo/Clova/KFTC) 모두 동일 4 키워드 정책 일관 확인.
         */
        @Test
        @DisplayName("[회귀 가드] ETaxClientImpl CHANGE_ME_LOCAL_ONLY 차단 — 4 vendor 일관성")
        void ntsApiKey_changeMeLocalOnly_regressionGuard() {
            ReflectionTestUtils.setField(client, "ntsApiKey", "CHANGE_ME_LOCAL_ONLY");
            TaxInvoice stubInvoice = createStubTaxInvoice(true);

            assertThatThrownBy(() -> client.submit(stubInvoice, "NTS"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> {
                        BusinessException be = (BusinessException) ex;
                        assertThat(be.getErrorCode()).isEqualTo(ErrorCode.ETAX_SUBMIT_FAILED);
                        assertThat(be.getMessage())
                                .as("SP-09-5 cycle 1 fix 후 CHANGE_ME_LOCAL_ONLY 는 placeholder 차단 메시지 반환")
                                .contains("placeholder");
                    });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // KftcClientImpl (SP-09-4 KFTC 오픈뱅킹) 검증
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("KftcClientImpl (SP-09-4 KFTC) placeholder 가드")
    class KftcClientImplPlaceholderGuard {

        private KftcClientImpl client;

        @BeforeEach
        void setUp() {
            client = new KftcClientImpl();
            ReflectionTestUtils.setField(client, "defaultSubmitMethod", "KFTC");
            ReflectionTestUtils.setField(client, "kftcBaseUrl", "https://testapi.openbanking.or.kr");
            // ClientId / Secret 유효 값으로 세팅 (api-key 만 placeholder 테스트)
            ReflectionTestUtils.setField(client, "kftcClientId", "real-client-id");
            ReflectionTestUtils.setField(client, "kftcClientSecret", "real-client-secret");
        }

        @ParameterizedTest(name = "KFTC apiKey={0} → KFTC_SUBMIT_FAILED (502)")
        @ValueSource(strings = {
                "PLACEHOLDER_DEV_ONLY",
                "placeholder_dev_only",
                "CHANGE_ME_LOCAL_ONLY",
                "change_me_local_only",
                "changeme",
                "CHANGEME",
                "dummy",
                "DUMMY"
        })
        @DisplayName("4 표준 placeholder 키워드 모두 KFTC_SUBMIT_FAILED 차단")
        void kftcApiKey_placeholder_shouldThrowKftcSubmitFailed(String placeholder) {
            ReflectionTestUtils.setField(client, "kftcApiKey", placeholder);

            assertThatThrownBy(() -> client.fetchDeposits(
                    LocalDate.of(2026, 5, 1),
                    LocalDate.of(2026, 5, 31),
                    null,
                    "KFTC"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                            .as("placeholder → KFTC_SUBMIT_FAILED(502)")
                            .isEqualTo(ErrorCode.KFTC_SUBMIT_FAILED));
        }

        @Test
        @DisplayName("빈 KFTC apiKey → KFTC_SUBMIT_FAILED (미설정 차단)")
        void kftcApiKey_blank_shouldThrowKftcSubmitFailed() {
            ReflectionTestUtils.setField(client, "kftcApiKey", "");

            assertThatThrownBy(() -> client.fetchDeposits(
                    LocalDate.of(2026, 5, 1),
                    LocalDate.of(2026, 5, 31),
                    null,
                    "KFTC"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.KFTC_SUBMIT_FAILED));
        }

        @ParameterizedTest(name = "KFTC clientId={0} → KFTC_SUBMIT_FAILED (placeholder 차단)")
        @ValueSource(strings = {"PLACEHOLDER_DEV_ONLY", "CHANGE_ME_LOCAL_ONLY", "changeme", "dummy"})
        @DisplayName("KFTC clientId placeholder 도 차단")
        void kftcClientId_placeholder_shouldThrowKftcSubmitFailed(String placeholder) {
            // api-key 는 유효, clientId 만 placeholder
            ReflectionTestUtils.setField(client, "kftcApiKey", "real-api-key-abc123");
            ReflectionTestUtils.setField(client, "kftcClientId", placeholder);

            assertThatThrownBy(() -> client.fetchDeposits(
                    LocalDate.of(2026, 5, 1),
                    LocalDate.of(2026, 5, 31),
                    null,
                    "KFTC"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.KFTC_SUBMIT_FAILED));
        }

        @ParameterizedTest(name = "KFTC clientSecret={0} → KFTC_SUBMIT_FAILED (placeholder 차단)")
        @ValueSource(strings = {"PLACEHOLDER_DEV_ONLY", "CHANGE_ME_LOCAL_ONLY", "changeme", "dummy"})
        @DisplayName("KFTC clientSecret placeholder 도 차단")
        void kftcClientSecret_placeholder_shouldThrowKftcSubmitFailed(String placeholder) {
            ReflectionTestUtils.setField(client, "kftcApiKey", "real-api-key-abc123");
            ReflectionTestUtils.setField(client, "kftcClientId", "real-client-id");
            ReflectionTestUtils.setField(client, "kftcClientSecret", placeholder);

            assertThatThrownBy(() -> client.fetchDeposits(
                    LocalDate.of(2026, 5, 1),
                    LocalDate.of(2026, 5, 31),
                    null,
                    "KFTC"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.KFTC_SUBMIT_FAILED));
        }

        @ParameterizedTest(name = "KFTC apiKey={0} → 차단 안 됨 (false-positive 가드)")
        @ValueSource(strings = {"test", "sandbox-kftc-key", "kftc_prod_1234567890"})
        @DisplayName("합법 키워드 차단 안 됨 (false-positive 가드)")
        void kftcApiKey_legitimate_shouldNotBlockOnPlaceholderGuard(String legitimateKey) {
            ReflectionTestUtils.setField(client, "kftcApiKey", legitimateKey);

            // 3개 키 모두 합법값이어도 실 API 미구현 → KFTC_SUBMIT_FAILED 발생하나
            // placeholder 차단 메시지가 아닌 "미구현" 메시지여야 한다.
            assertThatThrownBy(() -> client.fetchDeposits(
                    LocalDate.of(2026, 5, 1),
                    LocalDate.of(2026, 5, 31),
                    null,
                    "KFTC"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> {
                        BusinessException be = (BusinessException) ex;
                        assertThat(be.getErrorCode()).isEqualTo(ErrorCode.KFTC_SUBMIT_FAILED);
                        assertThat(be.getMessage())
                                .as("합법 키는 placeholder 차단 메시지가 아닌 미구현 메시지여야 한다")
                                .doesNotContain("placeholder");
                    });
        }

        @Test
        @DisplayName("DRY_RUN 모드에서는 키 미설정이어도 정상 반환 (mock 5건)")
        void dryRun_shouldReturnMockRecords_withoutCredentials() {
            // DRY_RUN 모드: 자격증명 검사 없음
            ReflectionTestUtils.setField(client, "kftcApiKey", "");
            ReflectionTestUtils.setField(client, "kftcClientId", "");
            ReflectionTestUtils.setField(client, "kftcClientSecret", "");

            var result = client.fetchDeposits(
                    LocalDate.of(2026, 5, 1),
                    LocalDate.of(2026, 5, 31),
                    null,
                    "DRY_RUN");

            assertThat(result)
                    .as("DRY_RUN 모드는 mock 5건을 반환해야 한다")
                    .hasSize(5);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CodefClientImpl (BC1 CODEF 은행·카드) 검증
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("CodefClientImpl (BC1 CODEF) placeholder 가드")
    class CodefClientImplPlaceholderGuard {

        private CodefClientImpl client;
        private CodefProperties properties;

        @BeforeEach
        void setUp() {
            properties = new CodefProperties();
            ReflectionTestUtils.setField(properties, "submitMethod", "CODEF");
            ReflectionTestUtils.setField(properties, "baseUrl", "https://api.codef.io");
            ReflectionTestUtils.setField(properties, "apiKey", "real-codef-api-key");
            ReflectionTestUtils.setField(properties, "clientId", "real-codef-client-id");
            ReflectionTestUtils.setField(properties, "clientSecret", "real-codef-client-secret");
            client = new CodefClientImpl(properties);
        }

        @ParameterizedTest(name = "CODEF apiKey={0} → CODEF_SUBMIT_FAILED (502)")
        @ValueSource(strings = {
                "PLACEHOLDER_DEV_ONLY",
                "placeholder_dev_only",
                "CHANGE_ME_LOCAL_ONLY",
                "change_me_local_only",
                "changeme",
                "CHANGEME",
                "dummy",
                "DUMMY"
        })
        @DisplayName("4 표준 placeholder 키워드 모두 CODEF_SUBMIT_FAILED 차단")
        void codefApiKey_placeholder_shouldThrowCodefSubmitFailed(String placeholder) {
            ReflectionTestUtils.setField(properties, "apiKey", placeholder);

            assertThatThrownBy(() -> client.fetchBankTransactions(
                    LocalDate.of(2026, 6, 1),
                    LocalDate.of(2026, 6, 3),
                    "국민 123-456",
                    "CODEF"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                            .as("placeholder → CODEF_SUBMIT_FAILED(502)")
                            .isEqualTo(ErrorCode.CODEF_SUBMIT_FAILED));
        }

        @ParameterizedTest(name = "CODEF clientSecret={0} → CODEF_SUBMIT_FAILED (placeholder 차단)")
        @ValueSource(strings = {"PLACEHOLDER_DEV_ONLY", "CHANGE_ME_LOCAL_ONLY", "changeme", "dummy"})
        @DisplayName("CODEF clientSecret placeholder 도 차단")
        void codefClientSecret_placeholder_shouldThrowCodefSubmitFailed(String placeholder) {
            ReflectionTestUtils.setField(properties, "clientSecret", placeholder);

            assertThatThrownBy(() -> client.fetchCardTransactions(
                    LocalDate.of(2026, 6, 1),
                    LocalDate.of(2026, 6, 3),
                    "법인카드-001",
                    "CODEF"))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.CODEF_SUBMIT_FAILED));
        }

        @Test
        @DisplayName("DRY_RUN 모드에서는 키 미설정이어도 은행/카드 mock 5건씩 반환하고 적요에 CODEF 를 노출하지 않는다")
        void dryRun_shouldReturnMockRecords_withoutCredentials() {
            ReflectionTestUtils.setField(properties, "apiKey", "");
            ReflectionTestUtils.setField(properties, "clientId", "");
            ReflectionTestUtils.setField(properties, "clientSecret", "");

            var bank = client.fetchBankTransactions(
                    LocalDate.of(2026, 6, 1),
                    LocalDate.of(2026, 6, 3),
                    "국민 123-456",
                    "DRY_RUN");
            var card = client.fetchCardTransactions(
                    LocalDate.of(2026, 6, 1),
                    LocalDate.of(2026, 6, 3),
                    "법인카드-001",
                    "DRY_RUN");

            assertThat(bank).hasSize(5);
            assertThat(card).hasSize(5);
            assertThat(bank)
                    .extracting(txn -> txn.description())
                    .allSatisfy(description -> assertThat(description).doesNotContain("CODEF"))
                    .contains("운임 입금", "운임 정산");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ErrorCode HTTP 상태 매트릭스 회귀 가드
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("SP-09 vendor ErrorCode HTTP 상태 매트릭스 회귀 가드")
    class VendorErrorCodeHttpStatusMatrix {

        @Test
        @DisplayName("TAX_INVOICE_NOT_EMITTABLE → 422 UNPROCESSABLE_ENTITY")
        void taxInvoiceNotEmittable_is422() {
            assertThat(ErrorCode.TAX_INVOICE_NOT_EMITTABLE.getHttpStatus().value())
                    .as("TAX_INVOICE_NOT_EMITTABLE 는 422 이어야 한다")
                    .isEqualTo(422);
        }

        @Test
        @DisplayName("ETAX_SUBMIT_FAILED → 502 BAD_GATEWAY")
        void etaxSubmitFailed_is502() {
            assertThat(ErrorCode.ETAX_SUBMIT_FAILED.getHttpStatus().value())
                    .as("ETAX_SUBMIT_FAILED 는 502 이어야 한다")
                    .isEqualTo(502);
        }

        @Test
        @DisplayName("OCR_SUBMIT_FAILED → 502 BAD_GATEWAY")
        void ocrSubmitFailed_is502() {
            assertThat(ErrorCode.OCR_SUBMIT_FAILED.getHttpStatus().value())
                    .as("OCR_SUBMIT_FAILED 는 502 이어야 한다")
                    .isEqualTo(502);
        }

        @Test
        @DisplayName("KFTC_SUBMIT_FAILED → 502 BAD_GATEWAY")
        void kftcSubmitFailed_is502() {
            assertThat(ErrorCode.KFTC_SUBMIT_FAILED.getHttpStatus().value())
                    .as("KFTC_SUBMIT_FAILED 는 502 이어야 한다")
                    .isEqualTo(502);
        }

        @Test
        @DisplayName("CODEF_SUBMIT_FAILED → 502 BAD_GATEWAY")
        void codefSubmitFailed_is502() {
            assertThat(ErrorCode.CODEF_SUBMIT_FAILED.getHttpStatus().value())
                    .as("CODEF_SUBMIT_FAILED 는 502 이어야 한다")
                    .isEqualTo(502);
        }

        @Test
        @DisplayName("RECEIPT_FILE_INVALID → 422 UNPROCESSABLE_ENTITY")
        void receiptFileInvalid_is422() {
            assertThat(ErrorCode.RECEIPT_FILE_INVALID.getHttpStatus().value())
                    .as("RECEIPT_FILE_INVALID 는 422 이어야 한다")
                    .isEqualTo(422);
        }

        @Test
        @DisplayName("DEPOSIT_DATE_RANGE_INVALID → 422 UNPROCESSABLE_ENTITY")
        void depositDateRangeInvalid_is422() {
            assertThat(ErrorCode.DEPOSIT_DATE_RANGE_INVALID.getHttpStatus().value())
                    .as("DEPOSIT_DATE_RANGE_INVALID 는 422 이어야 한다")
                    .isEqualTo(422);
        }

        @Test
        @DisplayName("TAX_INVOICE_ALREADY_EMITTED → 409 CONFLICT")
        void taxInvoiceAlreadyEmitted_is409() {
            assertThat(ErrorCode.TAX_INVOICE_ALREADY_EMITTED.getHttpStatus().value())
                    .as("TAX_INVOICE_ALREADY_EMITTED 는 409 이어야 한다")
                    .isEqualTo(409);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REQUIRES_NEW audit recorder 별도 bean 패턴 확인 (구조 검증)
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("REQUIRES_NEW audit recorder 별도 bean 분리 패턴 검증")
    class AuditRecorderSeparateBeanPattern {

        @Test
        @DisplayName("TaxInvoiceEmitAuditRecorder 는 TaxInvoiceEmitService 와 별도 클래스이다")
        void taxInvoiceEmitAuditRecorder_isSeparateBean() {
            // self-invocation 방지: audit recorder 가 service 내부 inner class 가 아님을 확인
            Class<?> auditRecorderClass = com.samhanair.logis.accounting.service.TaxInvoiceEmitAuditRecorder.class;
            Class<?> emitServiceClass = com.samhanair.logis.accounting.service.TaxInvoiceEmitService.class;

            assertThat(auditRecorderClass)
                    .as("TaxInvoiceEmitAuditRecorder 는 TaxInvoiceEmitService 와 다른 클래스이어야 한다")
                    .isNotEqualTo(emitServiceClass);

            assertThat(auditRecorderClass.getDeclaringClass())
                    .as("TaxInvoiceEmitAuditRecorder 는 inner class 가 아니어야 한다 (self-invocation 방지)")
                    .isNull();
        }

        @Test
        @DisplayName("DepositMatchAuditRecorder 는 DepositMatchService 와 별도 클래스이다")
        void depositMatchAuditRecorder_isSeparateBean() {
            Class<?> auditRecorderClass = com.samhanair.logis.accounting.service.DepositMatchAuditRecorder.class;

            assertThat(auditRecorderClass.getDeclaringClass())
                    .as("DepositMatchAuditRecorder 는 inner class 가 아니어야 한다 (self-invocation 방지)")
                    .isNull();
        }

        @Test
        @DisplayName("TaxInvoiceEmitAuditRecorder.recordEmit() 에 @Transactional(REQUIRES_NEW) 어노테이션 확인")
        void taxInvoiceEmitAuditRecorder_hasRequiresNewAnnotation() throws NoSuchMethodException {
            var method = com.samhanair.logis.accounting.service.TaxInvoiceEmitAuditRecorder.class
                    .getMethod("recordEmit",
                            com.samhanair.logis.accounting.domain.TaxInvoice.class,
                            com.samhanair.logis.accounting.client.ETaxSubmitResult.class,
                            java.util.UUID.class);

            org.springframework.transaction.annotation.Transactional txAnnotation =
                    method.getAnnotation(org.springframework.transaction.annotation.Transactional.class);

            assertThat(txAnnotation)
                    .as("recordEmit() 에 @Transactional 어노테이션이 있어야 한다")
                    .isNotNull();
            assertThat(txAnnotation.propagation())
                    .as("recordEmit() 의 전파 속성은 REQUIRES_NEW 이어야 한다")
                    .isEqualTo(org.springframework.transaction.annotation.Propagation.REQUIRES_NEW);
        }

        @Test
        @DisplayName("DepositMatchAuditRecorder.recordFetchAndMatch() 에 @Transactional(REQUIRES_NEW) 어노테이션 확인")
        void depositMatchAuditRecorder_hasRequiresNewAnnotation() throws NoSuchMethodException {
            var method = com.samhanair.logis.accounting.service.DepositMatchAuditRecorder.class
                    .getMethod("recordFetchAndMatch",
                            java.util.UUID.class,
                            String.class,
                            int.class,
                            int.class,
                            int.class);

            org.springframework.transaction.annotation.Transactional txAnnotation =
                    method.getAnnotation(org.springframework.transaction.annotation.Transactional.class);

            assertThat(txAnnotation)
                    .as("recordFetchAndMatch() 에 @Transactional 어노테이션이 있어야 한다")
                    .isNotNull();
            assertThat(txAnnotation.propagation())
                    .as("recordFetchAndMatch() 의 전파 속성은 REQUIRES_NEW 이어야 한다")
                    .isEqualTo(org.springframework.transaction.annotation.Propagation.REQUIRES_NEW);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 헬퍼
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * 테스트용 최소 TaxInvoice stub 생성.
     *
     * <p>ETaxClientImpl.submitNts() placeholder 차단 경로는 invoice 에 접근하기 전에
     * 예외를 던지므로 null 이어도 안전하다.
     * 단, "합법 키" false-positive 테스트에서는 {@code invoice.getTaxInvoiceNo()} 를
     * {@code log.warn} 에서 호출하므로 Mockito mock 으로 NPE 를 방지한다.
     *
     * @param useMock true 이면 Mockito mock, false 이면 null (placeholder 차단 케이스)
     * @return TaxInvoice stub
     */
    private TaxInvoice createStubTaxInvoice(boolean useMock) {
        if (useMock) {
            TaxInvoice mock = Mockito.mock(TaxInvoice.class);
            Mockito.when(mock.getTaxInvoiceNo()).thenReturn("2026/05/18-1");
            return mock;
        }
        // placeholder 차단 경로: invoice 접근 전에 예외를 던지므로 null 안전.
        return null;
    }
}
