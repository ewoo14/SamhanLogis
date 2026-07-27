package com.samhanair.logis.partnerorder.config;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import com.samhanair.logis.partnerorder.service.BootstrapService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * bootstrap 내부 캐시 주기 갱신 스케줄러 테스트.
 *
 * <p>{@code @Cacheable("bootstrap")} 외부 래퍼만 비우면 내부 {@code productCatalogCache}/{@code sheetCache}
 * 가 stale 로 남으므로, 스케줄러는 반드시 프록시 경유 {@code evictAll()} 후 {@code prefetch()} 를 수행하고
 * 마지막에 outer Spring cache 만 다시 비워 중간 window 의 fallback 응답 재캐시를 제거해야 한다.
 */
@ExtendWith(MockitoExtension.class)
class BootstrapCacheRefreshSchedulerTest {

    @Mock
    private BootstrapService bootstrapService;

    private BootstrapCacheRefreshScheduler scheduler;

    @BeforeEach
    void setUp() {
        scheduler = new BootstrapCacheRefreshScheduler(bootstrapService, new SimpleMeterRegistry());
    }

    @Test
    void refreshBootstrapCache는_evictAll_후_prefetch_후_outer_cache만_다시_비운다() {
        scheduler.refreshBootstrapCache();

        InOrder inOrder = inOrder(bootstrapService);
        inOrder.verify(bootstrapService).evictAll();
        inOrder.verify(bootstrapService).prefetch();
        inOrder.verify(bootstrapService).evictSpringBootstrapCache();
        verifyNoMoreInteractions(bootstrapService);
    }
}
