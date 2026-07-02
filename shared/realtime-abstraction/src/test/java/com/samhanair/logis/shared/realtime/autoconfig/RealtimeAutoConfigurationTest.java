package com.samhanair.logis.shared.realtime.autoconfig;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.samhanair.logis.shared.realtime.RealtimeAutoConfiguration;
import com.samhanair.logis.shared.realtime.broker.InMemoryRealtimeBroker;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.broker.RedisRealtimeBroker;
import com.samhanair.logis.shared.realtime.lock.DefaultEditLockGuard;
import com.samhanair.logis.shared.realtime.lock.EditLockGuard;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

/**
 * PR-H4a — RealtimeAutoConfiguration 단위 (1 case 본 + 옵션 1).
 *
 * <ol>
 *   <li>default — InMemoryRealtimeBroker + DefaultEditLockGuard 만 등록 (Redis 미활성)</li>
 *   <li>samhan.realtime.broker=redis — RedisRealtimeBroker + InMemoryRealtimeBroker + listener 모두 등록</li>
 * </ol>
 */
class RealtimeAutoConfigurationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(
                    JacksonAutoConfiguration.class,
                    RealtimeAutoConfiguration.class));

    @Test
    void default_registersInMemoryBrokerOnly() {
        contextRunner.run(context -> {
            assertThat(context).hasSingleBean(RealtimeBroker.class);
            assertThat(context.getBean(RealtimeBroker.class))
                    .isInstanceOf(InMemoryRealtimeBroker.class);
            assertThat(context).hasSingleBean(EditLockGuard.class);
            assertThat(context.getBean(EditLockGuard.class))
                    .isInstanceOf(DefaultEditLockGuard.class);
            // Redis bean 들 미등록
            assertThat(context).doesNotHaveBean(RedisRealtimeBroker.class);
        });
    }

    @Test
    void redisProperty_registersRedisBrokerWithInMemoryDelegate() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(
                        JacksonAutoConfiguration.class,
                        RealtimeAutoConfiguration.class))
                .withUserConfiguration(MockRedisInfrastructure.class)
                .withPropertyValues("samhan.realtime.broker=redis")
                .run(context -> {
                    assertThat(context).hasSingleBean(RealtimeBroker.class);
                    assertThat(context.getBean(RealtimeBroker.class))
                            .isInstanceOf(InMemoryRealtimeBroker.class);
                    assertThat(context).hasSingleBean(RedisRealtimeBroker.class);
                });
    }

    @TestConfiguration
    static class MockRedisInfrastructure {

        /**
         * Redis 모드 테스트는 bean 등록 계약만 검증한다.
         * 실제 Redis listener 기동은 localhost:6379 존재 여부에 따라 CI/로컬 결과가 갈리므로 mock 으로 격리한다.
         */
        @Bean
        RedisMessageListenerContainer realtimeMessageListenerContainerBean() {
            return mock(RedisMessageListenerContainer.class);
        }

        @Bean
        StringRedisTemplate stringRedisTemplate() {
            return mock(StringRedisTemplate.class);
        }
    }
}
