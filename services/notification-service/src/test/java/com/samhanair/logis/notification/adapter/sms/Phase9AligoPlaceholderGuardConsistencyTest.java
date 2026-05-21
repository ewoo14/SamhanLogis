package com.samhanair.logis.notification.adapter.sms;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.notification.config.AligoProperties;
import com.samhanair.logis.notification.service.DispatchSmsSaveHistoryService;
import java.util.Arrays;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mockito;
import org.springframework.web.client.RestClient;

/**
 * SP-09-5 Phase 9 vendor placeholder 가드 일관성 회귀 테스트 — notification-service Aligo SMS.
 *
 * <p>Spring context 없는 순수 단위 테스트. 검증 범위:
 *
 * <ol>
 *   <li>4 키워드 ({@code PLACEHOLDER_DEV_ONLY} / {@code CHANGE_ME_LOCAL_ONLY} /
 *       {@code changeme} / {@code dummy}) 모두 대소문자 무시 차단 — {@code isPlaceholder()} 직접 호출</li>
 *   <li>null / blank 도 placeholder 판정</li>
 *   <li>false-positive 가드 — 합법 키워드 차단 안 됨</li>
 *   <li>REQUIRES_NEW 패턴 — DispatchSmsSaveHistoryService 구조 확인</li>
 * </ol>
 *
 * <p>{@code package com.samhanair.logis.notification.adapter.sms} 에 배치한 이유:
 * {@link AligoSmsAdapter#isPlaceholder(String)} 는 package-private 이므로 동일 패키지 테스트에서만
 * 직접 접근 가능.
 */
class Phase9AligoPlaceholderGuardConsistencyTest {

    /** 4 표준 placeholder 키워드 (SP-09 vendor 통일 기준). */
    private static final String[] STANDARD_PLACEHOLDERS = {
            "PLACEHOLDER_DEV_ONLY",
            "CHANGE_ME_LOCAL_ONLY",
            "changeme",
            "dummy"
    };

    private AligoSmsAdapter adapter;

    @BeforeEach
    void setUp() {
        AligoProperties props = new AligoProperties();
        RestClient.Builder mockBuilder = Mockito.mock(RestClient.Builder.class);
        adapter = new AligoSmsAdapter(props, mockBuilder);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AligoSmsAdapter.isPlaceholder() — 4 표준 키워드 모두 차단 검증
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("AligoSmsAdapter.isPlaceholder() 4 표준 키워드 차단")
    class AligoIsPlaceholder4Keywords {

        @ParameterizedTest(name = "isPlaceholder({0}) = true")
        @ValueSource(strings = {
                "PLACEHOLDER_DEV_ONLY",
                "placeholder_dev_only",
                "Placeholder_Dev_Only",
                "CHANGE_ME_LOCAL_ONLY",
                "change_me_local_only",
                "Change_Me_Local_Only",
                "changeme",
                "CHANGEME",
                "Changeme",
                "dummy",
                "DUMMY",
                "Dummy"
        })
        @DisplayName("표준 4 키워드 모두 isPlaceholder = true (대소문자 무시)")
        void allStandardPlaceholders_shouldReturnTrue(String keyword) {
            assertThat(adapter.isPlaceholder(keyword))
                    .as("'%s' 는 placeholder 로 판정되어야 한다 (isPlaceholder=true)", keyword)
                    .isTrue();
        }

        @Test
        @DisplayName("null 값 → isPlaceholder = true (미설정)")
        void nullValue_shouldReturnTrue() {
            assertThat(adapter.isPlaceholder(null))
                    .as("null 은 placeholder 로 판정되어야 한다")
                    .isTrue();
        }

        @Test
        @DisplayName("blank 값 → isPlaceholder = true (빈 문자열)")
        void blankValue_shouldReturnTrue() {
            assertThat(adapter.isPlaceholder("   "))
                    .as("blank 문자열은 placeholder 로 판정되어야 한다")
                    .isTrue();
        }

        @Test
        @DisplayName("빈 문자열 → isPlaceholder = true")
        void emptyString_shouldReturnTrue() {
            assertThat(adapter.isPlaceholder(""))
                    .as("빈 문자열은 placeholder 로 판정되어야 한다")
                    .isTrue();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // false-positive 가드 — 합법 키워드 차단 안 됨
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("AligoSmsAdapter false-positive 가드 — 합법 키워드 차단 안 됨")
    class AligoIsPlaceholderFalsePositiveGuard {

        @ParameterizedTest(name = "isPlaceholder({0}) = false (합법)")
        @ValueSource(strings = {
                "test",
                "aligo-real-key-9f3a2",
                "production-key-abc123",
                "sandbox-key-xyz",
                "ALIGO_PROD_KEY_2026",
                "01012345678",
                "samhanair_sms"
        })
        @DisplayName("합법 키워드는 isPlaceholder = false (false-positive 가드)")
        void legitimateValues_shouldReturnFalse(String legitimateValue) {
            assertThat(adapter.isPlaceholder(legitimateValue))
                    .as("'%s' 는 합법 키워드로 차단되지 않아야 한다 (isPlaceholder=false)", legitimateValue)
                    .isFalse();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REQUIRES_NEW 패턴 — DispatchSmsSaveHistoryService 구조 검증
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("SP-09-2 REQUIRES_NEW audit 패턴 — DispatchSmsSaveHistoryService 구조 확인")
    class DispatchSmsSaveHistoryServiceAuditPattern {

        @Test
        @DisplayName("DispatchSmsSaveHistoryService 는 독립 @Service 클래스이다")
        void dispatchSmsSaveHistoryService_isSeparateClass() {
            Class<?> svcClass = DispatchSmsSaveHistoryService.class;

            assertThat(svcClass.getDeclaringClass())
                    .as("DispatchSmsSaveHistoryService 는 inner class 가 아니어야 한다 (self-invocation 방지)")
                    .isNull();

            org.springframework.stereotype.Service serviceAnnotation =
                    svcClass.getAnnotation(org.springframework.stereotype.Service.class);
            assertThat(serviceAnnotation)
                    .as("DispatchSmsSaveHistoryService 에 @Service 어노테이션이 있어야 한다")
                    .isNotNull();
        }

        @Test
        @DisplayName("DispatchSmsSaveHistoryService 는 REQUIRES_NEW 를 위한 PlatformTransactionManager 를 보유")
        void dispatchSmsSaveHistoryService_hasTransactionManager() {
            Class<?> svcClass = DispatchSmsSaveHistoryService.class;

            boolean hasTransactionManagerField = Arrays.stream(svcClass.getDeclaredFields())
                    .anyMatch(f -> org.springframework.transaction.PlatformTransactionManager.class
                            .isAssignableFrom(f.getType()));

            assertThat(hasTransactionManagerField)
                    .as("DispatchSmsSaveHistoryService 는 PlatformTransactionManager 필드를 가져야 한다")
                    .isTrue();
        }

        @Test
        @DisplayName("AligoSmsAdapter 는 SmsAdapter 인터페이스를 구현한다")
        void aligoSmsAdapter_implementsSmsAdapter() {
            assertThat(SmsAdapter.class)
                    .as("AligoSmsAdapter 는 SmsAdapter 인터페이스를 구현해야 한다")
                    .isAssignableFrom(AligoSmsAdapter.class);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4 vendor 공통 placeholder 키워드 완전성 검증 (cross-check)
    // ═══════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Aligo 4 vendor placeholder 키워드 완전성 — cross-check (기준선)")
    class PlaceholderKeywordCompleteness {

        @Test
        @DisplayName("Aligo 는 4 표준 키워드 대소문자 무관 모두 차단 (SP-09-1 ETax 대비 차이 없음)")
        void aligo_coversAllFourKeywords_caseInsensitive() {
            for (String kw : STANDARD_PLACEHOLDERS) {
                assertThat(adapter.isPlaceholder(kw))
                        .as("isPlaceholder('%s') = true", kw)
                        .isTrue();
                assertThat(adapter.isPlaceholder(kw.toUpperCase(java.util.Locale.ROOT)))
                        .as("isPlaceholder('%s'.upper) = true", kw.toUpperCase(java.util.Locale.ROOT))
                        .isTrue();
                assertThat(adapter.isPlaceholder(kw.toLowerCase(java.util.Locale.ROOT)))
                        .as("isPlaceholder('%s'.lower) = true", kw.toLowerCase(java.util.Locale.ROOT))
                        .isTrue();
            }
        }
    }
}
