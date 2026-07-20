package com.samhanair.logis.partnerorder.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

/**
 * #854 R4 MED — outbox 튜닝 기본값 가드.
 *
 * <p>R3 가 세운 lease/batch 불변식과 기본값(batch-size 10 · lease-seconds 120)에 대응하는 테스트가
 * 없었다. IT 는 {@code outboxProperties.getLeaseSeconds()} 를 <b>동적으로 읽어</b> 단언하므로 기본값을
 * 어떻게 바꿔도 GREEN 이고, {@code @PostConstruct} 불변식은 warn 로그일 뿐 어떤 단언에도 걸리지 않는다.
 * 배포 기본값 자체를 여기서 고정한다.
 */
class OutboxPropertiesTest {

    /** {@code SlipPublishOutboxScheduler.PER_ROW_MAX_SECONDS} 와 동일한 계수(HTTP connect 2s + read 5s). */
    private static final int PER_ROW_MAX_SECONDS = 7;

    @Test
    @DisplayName("배포 기본값 고정: cron 5분 · max-retry 24h · lease 120s · batch 10 · 최소 시도 2")
    void defaults_arePinnedToDeployedValues() {
        OutboxProperties properties = new OutboxProperties();

        assertThat(properties.getCron()).isEqualTo("0 */5 * * * *");
        assertThat(properties.getMaxRetryHours()).isEqualTo(24);
        assertThat(properties.getLeaseSeconds()).isEqualTo(120);
        assertThat(properties.getBatchSize()).isEqualTo(10);
        assertThat(properties.getPermanentErrorMinAttempts()).isEqualTo(2);
    }

    @Test
    @DisplayName("lease/batch 불변식: 기본값이 lease-seconds >= batch-size × perRow 를 만족한다")
    void defaults_satisfyLeaseBatchInvariant() {
        OutboxProperties properties = new OutboxProperties();

        int worstDwell = properties.getBatchSize() * PER_ROW_MAX_SECONDS;

        // 위반 시 순차 batch 최악 dwell 이 lease 를 넘어 멀티 인스턴스 lease overlap 재발행이 상시화된다.
        assertThat(properties.getLeaseSeconds())
                .as("lease-seconds(%s) >= batch-size(%s) × perRow(%ss) = %s",
                        properties.getLeaseSeconds(), properties.getBatchSize(),
                        PER_ROW_MAX_SECONDS, worstDwell)
                .isGreaterThanOrEqualTo(worstDwell);
    }

    @Test
    @DisplayName("최소 시도 가드: 1 미만이면 복구 불가 오류가 시도 0회에 종결될 수 있으므로 1 이상이어야 한다")
    void permanentErrorMinAttempts_isAtLeastOne() {
        assertThat(new OutboxProperties().getPermanentErrorMinAttempts()).isGreaterThanOrEqualTo(1);
    }

    /**
     * yml 바인딩 회귀 가드 (#854 R5 LOW) — {@code new OutboxProperties()} 로만 단언하면 자바 필드
     * 기본값만 고정될 뿐, {@code application.yml} 의 {@code samhan.outbox.*} 키가 오탈자·삭제·prefix
     * 불일치로 표류해도 GREEN 이다. 실 {@code application.yml} 을 로드해 {@code @ConfigurationProperties}
     * 로 바인딩된 빈 값을 단언한다 — yml 키를 지우거나 오타를 내면 이 값이 자바 기본값과 달라지거나
     * (다른 프로퍼티가 우연히 같은 값이 아닌 한) 바인딩 자체가 깨진다.
     */
    @Test
    @DisplayName("application.yml 바인딩: samhan.outbox.* 실 배포 값이 OutboxProperties 로 바인딩된다")
    void applicationYml_bindsSamhanOutboxPropertiesToDeployedValues() {
        new ApplicationContextRunner()
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .withUserConfiguration(OutboxPropertiesTestConfig.class)
                .run(context -> {
                    OutboxProperties properties = context.getBean(OutboxProperties.class);
                    assertThat(properties.getCron()).isEqualTo("0 */5 * * * *");
                    assertThat(properties.getMaxRetryHours()).isEqualTo(24);
                    assertThat(properties.getLeaseSeconds()).isEqualTo(120);
                    assertThat(properties.getBatchSize()).isEqualTo(10);
                    assertThat(properties.getPermanentErrorMinAttempts()).isEqualTo(2);
                });
    }

    /** {@code PartnerOrderServiceApplication} 의 {@code @EnableConfigurationProperties} 등록을 좁게 재현. */
    @Configuration
    @EnableConfigurationProperties(OutboxProperties.class)
    static class OutboxPropertiesTestConfig {
    }
}
