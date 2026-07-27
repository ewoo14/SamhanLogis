package com.samhanair.logis.partnerorder.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.NoUniqueBeanDefinitionException;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.task.TaskExecutionAutoConfiguration;
import org.springframework.boot.autoconfigure.task.TaskSchedulingAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.task.TaskExecutor;
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
 *
 * <p><b>#888 재수렴 라운드 — G-4/G-5 추가.</b> G-2는 {@code applicationTaskExecutor}가 형제 풀과
 * "다른 인스턴스"임만 이름으로 직접 조회해 확인했을 뿐, {@code @Async}가 실제로 쓰는 모호성 해석
 * 경로({@code getBean(TaskExecutor.class)} → 실패 시 이름 "taskExecutor" fallback)는 한 번도
 * 타지 않았다 — 그래서 {@code taskScheduler}의 {@code @Primary}가 그 경로를 가로채 형제 풀로
 * 보내는 결함을 G-2가 놓쳤다(재수렴 라운드 실기동 재현, {@link
 * PartnerOrderTaskSchedulerConfiguration} 클래스 Javadoc 참조). G-4는 {@code @EnableAsync} 없이
 * 그 경로 자체를 직접 재현하고, G-5는 대칭 축인 기본 {@code TaskScheduler} 해석(이름
 * "taskScheduler" fallback)이 {@code @Primary} 제거 후에도 여전히 형제 풀 자신을 가리키는지
 * 고정한다(L-2 — 이 PR의 원래 목적인 outbox tick 격리가 훼손되지 않았는지의 회귀 가드).
 */
class PartnerOrderTaskSchedulerConfigurationExecutorCoexistenceTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(
                    TaskExecutionAutoConfiguration.class, TaskSchedulingAutoConfiguration.class))
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

    @Test
    void G4_async_기본_executor_해석은_형제_스케줄링_풀이나_outbox_풀로_귀결되면_안_된다() throws Exception {
        // #888 재수렴 라운드 — Spring AsyncExecutionAspectSupport.getDefaultExecutor(spring-aop
        // 6.1.14, AsyncExecutionAspectSupport.java:238-274)의 실제 알고리즘을 이 bean factory에
        // 직접 재현한다: ①TaskExecutor 타입으로 getBean 시도 ②NoUniqueBeanDefinitionException이면
        // 이름 "taskExecutor"로 fallback. @EnableAsync를 쓰지 않는 이유 — 이 결함은 AOP 프록시가
        // 아니라 이 두 줄의 bean 해석 알고리즘 자체이므로 프록시 없이도 정확히 같은 질문을 던질 수
        // 있고, 이 저장소는 @EnableAsync 0건을 프로덕션뿐 아니라 테스트에서도 유지한다.
        //
        // fix 전(taskScheduler에 @Primary가 있던 시점) 이 테스트는 RED였다 — getBean(TaskExecutor.class)가
        // NoUniqueBeanDefinitionException 없이 곧바로 @Primary 후보인 taskScheduler를 반환해
        // resolved가 applicationTaskExecutor가 아닌 siblingScheduler와 같았다.
        contextRunner.run(context -> {
            assertThat(context.getBeanNamesForType(TaskExecutor.class))
                    .as("이 결함이 재현 가능하려면 TaskExecutor 후보 3개(형제 taskScheduler·"
                            + "outboxTaskScheduler·applicationTaskExecutor)가 모두 존재해야 한다")
                    .containsExactlyInAnyOrder("taskScheduler", "outboxTaskScheduler", "applicationTaskExecutor");

            Executor resolved;
            try {
                resolved = context.getBean(TaskExecutor.class);
            } catch (NoUniqueBeanDefinitionException ex) {
                resolved = context.getBean("taskExecutor", Executor.class);
            }

            Executor applicationTaskExecutor = context.getBean("applicationTaskExecutor", Executor.class);
            TaskScheduler siblingScheduler = context.getBean("taskScheduler", TaskScheduler.class);
            TaskScheduler outboxScheduler = context.getBean("outboxTaskScheduler", TaskScheduler.class);

            assertThat(resolved)
                    .as("@Async 기본 executor 해석(Spring getDefaultExecutor)이 applicationTaskExecutor로"
                            + " 귀결돼야 한다 — 형제/outbox 스케줄링 풀로 새면 이 PR이 없앤 굶주림 구조가"
                            + " 스케줄링→비동기 실행 축에서 재발한다")
                    .isSameAs(applicationTaskExecutor)
                    .isNotSameAs(siblingScheduler)
                    .isNotSameAs(outboxScheduler);

            // resolved executor에 실제로 task를 제출해, 어느 스레드 풀에서 도는지도 직접 확인한다
            // (bean 정체성 비교만으로는 부족하다는 것이 바로 이번 재수렴 라운드가 잡은 교훈이다).
            CompletableFuture<String> threadName = new CompletableFuture<>();
            resolved.execute(() -> threadName.complete(Thread.currentThread().getName()));
            assertThat(threadName.get(5, TimeUnit.SECONDS))
                    .as("실제 실행 스레드도 형제/outbox 풀 접두어여서는 안 된다")
                    .doesNotStartWith("scheduling-")
                    .doesNotStartWith("outbox-");
        });
    }

    @Test
    void G5_기본_scheduler_해석은_이름_taskScheduler로_귀결돼_형제_풀을_그대로_가리킨다() {
        // #888 재수렴 라운드 — Spring TaskSchedulerRouter#determineDefaultScheduler(spring-context
        // 6.1.14, TaskSchedulerRouter.java:169-231)가 scheduler= 속성 없는 기본 @Scheduled에 대해
        // 수행하는 것과 같은 알고리즘: ①TaskScheduler 타입으로 유일성 조회 ②모호하면 이름
        // "taskScheduler"로 fallback. taskScheduler의 @Primary를 제거해도 이 fallback이 여전히
        // 형제 풀(5) 자신을 가리키는지 고정한다 — L-2(이 PR의 원래 목적인 outbox tick 격리 유지)의
        // 대칭 축 회귀 가드다.
        contextRunner.run(context -> {
            TaskScheduler resolved;
            try {
                resolved = context.getBean(TaskScheduler.class);
            } catch (NoUniqueBeanDefinitionException ex) {
                resolved = context.getBean("taskScheduler", TaskScheduler.class);
            }

            TaskScheduler siblingScheduler = context.getBean("taskScheduler", TaskScheduler.class);
            TaskScheduler outboxScheduler = context.getBean("outboxTaskScheduler", TaskScheduler.class);

            assertThat(resolved)
                    .as("scheduler= 속성 없는 기본 @Scheduled는 형제 풀(taskScheduler, pool 5)로"
                            + " 귀결돼야 한다 — outbox 전용 풀이나 임의의 로컬 폴백으로 새면 안 된다")
                    .isSameAs(siblingScheduler)
                    .isNotSameAs(outboxScheduler);
        });
    }
}
