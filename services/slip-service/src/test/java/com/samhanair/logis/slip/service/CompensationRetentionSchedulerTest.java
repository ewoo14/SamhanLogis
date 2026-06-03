package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 보상 실패 감사 retention scheduler 단위 테스트.
 */
class CompensationRetentionSchedulerTest {

    private static final Clock FIXED_CLOCK = Clock.fixed(
            Instant.parse("2026-06-03T03:30:00Z"),
            ZoneId.of("Asia/Seoul"));

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(SchedulerTestConfig.class)
            .withPropertyValues(
                    "samhan.compensation.retention.cron=0 30 3 * * *",
                    "samhan.compensation.retention.retention-days=90");

    @Test
    void conditionalPropertyDisabled_schedulerBeanIsNotRegistered() {
        contextRunner
                .withPropertyValues("samhan.compensation.retention.enabled=false")
                .run(context -> assertThat(context)
                        .doesNotHaveBean(CompensationRetentionScheduler.class));
    }

    @Test
    void conditionalPropertyEnabled_schedulerBeanIsRegistered() {
        contextRunner
                .withPropertyValues("samhan.compensation.retention.enabled=true")
                .run(context -> assertThat(context)
                        .hasSingleBean(CompensationRetentionScheduler.class));
    }

    @Test
    void purgeResolvedFailures_delegatesCutoffBasedOnFixedClock() {
        CompensationRetentionService retentionService = mock(CompensationRetentionService.class);
        CompensationRetentionScheduler scheduler =
                new CompensationRetentionScheduler(retentionService, FIXED_CLOCK);
        ReflectionTestUtils.setField(scheduler, "retentionDays", 90L);

        scheduler.purgeResolvedFailures();

        verify(retentionService).purge(
                LocalDateTime.of(2026, 3, 5, 12, 30),
                "system-retention");
    }

    @Configuration
    @Import(CompensationRetentionScheduler.class)
    static class SchedulerTestConfig {

        @Bean
        CompensationRetentionService retentionService() {
            return mock(CompensationRetentionService.class);
        }

        @Bean
        Clock clock() {
            return FIXED_CLOCK;
        }
    }
}
