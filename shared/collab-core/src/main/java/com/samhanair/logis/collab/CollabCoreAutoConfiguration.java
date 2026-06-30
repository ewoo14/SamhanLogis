package com.samhanair.logis.collab;

import com.samhanair.logis.collab.coedit.CollabCoeditService;
import com.samhanair.logis.shared.realtime.RealtimeAutoConfiguration;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigureAfter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;

/**
 * shared:collab-core 자동 설정 진입점.
 *
 * <p>본 module 은 @MappedSuperclass 와 generic service class 만 제공한다. 구체 서비스 bean 은
 * 소비 service 가 자기 entity/repository/factory 타입으로 등록한다. 따라서 autoconfiguration 은
 * realtime broker bean 이 있는 opt-in 환경에서만 publisher bean 을 등록하고 별도 broker 를 강제하지 않는다.
 *
 * <p><b>{@code @AutoConfigureAfter(RealtimeAutoConfiguration.class)}</b> — {@code @ConditionalOnBean}
 * 은 auto-config 평가 순서에 민감하다. 자체 broker bean(user @Configuration)을 둔 service(slip 등)는
 * 무관하나, auto-config {@code InMemoryRealtimeBroker} 에 의존하는 service(accounting 등)는
 * RealtimeAutoConfiguration 이 broker 를 먼저 등록한 뒤 본 설정이 평가돼야 publisher 가 누락되지
 * 않는다. 미지정 시 broker bean 미가시 → {@link CollabRealtimePublisher} 누락 → editService 빈 생성 실패.
 */
@AutoConfiguration
@AutoConfigureAfter(RealtimeAutoConfiguration.class)
@ConditionalOnBean(RealtimeBroker.class)
public class CollabCoreAutoConfiguration {

    /** collab-core generic 서비스가 공유하는 afterCommit SSE publisher. */
    @Bean
    @ConditionalOnMissingBean
    public CollabRealtimePublisher collabRealtimePublisher(RealtimeBroker broker) {
        return new CollabRealtimePublisher(broker);
    }

    /** Yjs update 를 도메인 무관 문서 단위로 누적·중계하는 co-edit relay. */
    @Bean
    @ConditionalOnMissingBean
    public CollabCoeditService collabCoeditService(RealtimeBroker broker) {
        return new CollabCoeditService(broker);
    }
}
