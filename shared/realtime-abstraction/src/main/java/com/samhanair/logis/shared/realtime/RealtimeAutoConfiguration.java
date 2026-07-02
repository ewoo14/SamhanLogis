package com.samhanair.logis.shared.realtime;

import com.samhanair.logis.shared.realtime.broker.BrokerConfiguration;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.shared.realtime.lock.DefaultEditLockGuard;
import com.samhanair.logis.shared.realtime.lock.EditLockGuard;
import com.samhanair.logis.shared.realtime.presence.PresenceService;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * shared:realtime-abstraction 자동 설정 — PR-H4a (Phase 12 Step 4a).
 *
 * <p>본 module 의존만 추가하면 다음 bean 자동 활성화:
 *
 * <ul>
 *   <li>{@link com.samhanair.logis.shared.realtime.broker.RealtimeBroker} —
 *       {@link com.samhanair.logis.shared.realtime.broker.InMemoryRealtimeBroker} default 구현
 *       (in-memory, 단일 노드)</li>
 *   <li>{@link com.samhanair.logis.shared.realtime.broker.RedisRealtimeBroker} —
 *       {@code samhan.realtime.broker=redis} 시점만 등록 (cross-node 전파 hook)</li>
 *   <li>{@link EditLockGuard} — {@link DefaultEditLockGuard} default 구현</li>
 *   <li>{@code @EnableScheduling} — InMemoryRealtimeBroker.heartbeat 의 30s 주기 활성</li>
 * </ul>
 *
 * <p><b>{@code @ConditionalOnMissingBean}</b> — consumer service 가 자체 bean 을 정의했으면 우선
 * (override 가능).
 *
 * <p><b>{@code @ConditionalOnClass(SseEmitter)}</b> — Spring webmvc 미적용 service 는 자동 무시.
 *
 * <p>참조: {@code shared:security} 의 {@code InternalSecurityAutoConfiguration} 패턴 일관.
 */
@AutoConfiguration
@ConditionalOnClass(name = "org.springframework.web.servlet.mvc.method.annotation.SseEmitter")
@EnableScheduling
@Import(BrokerConfiguration.class)
public class RealtimeAutoConfiguration {

    /** 기본 잠금 가드 — consumer service override 가능. */
    @Bean
    @ConditionalOnMissingBean(EditLockGuard.class)
    public EditLockGuard editLockGuard() {
        return new DefaultEditLockGuard();
    }

    /** 동시 접속자 presence registry — 기존 RealtimeBroker 채널로 join/leave 이벤트를 발행한다. */
    @Bean
    @ConditionalOnMissingBean(PresenceService.class)
    public PresenceService presenceService(RealtimeBroker broker) {
        return new PresenceService(broker);
    }

    /** 컬렉션(목록) 레벨 변경 발화 헬퍼 — consumer service override 가능. */
    @Bean
    @ConditionalOnMissingBean(CollectionRealtimePublisher.class)
    public CollectionRealtimePublisher collectionRealtimePublisher(RealtimeBroker broker) {
        return new CollectionRealtimePublisher(broker);
    }
}
