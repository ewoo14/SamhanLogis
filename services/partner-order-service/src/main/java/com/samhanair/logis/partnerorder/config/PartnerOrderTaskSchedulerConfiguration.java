package com.samhanair.logis.partnerorder.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnThreading;
import org.springframework.boot.autoconfigure.thread.Threading;
import org.springframework.boot.task.SimpleAsyncTaskExecutorBuilder;
import org.springframework.boot.task.ThreadPoolTaskExecutorBuilder;
import org.springframework.boot.task.ThreadPoolTaskSchedulerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
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
 * 축으로 명명해 분리한 전례) 그 처방(Boot 등가 분기 명시 복원)을 그대로 적용한다.
 *
 * <p><b>#888 재수렴 라운드 — {@code @Primary} 정정 (R1 결함1 서술의 오류 수정).</b> R1은
 * "{@code applicationTaskExecutor}를 복원하지 않으면 향후 {@code @Async} 도입 시 그 작업이 형제
 * 스케줄링 풀(5)이나 outbox 전용 풀(1) 위에서 돈다"고 서술하며 원인을 {@code
 * applicationTaskExecutor} 부재로만 지목했으나 이는 절반만 맞는 진단이었다 — 복원 후에도 {@code
 * taskScheduler}에 남아 있던 {@code @Primary}(R1 당시 코드) 때문에 {@code @Async}는 여전히 형제
 * 풀로 갔다(재수렴 라운드 실기동 재현 — {@code @EnableAsync}를 프로덕션에 켜지 않고 격리 테스트로
 * 확인, 아래 참조). 원인은 Spring {@code
 * AsyncExecutionAspectSupport.getDefaultExecutor}(spring-aop 6.1.14,
 * {@code AsyncExecutionAspectSupport.java:238-274})의 1단계 {@code
 * beanFactory.getBean(TaskExecutor.class)}가 {@code @Primary} 후보를 즉시 반환해 {@code
 * NoUniqueBeanDefinitionException}이 나지 않고, 그래서 그 예외를 잡아야만 도달하는 2단계 이름
 * ("{@code taskExecutor}") fallback에 아예 진입하지 못한 데 있다. {@link ThreadPoolTaskScheduler}가
 * {@code TaskExecutor}도 구현하므로 이 {@code @Primary}는 {@code TaskScheduler} 축뿐 아니라
 * {@code TaskExecutor} 축의 해석에도 그대로 번진다 — annotation 레벨에는 두 축을 따로 지정할
 * 방법이 없다.
 *
 * <p>따라서 {@code taskScheduler}에서 {@code @Primary}를 제거했다. Boot 자신의 기본 스케줄러
 * bean({@code TaskSchedulingConfigurations.TaskSchedulerConfiguration#taskScheduler})과 기본
 * executor bean({@code TaskExecutorConfigurations.TaskExecutorConfiguration#applicationTaskExecutor})
 * 도 원래 {@code @Primary}가 아니다 — Boot 기본 구성에서는 항상 유일 후보이거나 이름 fallback으로
 * 해소되므로 {@code @Primary}가 필요 없다. 이 설정 클래스가 형제/outbox 두 개의 {@code
 * TaskScheduler}를 등록해 유일성이 깨지는 것은 이 서비스의 선택이지만, 두 해석 축 모두 이름
 * fallback이 안전망이 된다:
 *
 * <ul>
 *   <li><b>{@code TaskScheduler} 축</b> — {@code scheduler=} 속성이 없는 기본 {@code @Scheduled}
 *   (예: {@code DraftCleanupScheduler}, {@code BootstrapCacheRefreshScheduler})는 Spring 6.1의
 *   {@code TaskSchedulerRouter#determineDefaultScheduler}(spring-context 6.1.14, {@code
 *   TaskSchedulerRouter.java:169-231})가 처리한다. {@code taskScheduler}/{@code
 *   outboxTaskScheduler} 2개가 모두 후보라 유일성 조회가 실패하고, 그 즉시 이름
 *   "{@code taskScheduler}"로 fallback한다({@code resolveSchedulerBean(beanFactory,
 *   TaskScheduler.class, true)} → {@code getBean("taskScheduler", TaskScheduler.class)}) — 형제
 *   풀 bean의 이름이 정확히 {@link #TASK_SCHEDULER_BEAN_NAME}("{@code taskScheduler}")이므로 이
 *   fallback은 항상 형제 풀 자신을 가리킨다. outbox {@code @Scheduled}는 {@code scheduler =
 *   OUTBOX_TASK_SCHEDULER_BEAN_NAME}을 명시해 이 기본 해석 경로 자체를 타지 않고 {@code
 *   BeanFactoryAnnotationUtils#qualifiedBeanOfType}로 이름 직접 조회한다 — {@code @Primary}와
 *   무관한 별도 경로다.</li>
 *   <li><b>{@code TaskExecutor} 축</b> — {@code @Async}(향후 도입 시)는 위 {@code
 *   getDefaultExecutor}가 처리한다. {@code @Primary}가 없으니 {@code
 *   getBean(TaskExecutor.class)}는 이제 후보 3개(taskScheduler/outboxTaskScheduler/
 *   applicationTaskExecutor) 유일성 조회에 실패해 {@code NoUniqueBeanDefinitionException}을
 *   던지고, 이름 "{@code taskExecutor}" fallback으로 넘어가 {@code applicationTaskExecutor}(그
 *   alias)를 정확히 가리킨다.</li>
 * </ul>
 *
 * <p>이 성질은 {@code PartnerOrderTaskSchedulerConfigurationExecutorCoexistenceTest}의
 * G-4(async 기본 executor 해석)·G-5(기본 scheduler 해석)가 고정한다 — 둘 다 {@code @EnableAsync}/
 * {@code @EnableScheduling} 없이 위 두 알고리즘을 실제 bean factory에 직접 재현해, AOP 프록시
 * 없이도 정확히 같은 질문을 던진다(이 서비스는 여전히 {@code @EnableAsync} 0건을 유지한다).
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

    /**
     * 형제 스케줄러가 공유하는 기본 풀. 기존 spring.task.scheduling.pool.size=5를 유지한다.
     *
     * <p><b>{@code @Primary}를 두지 않는다(재수렴 라운드 정정)</b>: R1은 이 bean에 {@code @Primary}를
     * 부여했으나, {@link ThreadPoolTaskScheduler}가 {@code TaskExecutor}도 구현하는 탓에 그
     * {@code @Primary}가 {@code @Async}의 기본 executor 해석까지 가로채 형제 풀로 보내는 결함을
     * 냈다(클래스 Javadoc 참조). 이름이 이미 {@value #TASK_SCHEDULER_BEAN_NAME}이라 Spring의 이름
     * fallback만으로 {@code TaskScheduler} 축 해석이 정확히 이 bean으로 돌아오므로 {@code @Primary}는
     * 애초에 불필요했다.
     */
    @Bean(name = TASK_SCHEDULER_BEAN_NAME)
    public ThreadPoolTaskScheduler taskScheduler(
            ThreadPoolTaskSchedulerBuilder builder,
            @Value("${spring.task.scheduling.pool.size:1}") int poolSize) {
        return scheduler(builder, "scheduling-", poolSize);
    }

    /** outbox tick 전용 풀 — 형제 수·형제 점유 시간과 무관하게 최소 1개 실행 스레드를 보장한다. */
    @Bean(name = OUTBOX_TASK_SCHEDULER_BEAN_NAME)
    public ThreadPoolTaskScheduler outboxTaskScheduler(ThreadPoolTaskSchedulerBuilder builder) {
        return scheduler(builder, "outbox-", 1);
    }

    /**
     * 두 풀 공통 조립 — pool size·스레드 이름 접두어는 이 클래스가 직접 정하되(풀마다 다른 값이
     * 필요하므로), 나머지는 Boot 자동구성 {@link ThreadPoolTaskSchedulerBuilder}(주입 시점에 이미
     * {@code spring.task.scheduling.shutdown.await-termination}·{@code
     * .await-termination-period}가 반영돼 있다)에 위임한다.
     *
     * <p><b>같은 계열 — 함께 처리(R1 리뷰어 지적 1)</b>: 재수렴 이전 코드는 {@code new
     * ThreadPoolTaskScheduler()}를 직접 생성해 {@code shutdown.await-termination}·{@code
     * .await-termination-period} property가 조용히 무시됐다(R1이 잡은 "silently-ignored
     * property"와 같은 결함 계열). {@code applicationTaskExecutor}가 이미 {@link
     * ThreadPoolTaskExecutorBuilder}로 이 문제를 피하고 있어 그 패턴을 스케줄러 축에도 맞췄다.
     * 단 {@code spring.task.scheduling.thread-name-prefix}는 의도적으로 계속 오버라이드한다 —
     * 두 풀(형제/outbox)이 서로 다른 접두어를 가져야 로그에서 구분되는데(결함2), 전역 property
     * 하나를 그대로 물려받으면 두 풀이 같은 접두어를 공유해 그 목적 자체가 무너진다.
     */
    private ThreadPoolTaskScheduler scheduler(
            ThreadPoolTaskSchedulerBuilder builder, String threadNamePrefix, int poolSize) {
        return builder.poolSize(poolSize).threadNamePrefix(threadNamePrefix).build();
    }

    /**
     * Boot 기본 {@code applicationTaskExecutor}({@code taskExecutor} alias 포함) 명시 복원
     * (결함1 — platform thread 분기). Boot 3.3.5와 동등하게 {@link ThreadPoolTaskExecutorBuilder}로
     * 생성한다.
     *
     * <p><b>전례와의 차이(같은 계열 — 함께 처리, R1 리뷰어 지적 2)</b>: slip-service {@code
     * PartnerProductPriceMemoryAsyncConfig}(R6-L3 바이트코드 실측)에 따르면 Boot 3.3.5의 PLATFORM
     * 분기는 deprecated {@code TaskExecutorBuilder}를 {@code ObjectProvider.getIfUnique()}로
     * 먼저 조회한 뒤 {@link ThreadPoolTaskExecutorBuilder}로 fallback하지만, 이 bean은 신형
     * builder만 직주입한다(deprecated builder 커스터마이즈 미지원 — 현재 이 서비스에 해당
     * 커스터마이즈가 0건이라 관측 가능한 차이는 없다). 전례 문서와 동일하게 이 차이를 명시한다.
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
     *
     * <p>전례(slip-service {@code PartnerProductPriceMemoryAsyncConfig})와의 차이(R6-L3 바이트코드
     * 실측 기준과 동일 관측): Boot 3.3.5 VIRTUAL 분기는 {@code @Lazy} 없이 eager인 반면 이 bean은
     * {@code @Lazy}를 부여한다 — 이 서비스도 PLATFORM 분기와 마찬가지로 Java 17 + virtual thread
     * 비활성이라 관측 가능한 차이는 없다.
     */
    @Lazy
    @ConditionalOnThreading(Threading.VIRTUAL)
    @Bean(name = {"applicationTaskExecutor", "taskExecutor"})
    public SimpleAsyncTaskExecutor applicationTaskExecutorVirtualThreads(
            SimpleAsyncTaskExecutorBuilder builder) {
        return builder.build();
    }
}
