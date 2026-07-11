package com.samhanair.logis.partnerorder.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCacheManager;

/**
 * bootstrap Spring Cache 설정 검증.
 *
 * <p>관리자 단가/변동일 수정 후 재기동 없이 stale 창이 닫히도록 {@code bootstrap} 캐시에
 * Caffeine expireAfterWrite TTL 이 반드시 설정되어야 한다.
 */
class PartnerOrderBootstrapCacheConfigTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(PartnerOrderBootstrapCacheConfig.class);

    @Test
    void bootstrap_캐시는_설정값_TTL이_적용된_Caffeine_캐시로_등록된다() {
        contextRunner
                .withPropertyValues("app.bootstrap.cache-ttl-minutes=7")
                .run(context -> {
                    CacheManager cacheManager = context.getBean(CacheManager.class);

                    assertThat(cacheManager).isInstanceOf(CaffeineCacheManager.class);
                    assertThat(cacheManager.getCacheNames()).containsExactly("bootstrap");
                    assertThat(cacheManager.getCache("not-bootstrap")).isNull();

                    Cache bootstrapCache = cacheManager.getCache("bootstrap");
                    assertThat(bootstrapCache).isNotNull();
                    Object nativeCache = bootstrapCache.getNativeCache();
                    assertThat(nativeCache).isInstanceOf(com.github.benmanes.caffeine.cache.Cache.class);

                    @SuppressWarnings("unchecked")
                    com.github.benmanes.caffeine.cache.Cache<Object, Object> caffeineCache =
                            (com.github.benmanes.caffeine.cache.Cache<Object, Object>) nativeCache;
                    assertThat(caffeineCache.policy().expireAfterWrite())
                            .as("bootstrap cache expireAfterWrite 정책")
                            .isPresent()
                            .get()
                            .satisfies(policy -> assertThat(policy.getExpiresAfter(TimeUnit.MINUTES)).isEqualTo(7L));
                });
    }
}
