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
 * 보상 실패 감사 물리 purge scheduler 단위 테스트.
 */
class CompensationPurgeSchedulerTest {

    private static final Clock FIXED_CLOCK = Clock.fixed(
            Instant.parse("2026-06-06T19:00:00Z"),
            ZoneId.of("Asia/Seoul"));

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(SchedulerTestConfig.class)
            .withPropertyValues(
                    "samhan.compensation.purge.cron=0 0 4 * * *",
                    "samhan.compensation.purge.zone=Asia/Seoul",
                    "samhan.compensation.purge.grace-days=30",
                    "samhan.compensation.purge.batch-size=500");

    @Test
    void conditionalPropertyDisabled_schedulerBeanIsNotRegistered() {
        contextRunner
                .withPropertyValues("samhan.compensation.purge.enabled=false")
                .run(context -> assertThat(context)
                        .doesNotHaveBean(CompensationPurgeScheduler.class));
    }

    @Test
    void conditionalPropertyEnabled_schedulerBeanIsRegistered() {
        contextRunner
                .withPropertyValues("samhan.compensation.purge.enabled=true")
                .run(context -> assertThat(context)
                        .hasSingleBean(CompensationPurgeScheduler.class));
    }

    @Test
    void purgeSoftDeletedFailures_delegatesCutoffBasedOnFixedClock() {
        CompensationPurgeService purgeService = mock(CompensationPurgeService.class);
        CompensationPurgeScheduler scheduler =
                new CompensationPurgeScheduler(purgeService, FIXED_CLOCK);
        ReflectionTestUtils.setField(scheduler, "graceDays", 30L);
        ReflectionTestUtils.setField(scheduler, "batchSize", 500);

        scheduler.purgeSoftDeletedFailures();

        verify(purgeService).purgePhysically(
                LocalDateTime.of(2026, 5, 8, 4, 0),
                500);
    }

    @Configuration
    @Import(CompensationPurgeScheduler.class)
    static class SchedulerTestConfig {

        @Bean
        CompensationPurgeService purgeService() {
            return mock(CompensationPurgeService.class);
        }

        @Bean
        Clock clock() {
            return FIXED_CLOCK;
        }
    }
}
