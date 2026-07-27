package com.samhanair.logis.partnerorder.config;

import com.samhanair.logis.partnerorder.service.BootstrapService;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * bootstrap 내부 캐시 주기 갱신 스케줄러.
 *
 * <p>{@code @Cacheable("bootstrap")} 외부 래퍼 캐시만 만료되면 {@code BootstrapService} 내부의
 * {@code productCatalogCache}/{@code sheetCache} 가 stale 로 남을 수 있다. 본 스케줄러는 별도
 * Spring Bean 에서 프록시로 주입된 {@link BootstrapService} 를 호출해 {@code @CacheEvict} 를
 * 정상 적용한 뒤 내부 캐시를 다시 prefetch 한다.
 */
@Slf4j
@Component
public class BootstrapCacheRefreshScheduler {

    public static final String REFRESH_DURATION_METRIC = "bootstrap_cache_refresh_duration";

    private final BootstrapService bootstrapService;
    private final MeterRegistry meterRegistry;
    private final Timer refreshDuration;

    public BootstrapCacheRefreshScheduler(BootstrapService bootstrapService, MeterRegistry meterRegistry) {
        this.bootstrapService = bootstrapService;
        this.meterRegistry = meterRegistry;
        this.refreshDuration = Timer.builder(REFRESH_DURATION_METRIC)
                .description("bootstrap cache refresh 실행 소요 시간")
                .register(meterRegistry);
    }

    /**
     * 이전 갱신 완료 후 N분 뒤 bootstrap 캐시를 비우고 다시 적재한다.
     *
     * <p>순서는 반드시 {@code evictAll -> prefetch -> evictSpringBootstrapCache} 이다. 먼저 Spring
     * Cache + 내부 캐시를 비운 뒤 product-service/Google Sheets 원천에서 내부 캐시를 다시 채우고,
     * 마지막에 outer Spring Cache 만 다시 비워 refresh window 중 재캐시된 fallback 응답을 제거한다.
     */
    @Scheduled(fixedDelayString = "#{${app.bootstrap.cache-refresh-minutes:10} * 60000}")
    public void refreshBootstrapCache() {
        Timer.Sample sample = Timer.start(meterRegistry);
        try {
            log.info("[BootstrapCacheRefreshScheduler] bootstrap cache refresh 시작");
            bootstrapService.evictAll();
            bootstrapService.prefetch();
            bootstrapService.evictSpringBootstrapCache();
            log.info("[BootstrapCacheRefreshScheduler] bootstrap cache refresh 완료");
        } catch (Exception ex) {
            log.warn("[BootstrapCacheRefreshScheduler] bootstrap cache refresh 실패: {}", ex.getMessage(), ex);
        } finally {
            sample.stop(refreshDuration);
        }
    }
}
