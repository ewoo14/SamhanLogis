package com.samhanair.logis.partnerorder.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;

import com.samhanair.logis.partnerorder.service.BootstrapService;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/** Bootstrap cache refresh 소요 시간 관측 회귀 테스트. */
class BootstrapCacheRefreshSchedulerObservabilityTest {

    @Test
    void refreshBootstrapCache는_실행_소요_시간을_Timer로_기록한다() {
        BootstrapService bootstrapService = mock(BootstrapService.class);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        doAnswer(invocation -> {
            Thread.sleep(10);
            return null;
        }).when(bootstrapService).prefetch();

        new ApplicationContextRunner()
                .withBean(BootstrapService.class, () -> bootstrapService)
                .withBean(MeterRegistry.class, () -> meterRegistry)
                .withUserConfiguration(BootstrapCacheRefreshScheduler.class)
                .run(context -> {
                    context.getBean(BootstrapCacheRefreshScheduler.class).refreshBootstrapCache();

                    Timer timer = meterRegistry.find("bootstrap_cache_refresh_duration").timer();
                    assertThat(timer)
                            .as("bootstrap refresh duration Timer가 실제 registry에 등록돼야 한다")
                            .isNotNull();
                    assertThat(timer.count()).isEqualTo(1);
                    assertThat(timer.totalTime(TimeUnit.NANOSECONDS)).isGreaterThan(0);
                });
    }
}
