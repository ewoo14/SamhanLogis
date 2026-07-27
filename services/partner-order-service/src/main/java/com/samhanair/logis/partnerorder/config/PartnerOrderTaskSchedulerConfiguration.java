package com.samhanair.logis.partnerorder.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * partner-order-service의 scheduled 작업 풀 구성.
 *
 * <p>기본 {@code taskScheduler}는 outbox를 제외한 형제 스케줄러가 사용하고, outbox는 별도
 * {@code outboxTaskScheduler}를 명시적으로 선택한다. 두 풀을 분리해 어느 한쪽의 장시간 작업이
 * 다른 쪽의 tick을 굶기지 않도록 한다.
 */
@Configuration(proxyBeanMethods = false)
public class PartnerOrderTaskSchedulerConfiguration {

    public static final String TASK_SCHEDULER_BEAN_NAME = "taskScheduler";
    public static final String OUTBOX_TASK_SCHEDULER_BEAN_NAME = "outboxTaskScheduler";

    /** 형제 스케줄러가 공유하는 기본 풀. 기존 spring.task.scheduling.pool.size=5를 유지한다. */
    @Bean(name = TASK_SCHEDULER_BEAN_NAME)
    @Primary
    public ThreadPoolTaskScheduler taskScheduler(
            @Value("${spring.task.scheduling.pool.size:1}") int poolSize) {
        return scheduler("partner-order-scheduling-", poolSize);
    }

    /** outbox tick 전용 풀 — 형제 수·형제 점유 시간과 무관하게 최소 1개 실행 스레드를 보장한다. */
    @Bean(name = OUTBOX_TASK_SCHEDULER_BEAN_NAME)
    public ThreadPoolTaskScheduler outboxTaskScheduler() {
        return scheduler("partner-order-outbox-", 1);
    }

    private ThreadPoolTaskScheduler scheduler(String threadNamePrefix, int poolSize) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(poolSize);
        scheduler.setThreadNamePrefix(threadNamePrefix);
        return scheduler;
    }
}
