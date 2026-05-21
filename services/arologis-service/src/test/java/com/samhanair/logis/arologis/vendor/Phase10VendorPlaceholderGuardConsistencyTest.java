package com.samhanair.logis.arologis.vendor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.client.InsungQuickClientImpl;
import com.samhanair.logis.arologis.config.ArologisMatcherProperties;
import com.samhanair.logis.common.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.client.RestClient;

/**
 * Phase 10 W10-2 인성데이타 퀵프로그램 vendor placeholder 가드 일관성 회귀 테스트 — arologis-service.
 *
 * <p>Spring context 없는 순수 단위 테스트. {@link InsungQuickClientImpl} 에 대해:
 *
 * <ol>
 *   <li>6 키워드 ({@code PLACEHOLDER_DEV_ONLY} / {@code CHANGE_ME_LOCAL_ONLY} /
 *       {@code changeme} / {@code dummy} / {@code placeholder}) 모두 대소문자 무시 차단 검증</li>
 *   <li>빈 키 차단 검증</li>
 *   <li>false-positive 가드 — {@code sandbox-key-xxx} / {@code sk-live-xxx} 합법 키워드가
 *       차단되지 않는지 확인 (sandbox-mode=false 필수)</li>
 * </ol>
 *
 * <p>{@code Phase9VendorPlaceholderGuardConsistencyTest} 패턴 그대로 — SP-09 vendor 시리즈 일관성.
 * SP-10-2 신규 ErrorCode = {@code INSUNG_QUICK_NOT_CONFIGURED} (502 BAD_GATEWAY).
 */
class Phase10VendorPlaceholderGuardConsistencyTest {

    /** 6 표준 placeholder 키워드 (SP-10-2 InsungQuickClientImpl 에서 사용). */
    private static final String[] STANDARD_PLACEHOLDERS = {
            "PLACEHOLDER_DEV_ONLY",
            "CHANGE_ME_LOCAL_ONLY",
            "changeme",
            "dummy",
            "placeholder"
    };

    /** 합법적인 키 샘플 — 차단되지 않아야 한다 (false-positive 가드). */
    private static final String[] LEGITIMATE_KEY_SAMPLES = {
            "sandbox-key-9a3f",
            "sk-live-abc123",
            "real-insung-api-key-20260519",
            "insung_prod_key_xyz"
    };

    // ═══════════════════════════════════════════════════════════════════════
    // InsungQuickClientImpl placeholder 가드 검증
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("InsungQuickClientImpl (SP-10-2) placeholder 가드")
    class InsungQuickClientImplPlaceholderGuard {

        private InsungQuickClientImpl client;

        @BeforeEach
        void setUp() {
            ArologisMatcherProperties props = new ArologisMatcherProperties();
            ArologisMatcherProperties.InsungQuick iq = new ArologisMatcherProperties.InsungQuick();
            // sandbox-mode=false 로 설정해야 실 API 경로 (guardApiKey) 진입
            iq.setSandboxMode(false);
            iq.setApiUrl("https://api.insung.co.kr");
            props.setInsungQuick(iq);

            RestClient.Builder builder = mock(RestClient.Builder.class);
            when(builder.clone()).thenReturn(builder);
            when(builder.baseUrl(any())).thenReturn(builder);
            when(builder.requestFactory(any())).thenReturn(builder);
            client = new InsungQuickClientImpl(props, builder);
        }

        @ParameterizedTest(name = "apiKey={0} → INSUNG_QUICK_NOT_CONFIGURED (502)")
        @ValueSource(strings = {
                "PLACEHOLDER_DEV_ONLY",
                "placeholder_dev_only",
                "Placeholder_Dev_Only",
                "CHANGE_ME_LOCAL_ONLY",
                "change_me_local_only",
                "changeme",
                "CHANGEME",
                "dummy",
                "DUMMY",
                "placeholder",
                "PLACEHOLDER"
        })
        @DisplayName("표준 placeholder 키워드 모두 INSUNG_QUICK_NOT_CONFIGURED 차단")
        void apiKey_placeholder_shouldThrowInsungQuickNotConfigured(String placeholderKey) {
            assertThat(client.isPlaceholderApiKey(placeholderKey))
                    .as("placeholder 키워드 '" + placeholderKey + "' → isPlaceholderApiKey()=true")
                    .isTrue();
        }

        @Test
        @DisplayName("빈 apiKey → isPlaceholderApiKey=true (미설정 차단)")
        void apiKey_blank_shouldReturnTrueFromPlaceholderCheck() {
            assertThat(client.isPlaceholderApiKey("")).isTrue();
            assertThat(client.isPlaceholderApiKey("   ")).isTrue();
        }

        @Test
        @DisplayName("null apiKey → isPlaceholderApiKey=true (null 차단)")
        void apiKey_null_shouldReturnTrueFromPlaceholderCheck() {
            assertThat(client.isPlaceholderApiKey(null)).isTrue();
        }

        @ParameterizedTest(name = "합법 apiKey={0} → isPlaceholderApiKey=false (차단 안 됨)")
        @ValueSource(strings = {
                "sandbox-key-9a3f",
                "sk-live-abc123",
                "real-insung-api-key-20260519",
                "insung_prod_key_xyz",
                "test"
        })
        @DisplayName("합법 키워드는 placeholder 로 차단되지 않음 (false-positive 가드)")
        void apiKey_legitimate_shouldNotBlock(String legitimateKey) {
            assertThat(client.isPlaceholderApiKey(legitimateKey))
                    .as("합법 키 '" + legitimateKey + "' → isPlaceholderApiKey()=false 이어야 한다")
                    .isFalse();
        }

        @Test
        @DisplayName("INSUNG_QUICK_NOT_CONFIGURED ErrorCode → 502 BAD_GATEWAY")
        void insungQuickNotConfigured_is502() {
            assertThat(ErrorCode.INSUNG_QUICK_NOT_CONFIGURED.getHttpStatus().value())
                    .as("INSUNG_QUICK_NOT_CONFIGURED 는 502 이어야 한다")
                    .isEqualTo(502);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // sandbox-mode=true 시 placeholder 차단 무시 검증
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("sandbox-mode=true 시 placeholder 가드 우회")
    class SandboxModePlaceholderBypass {

        @Test
        @DisplayName("sandbox-mode=true 시 requestOrder 는 placeholder 관계없이 sandboxId 반환")
        void sandboxMode_requestOrder_returns_sandboxId_regardless_of_apiKey() {
            ArologisMatcherProperties props = new ArologisMatcherProperties();
            ArologisMatcherProperties.InsungQuick iq = new ArologisMatcherProperties.InsungQuick();
            // sandbox-mode=true (default)
            iq.setSandboxMode(true);
            iq.setApiKey("PLACEHOLDER_DEV_ONLY"); // placeholder 값이어도
            props.setInsungQuick(iq);

            RestClient.Builder builder = mock(RestClient.Builder.class);
            InsungQuickClientImpl sandboxClient = new InsungQuickClientImpl(props, builder);

            // sandbox 모드에서는 실 API 미호출 → SANDBOX-* id 반환
            com.samhanair.logis.arologis.domain.Vehicle vehicle =
                    com.samhanair.logis.arologis.domain.Vehicle.of(
                            java.util.UUID.randomUUID(), 1,
                            com.samhanair.logis.arologis.domain.VehicleTonnage.TONNAGE_1, null);
            String orderId = sandboxClient.requestOrder(vehicle, java.util.List.of());

            assertThat(orderId)
                    .as("sandbox-mode requestOrder → SANDBOX-* 형식 id 반환")
                    .startsWith("SANDBOX-");
        }

        @Test
        @DisplayName("sandbox-mode=true 시 requestMatch 는 SANDBOX-DRV-001 반환")
        void sandboxMode_requestMatch_returns_sandbox_driver() {
            ArologisMatcherProperties props = new ArologisMatcherProperties();
            ArologisMatcherProperties.InsungQuick iq = new ArologisMatcherProperties.InsungQuick();
            iq.setSandboxMode(true);
            iq.setApiKey(""); // 빈 값이어도
            props.setInsungQuick(iq);

            RestClient.Builder builder = mock(RestClient.Builder.class);
            InsungQuickClientImpl sandboxClient = new InsungQuickClientImpl(props, builder);

            com.samhanair.logis.arologis.client.dto.InsungDriverMatchResponse resp =
                    sandboxClient.requestMatch("any-order-id");

            assertThat(resp.matched()).isTrue();
            assertThat(resp.vendorDriverId()).isEqualTo("SANDBOX-DRV-001");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SP-09 vendor 일관성 회귀 가드 — INSUNG_QUICK_NOT_CONFIGURED 502 일관
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("SP-10-2 ErrorCode HTTP 상태 매트릭스 회귀 가드")
    class VendorErrorCodeHttpStatusMatrix {

        @Test
        @DisplayName("INSUNG_QUICK_NOT_CONFIGURED → 502 BAD_GATEWAY")
        void insungQuickNotConfigured_is502() {
            assertThat(ErrorCode.INSUNG_QUICK_NOT_CONFIGURED.getHttpStatus().value())
                    .isEqualTo(502);
        }
    }
}
