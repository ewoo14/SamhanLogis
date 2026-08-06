package com.samhanair.logis.notification.client;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Phase 10 PR-F1 BE-1 — {@link AligoAddressBookClient} 의 mock / dryRun 구현체 (Configuration).
 *
 * <p><b>TODO — 실 알리고 주소록 API spec 후 RestClient 기반 실 구현체로 교체.</b>
 * 사용자가 알리고 주소록 API 의 endpoint / 인증 / payload schema / rate limit 을 확정한 후
 * (PR-F2 후속) 본 패키지에 {@code RestClientAligoAddressBookClient} 를 추가하면
 * Spring Boot 가 {@link ConditionalOnMissingBean} 가드로 자동 전환한다 (계약은
 * {@link AligoAddressBookClient} 인터페이스에서 안정 보존).
 *
 * <p>현재 동작:
 * <ul>
 *   <li>외부 API 호출 X (dryRun)</li>
 *   <li>added/updated/skipped 를 모두 0으로 반환하고 {@code NOT_DELIVERED} 상태를 명시
 *       (외부에 전달되지 않은 contact 를 성공/신규로 계수하지 않음)</li>
 *   <li>호출 마다 INFO 로그 (chunk size + sample group/name) — 운영자가 mock 활성을 즉시 인지</li>
 * </ul>
 *
 * <h2>패턴 — {@link NoopPartnerLookupClient} 와 동일</h2>
 * <p>{@link Configuration @Configuration} + {@link Bean @Bean} + {@link ConditionalOnMissingBean}
 * 조합 — {@code @Component} + 자기 자신 condition 평가 회귀를 회피한 안정 패턴
 * (NoopPartnerLookupClient JavaDoc 참조).
 *
 * <h2>종합 fix — bean name 충돌 회피 (PR #119 CI run 25615955037 회귀)</h2>
 * <p>{@code @Bean} 메서드 이름에 {@code Bean} suffix 추가 ({@code mockAligoAddressBookClient} →
 * {@code mockAligoAddressBookClientBean}) 로 클래스 빈 이름 ({@code mockAligoAddressBookClient}) 과
 * 메서드 빈 이름 충돌 원천 회피. 이전 시도였던 {@code @Profile("!test")} 는 IT 가 active profile
 * 미명시 환경에서 실효 없음.
 */
@Configuration
public class MockAligoAddressBookClient {

    private static final Logger log = LoggerFactory.getLogger(MockAligoAddressBookClient.class);

    /**
     * Mock dryRun {@link AligoAddressBookClient} bean.
     *
     * <p>{@link ConditionalOnMissingBean} 평가 시 본 메서드는 후보로 카운트되지 않으므로
     * (Spring Boot 표준 동작) 실 RestClient impl 등록 시 자동 비활성화.
     */
    @Bean
    @ConditionalOnMissingBean(AligoAddressBookClient.class)
    public AligoAddressBookClient mockAligoAddressBookClientBean() {
        log.warn("AligoAddressBookClient 실 구현체 미등록 — Mock dryRun placeholder 활성. "
                + "PR-F2 후속에서 알리고 주소록 API spec 확정 후 RestClient impl 등록 필요.");
        return contacts -> {
            if (contacts == null || contacts.isEmpty()) {
                return AligoAddressBookClient.UploadResult.notDelivered();
            }
            AligoAddressBookClient.AligoContact sample = contacts.get(0);
            log.info("[MockAligoAddressBookClient] dryRun chunk size={} sample group='{}' name='{}'. "
                            + "TODO: 알리고 주소록 API spec 확정 후 실 구현체 교체.",
                    contacts.size(),
                    sample.group(),
                    sample.name());
            return AligoAddressBookClient.UploadResult.notDelivered();
        };
    }
}
