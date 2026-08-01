package com.samhanair.logis.slip.price.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.config.SlipDataSourceConfig;
import java.lang.reflect.Method;
import java.util.concurrent.Executor;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.condition.ConditionalOnThreading;
import org.springframework.boot.autoconfigure.task.TaskExecutionAutoConfiguration;
import org.springframework.boot.autoconfigure.thread.Threading;
import org.springframework.boot.task.SimpleAsyncTaskExecutorBuilder;
import org.springframework.boot.task.ThreadPoolTaskExecutorBuilder;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.DependsOn;
import org.springframework.core.task.SimpleAsyncTaskExecutor;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.transaction.TransactionManager;

/**
 * PartnerProductPriceMemoryAsyncConfig — executor 빈 공존 + 전용 pool 결속 계약 테스트.
 *
 * <p>{@link SlipDataSourceConfig} 를 함께 등록하는 이유는 두 가지다 — (1) executor 의
 * {@code @DependsOn("priceMemoryDataSource")}(R8-BE-7) 가 그 빈을 요구하고, (2) 두 DataSource 공존과
 * {@code @Primary} 배선(R8-BE-4 함정 ②) 자체가 검증 대상이기 때문이다.
 */
class PartnerProductPriceMemoryAsyncConfigTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(TaskExecutionAutoConfiguration.class))
            .withUserConfiguration(SlipDataSourceConfig.class,
                    PartnerProductPriceMemoryAsyncConfig.class);

    @Test
    void priceMemoryExecutor_doesNotBackOffBootApplicationTaskExecutor() {
        // R4-B1 — priceMemoryExecutor 가 slip-service 유일 Executor 빈이 되면 Boot 3.3
        // TaskExecutionAutoConfiguration(@ConditionalOnMissingBean(Executor.class))의
        // applicationTaskExecutor 자동구성이 back-off 되어, 향후 @Async 도입 시 무관한 비동기
        // 작업이 가격기억 4스레드 AbortPolicy 풀을 조용히 잡는 트랩이 생긴다.
        // 명시 복원 빈이 두 풀의 공존을 보장하는지 검증한다.
        contextRunner.run(context -> {
            assertThat(context).hasBean("priceMemoryExecutor");
            assertThat(context).hasBean("applicationTaskExecutor");

            Executor applicationTaskExecutor = context.getBean("applicationTaskExecutor", Executor.class);
            Executor aliasedTaskExecutor = context.getBean("taskExecutor", Executor.class);
            Executor priceMemoryExecutor = context.getBean("priceMemoryExecutor", Executor.class);

            // @Async 의 기본 탐색 이름(taskExecutor)은 Boot 기본 풀을 가리키고,
            // 가격기억 전용 풀과는 서로 다른 인스턴스로 격리되어야 한다.
            assertThat(aliasedTaskExecutor).isSameAs(applicationTaskExecutor);
            assertThat(applicationTaskExecutor).isNotSameAs(priceMemoryExecutor);
            assertThat(applicationTaskExecutor).isInstanceOf(ThreadPoolTaskExecutor.class);
        });
    }

    @Test
    void priceMemoryExecutor_keepsDedicatedBoundedPoolSettings() {
        // applicationTaskExecutor 복원이 가격기억 전용 bounded 풀 설정을 오염시키지 않는지 고정한다.
        contextRunner.run(context -> {
            ThreadPoolTaskExecutor executor =
                    context.getBean("priceMemoryExecutor", ThreadPoolTaskExecutor.class);

            assertThat(executor.getThreadNamePrefix()).isEqualTo("price-memory-");
            assertThat(executor.getCorePoolSize()).isEqualTo(2);
            assertThat(executor.getMaxPoolSize()).isEqualTo(4);
        });
    }

    @Test
    void applicationTaskExecutor_declaresBootEquivalentPlatformAndVirtualThreadBranches()
            throws NoSuchMethodException {
        Method platform = PartnerProductPriceMemoryAsyncConfig.class.getDeclaredMethod(
                "applicationTaskExecutor", ThreadPoolTaskExecutorBuilder.class);
        Method virtual = PartnerProductPriceMemoryAsyncConfig.class.getDeclaredMethod(
                "applicationTaskExecutorVirtualThreads", SimpleAsyncTaskExecutorBuilder.class);

        assertThat(platform.getAnnotation(ConditionalOnThreading.class).value())
                .isEqualTo(Threading.PLATFORM);
        assertThat(platform.getReturnType()).isEqualTo(ThreadPoolTaskExecutor.class);
        assertThat(virtual.getAnnotation(ConditionalOnThreading.class).value())
                .isEqualTo(Threading.VIRTUAL);
        assertThat(virtual.getReturnType()).isEqualTo(SimpleAsyncTaskExecutor.class);
    }

    @Test
    void mainHikariConnectionAcquisitionWait_bindsOperatorKnobWithFleetStandardThirtySecondDefault() {
        // [R6-M2] 종전에는 resolved 값 리터럴만 단언해, 운영자가 DB_CONNECTION_TIMEOUT_MS 를
        // export 하는 순간 테스트가 깨졌다 (노브와 테스트 상호배타). 노브 "바인딩 자체"와
        // 기본값을 각각 검증해 노브 사용과 양립시킨다.
        // 1) 노브 배선 — system property 는 OS env 보다 우선 조회되므로 (StandardEnvironment
        //    property source 순서) 실행 셸의 env export 여부와 무관하게 결정적이다.
        contextRunner.withSystemProperties("DB_CONNECTION_TIMEOUT_MS=7333")
                .run(context -> assertThat(context.getEnvironment()
                        .getProperty("spring.datasource.hikari.connection-timeout"))
                        .isEqualTo("7333"));
        // 2) [D-R8-2] 기본값 30000 = fleet 표준(Hikari 기본) 복원. 종전 4000 전역화는 가격기억
        //    fail-soft 정책을 사용자 요청 경로에 흘려 pool 포화 시 HTTP 500 을 유발했다.
        String expectedDefault = System.getenv().getOrDefault("DB_CONNECTION_TIMEOUT_MS", "30000");
        contextRunner.run(context -> assertThat(context.getEnvironment()
                .getProperty("spring.datasource.hikari.connection-timeout"))
                .isEqualTo(expectedDefault));
    }

    @Test
    void priceMemoryPool_keepsFourSecondAcquisitionWaitIsolatedFromMainPool() {
        // [D-R8-2 / R8-BE-4] 가격기억의 빠른 fail-soft(4초)는 유지하되 전용 pool 에만 가둔다.
        // 두 값이 같아지면 격리가 무의미해지므로 "메인 30초 / 전용 4초" 를 함께 고정한다.
        String expectedPriceMemoryDefault = System.getenv()
                .getOrDefault("SAMHAN_PRICE_MEMORY_DB_CONNECTION_TIMEOUT_MS", "4000");
        contextRunner.run(context -> {
            assertThat(context.getEnvironment().getProperty(
                    "app.slip.price-memory.datasource.hikari.connection-timeout"))
                    .isEqualTo(expectedPriceMemoryDefault);
            assertThat(context.getEnvironment().getProperty(
                    "app.slip.price-memory.datasource.hikari.connection-timeout"))
                    .isNotEqualTo(context.getEnvironment()
                            .getProperty("spring.datasource.hikari.connection-timeout"));
        });
        contextRunner.withSystemProperties("SAMHAN_PRICE_MEMORY_DB_CONNECTION_TIMEOUT_MS=1234")
                .run(context -> assertThat(context.getEnvironment().getProperty(
                        "app.slip.price-memory.datasource.hikari.connection-timeout"))
                        .isEqualTo("1234"));
    }

    @Test
    void dedicatedDataSourceTrio_coexistsWithPrimaryMainDataSource() {
        // [R8-BE-4 함정 ①②] 두 번째 DataSource 등록 시 DataSourceAutoConfiguration 이 back-off
        // 하므로 메인은 @Primary 로 명시 선언해야 하고(②), 전용 TM·JdbcTemplate 은 반드시 전용
        // DataSource 와 같은 인스턴스에 묶여야 set_config(is_local=true) 가 upsert 에 적용된다(①).
        contextRunner.run(context -> {
            assertThat(context).hasBean("dataSource");
            assertThat(context).hasBean("priceMemoryDataSource");

            DataSource main = context.getBean(DataSource.class); // @Primary 해석
            DataSource priceMemory = context.getBean("priceMemoryDataSource", DataSource.class);
            assertThat(main).isNotSameAs(priceMemory);
            assertThat(main).isSameAs(context.getBean("dataSource", DataSource.class));

            // TM·JdbcTemplate 이 전용 DataSource 와 동일 인스턴스로 결속됐는지 (함정 ① 가드)
            SlipDataSourceConfig.PriceMemoryJdbcAccess access =
                    context.getBean(SlipDataSourceConfig.PriceMemoryJdbcAccess.class);
            assertThat(access.dataSource()).isSameAs(priceMemory);
            assertThat(access.jdbcTemplate().getDataSource()).isSameAs(priceMemory);
            assertThat(access.transactionManager())
                    .isInstanceOfSatisfying(DataSourceTransactionManager.class, dstm ->
                            assertThat(dstm.getDataSource()).isSameAs(priceMemory));

            // [함정 ② 확장] 전용 JDBC 3종은 JdbcOperations/TransactionManager 타입 빈으로
            // 등록하면 안 된다 — 등록하는 순간 Boot 의 자동구성 jdbcTemplate 과
            // JpaTransactionManager 가 조용히 back-off 한다 (실측 확인).
            assertThat(context.getBeanNamesForType(JdbcOperations.class))
                    .as("주 JdbcTemplate 만 JdbcOperations 빈으로 존재하고 전용 JdbcTemplate 은 타입 빈으로 노출하지 않는다")
                    .containsExactly("jdbcTemplate");
            assertThat(context.getBeanNamesForType(TransactionManager.class))
                    .as("전용 TM 이 TransactionManager 빈으로 새면 JpaTransactionManager 가 back-off")
                    .isEmpty();
        });
    }

    @Test
    void priceMemoryExecutor_declaresDependencyOnDedicatedDataSourceForShutdownOrdering() throws Exception {
        // [R8-BE-7] Spring 은 의존 빈을 먼저 파괴한다 — 이 선언이 executor 의 5초 drain 을 Hikari
        // close() 이전에 끝내 배포마다 큐 유실이 나는 것을 막는다. 애노테이션이 사라지면 파괴
        // 순서가 다시 무제약이 되므로 선언 자체를 고정한다.
        Method executorBean = PartnerProductPriceMemoryAsyncConfig.class.getDeclaredMethod(
                "priceMemoryExecutor", PartnerProductPriceMemoryProperties.class);

        assertThat(executorBean.getAnnotation(DependsOn.class)).isNotNull();
        assertThat(executorBean.getAnnotation(DependsOn.class).value())
                .containsExactly("priceMemoryDataSource");
    }
}
