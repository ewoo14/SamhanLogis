package com.samhanair.logis.partnerorder.config;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import com.samhanair.logis.partnerorder.service.BootstrapService;
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
 * 가 stale 로 남으므로, 스케줄러는 반드시 프록시 경유 {@code evictAll()} 후 {@code prefetch()} 순서로
 * 내부 캐시를 다시 채워야 한다.
 */
@ExtendWith(MockitoExtension.class)
class BootstrapCacheRefreshSchedulerTest {

    @Mock
    private BootstrapService bootstrapService;

    private BootstrapCacheRefreshScheduler scheduler;

    @BeforeEach
    void setUp() {
        scheduler = new BootstrapCacheRefreshScheduler(bootstrapService);
    }

    @Test
    void refreshBootstrapCache는_evictAll_후_prefetch_순서로_호출한다() {
        scheduler.refreshBootstrapCache();

        InOrder inOrder = inOrder(bootstrapService);
        inOrder.verify(bootstrapService).evictAll();
        inOrder.verify(bootstrapService).prefetch();
        verifyNoMoreInteractions(bootstrapService);
    }
}
