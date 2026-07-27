package com.samhanair.logis.partnerorder.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.Executor;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.task.TaskExecutionAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * #888 적대검증 R1 결함1 — {@link PartnerOrderTaskSchedulerConfiguration}이 {@code taskScheduler}
 * bean({@code outboxTaskScheduler}도 동일)을 등록하는 순간, 그 bean이 {@code
 * org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler}이라 {@code
 * java.util.concurrent.Executor}도 구현한다. Boot 3.3의 {@code TaskExecutionAutoConfiguration}
 * ({@code TaskExecutorConfigurations.TaskExecutorConfiguration})은 클래스 레벨
 * {@code @ConditionalOnMissingBean(Executor.class)}이라, 이 서비스 클래스패스 최초의
 * {@code Executor} bean이 스케줄러가 되는 순간 back-off해 {@code applicationTaskExecutor}
 * ({@code taskExecutor} alias 포함)가 조용히 사라진다.
 *
 * <p>실기동 대조(actuator/prometheus, 결함 보고 원문): fix 전 브랜치(HEAD ff31b346e)는
 * {@code executor_pool_core_threads}에 {@code outboxTaskScheduler}(1)·{@code taskScheduler}(5)만
 * 남고 {@code applicationTaskExecutor}/{@code taskExecutor}는 소실됐다. main(#888 이전)은 둘 다
 * 존재했다({@code applicationTaskExecutor}=8, {@code taskScheduler}=5).
 *
 * <p>slip-service의 {@code PartnerProductPriceMemoryAsyncConfig}가 동일 함정을 이미 겪었고(전례:
 * {@code PartnerProductPriceMemoryAsyncConfigTest.priceMemoryExecutor_doesNotBackOffBootApplicationTaskExecutor}),
 * 이 테스트는 그 계약 검증 패턴을 partner-order-service에 그대로 옮긴 것이다.
 */
class PartnerOrderTaskSchedulerConfigurationExecutorCoexistenceTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(TaskExecutionAutoConfiguration.class))
            .withUserConfiguration(PartnerOrderTaskSchedulerConfiguration.class)
            .withPropertyValues("spring.task.scheduling.pool.size=5");

    @Test
    void 스케줄러_bean_등록이_Boot_기본_applicationTaskExecutor_자동구성을_back_off_시키면_안_된다() {
        contextRunner.run(context -> {
            assertThat(context).as("형제 전용 풀은 그대로 유지돼야 한다(G-3)").hasBean("taskScheduler");
            assertThat(context).as("outbox 전용 풀은 그대로 유지돼야 한다(G-3)").hasBean("outboxTaskScheduler");
            assertThat(context)
                    .as("PartnerOrderTaskSchedulerConfiguration의 ThreadPoolTaskScheduler bean이"
                            + " Boot 기본 applicationTaskExecutor 자동구성을 back-off 시키면 안 된다(G-1)")
                    .hasBean("applicationTaskExecutor");
            assertThat(context)
                    .as("@Async 기본 탐색 이름 taskExecutor alias도 유지돼야 한다(G-1)")
                    .hasBean("taskExecutor");
        });
    }

    @Test
    void 복원된_applicationTaskExecutor는_형제_스케줄링_풀과_별개_인스턴스여야_한다() {
        // G-2 — 향후 @Async 를 켜도 그 작업이 형제 스케줄링 풀(5)이나 outbox 전용 풀(1) 위에서
        // 돌면 안 된다. 이 PR이 없앤 굶주림 구조를 스케줄링→비동기 실행 축에서 재도입하지 않는지 고정.
        contextRunner.run(context -> {
            Executor applicationTaskExecutor = context.getBean("applicationTaskExecutor", Executor.class);
            Executor aliasedTaskExecutor = context.getBean("taskExecutor", Executor.class);
            TaskScheduler siblingScheduler = context.getBean("taskScheduler", TaskScheduler.class);
            TaskScheduler outboxScheduler = context.getBean("outboxTaskScheduler", TaskScheduler.class);

            assertThat(aliasedTaskExecutor).isSameAs(applicationTaskExecutor);
            assertThat(applicationTaskExecutor).isInstanceOf(ThreadPoolTaskExecutor.class);
            assertThat(applicationTaskExecutor)
                    .as("복원된 executor는 형제 taskScheduler와 다른 인스턴스여야 한다")
                    .isNotSameAs(siblingScheduler);
            assertThat(applicationTaskExecutor)
                    .as("복원된 executor는 outboxTaskScheduler와도 다른 인스턴스여야 한다")
                    .isNotSameAs(outboxScheduler);
        });
    }

    @Test
    void 형제_스케줄러_pool_크기_5는_executor_복원과_무관하게_유지된다() {
        // G-3 — 이 fix가 outbox tick 격리라는 원래 목적을 훼손하면 안 된다.
        contextRunner.run(context -> {
            org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler siblingScheduler =
                    context.getBean("taskScheduler",
                            org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler.class);
            org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler outboxScheduler =
                    context.getBean("outboxTaskScheduler",
                            org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler.class);

            assertThat(siblingScheduler.getScheduledThreadPoolExecutor().getCorePoolSize()).isEqualTo(5);
            assertThat(outboxScheduler.getScheduledThreadPoolExecutor().getCorePoolSize()).isEqualTo(1);
        });
    }
}
