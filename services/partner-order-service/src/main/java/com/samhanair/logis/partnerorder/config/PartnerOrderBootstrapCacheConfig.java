package com.samhanair.logis.partnerorder.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 거래처 주문 bootstrap 응답용 Spring Cache 설정.
 *
 * <p>{@code BootstrapService.fetch()} 의 {@code @Cacheable("bootstrap")} 캐시는 관리자 변동일/단가
 * 변경 후 재기동 없이 유계 시간 안에 새 값을 반영해야 하므로 Caffeine expireAfterWrite TTL 을 적용한다.
 * 관리 대상은 {@code bootstrap} 캐시 1개로 제한한다.
 */
@Configuration
public class PartnerOrderBootstrapCacheConfig {

    public static final String CACHE_BOOTSTRAP = "bootstrap";

    @Bean
    public CacheManager cacheManager(@Value("${app.bootstrap.cache-ttl-minutes:10}") long ttlMinutes) {
        CaffeineCacheManager cacheManager = new CaffeineCacheManager(CACHE_BOOTSTRAP);
        cacheManager.setCaffeine(Caffeine.newBuilder()
                .expireAfterWrite(ttlMinutes, TimeUnit.MINUTES));
        return cacheManager;
    }
}
