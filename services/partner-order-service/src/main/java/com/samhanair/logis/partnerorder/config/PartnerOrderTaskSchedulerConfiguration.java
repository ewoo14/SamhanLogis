package com.samhanair.logis.partnerorder.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnThreading;
import org.springframework.boot.autoconfigure.thread.Threading;
import org.springframework.boot.task.SimpleAsyncTaskExecutorBuilder;
import org.springframework.boot.task.ThreadPoolTaskExecutorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Primary;
import org.springframework.core.task.SimpleAsyncTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * partner-order-service의 scheduled 작업 풀 구성.
 *
 * <p>기본 {@code taskScheduler}는 outbox를 제외한 형제 스케줄러가 사용하고, outbox는 별도
 * {@code outboxTaskScheduler}를 명시적으로 선택한다. 두 풀을 분리해 어느 한쪽의 장시간 작업이
 * 다른 쪽의 tick을 굶기지 않도록 한다.
 *
 * <p><b>#888 적대검증 R1 결함1 — {@code applicationTaskExecutor} 명시 복원.</b> {@code
 * taskScheduler}/{@code outboxTaskScheduler}는 둘 다 {@link ThreadPoolTaskScheduler}라 {@code
 * java.util.concurrent.Executor}도 구현한다. 이 설정 클래스가 등록되는 순간 Boot 3.3
 * {@code TaskExecutionAutoConfiguration}({@code TaskExecutorConfigurations.TaskExecutorConfiguration}
 * 의 클래스 레벨 {@code @ConditionalOnMissingBean(Executor.class)})이 back-off해 {@code
 * applicationTaskExecutor}({@code taskExecutor} alias 포함)가 조용히 사라진다(실기동
 * actuator/prometheus 대조로 확인 — {@code executor_pool_core_threads}에서 두 bean 모두 소실,
 * outbox 분리 전에는 {@code applicationTaskExecutor}=8 코어로 존재했다). slip-service {@code
 * PartnerProductPriceMemoryAsyncConfig}가 이미 겪은 것과 같은 함정이라(전용 pool bean 을 Executor
 * 축으로 명명해 분리한 전례) 그 처방(Boot 등가 분기 명시 복원)을 그대로 적용한다. 복원하지 않으면
 * 향후 {@code @Async} 도입 시 그 작업이 형제 스케줄링 풀(5)이나 outbox 전용 풀(1) 위에서 돌아, 이
 * PR이 없앤 굶주림 구조를 스케줄링→비동기 실행 축에서 재도입하게 된다.
 *
 * <p><b>#888 적대검증 R1 결함2 — 스레드 이름 접두어 단축.</b> Boot 기본 콘솔 로그 패턴의 스레드
 * 필드는 {@code %15.15t}(최소/최대 폭 15, 초과분은 Logback 규정대로 문자열 앞부분에서 제거)다.
 * 기존 {@code partner-order-scheduling-}·{@code partner-order-outbox-} 접두어는 번호가 붙으면
 * 각각 26자·22자가 되어 15자 필드에서 앞부분이 잘리고({@code er-scheduling-4}·{@code
 * -order-outbox-1}), 두 풀을 구분하려 붙인 접두어 자체가 로그에서 소실된다. {@code scheduling-}
 * (11자)·{@code outbox-}(7자)로 줄여, 두 자리 스레드 번호가 붙어도 15자 필드 안에 전체가 온전히
 * 들어오게 한다. 로그 라인에는 별도로 서비스명이 표기되므로(운영 배선 — 이 문자열 자체는 풀
 * 식별만 담당하면 된다) {@code partner-order-} 접두를 반복할 필요가 없다.
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
        return scheduler("scheduling-", poolSize);
    }

    /** outbox tick 전용 풀 — 형제 수·형제 점유 시간과 무관하게 최소 1개 실행 스레드를 보장한다. */
    @Bean(name = OUTBOX_TASK_SCHEDULER_BEAN_NAME)
    public ThreadPoolTaskScheduler outboxTaskScheduler() {
        return scheduler("outbox-", 1);
    }

    private ThreadPoolTaskScheduler scheduler(String threadNamePrefix, int poolSize) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(poolSize);
        scheduler.setThreadNamePrefix(threadNamePrefix);
        return scheduler;
    }

    /**
     * Boot 기본 {@code applicationTaskExecutor}({@code taskExecutor} alias 포함) 명시 복원
     * (결함1 — platform thread 분기). Boot 3.3.5와 동등하게 {@link ThreadPoolTaskExecutorBuilder}로
     * 생성한다.
     */
    @Lazy
    @ConditionalOnThreading(Threading.PLATFORM)
    @Bean(name = {"applicationTaskExecutor", "taskExecutor"})
    public ThreadPoolTaskExecutor applicationTaskExecutor(ThreadPoolTaskExecutorBuilder builder) {
        return builder.build();
    }

    /**
     * Boot virtual-thread 의미를 보존하는 기본 executor 분기(결함1). {@code
     * spring.threads.virtual.enabled=true}이고 런타임이 virtual thread를 지원할 때만 활성화되며,
     * 현재 이 서비스는 Java 17 + virtual thread 비활성이라 inert하다.
     */
    @Lazy
    @ConditionalOnThreading(Threading.VIRTUAL)
    @Bean(name = {"applicationTaskExecutor", "taskExecutor"})
    public SimpleAsyncTaskExecutor applicationTaskExecutorVirtualThreads(
            SimpleAsyncTaskExecutorBuilder builder) {
        return builder.build();
    }
}
