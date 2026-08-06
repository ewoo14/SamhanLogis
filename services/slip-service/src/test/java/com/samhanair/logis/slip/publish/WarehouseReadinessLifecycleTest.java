package com.samhanair.logis.slip.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.client.WarehouseInternalClient;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceTransactionManagerAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.actuate.autoconfigure.security.servlet.ManagementWebSecurityAutoConfiguration;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.env.Environment;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.boot.WebApplicationType;
import org.springframework.web.client.DefaultResponseErrorHandler;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.http.ResponseEntity;

/** Spring Boot의 ApplicationReadyEvent 뒤 기본 readiness 전이를 포함한 회귀 테스트. */
class WarehouseReadinessLifecycleTest {

    private static final UUID HQ = UUID.fromString("11111111-1111-1111-1111-000000000001");
    private static final UUID HUB = UUID.fromString("11111111-1111-1111-1111-000000000002");
    private static final UUID ANSEONG = UUID.fromString("11111111-1111-1111-1111-000000000003");
    private static final UUID CHANGWON = UUID.fromString("11111111-1111-1111-1111-000000000004");
    private static volatile Controls activeControls;

    @Test
    void STRICT_alias_실패는_Boot의_후속_ACCEPTING_TRAFFIC에_덮이지_않는다() {
        try (ConfigurableApplicationContext context = start("STRICT", "UNAVAILABLE")) {
            WarehouseCodeMapper mapper = context.getBean(WarehouseCodeMapper.class);
            awaitStatus(mapper, "00003", WarehouseMappingStatus.UNAVAILABLE);
            awaitReadiness(context, ReadinessState.REFUSING_TRAFFIC);

            assertHealth(context, 503);
        }
    }

    @Test
    void STRICT_alias_지연은_기동과_Ready_반환을_막지_않고_검증_전에는_비성공이다() throws Exception {
        Controls controls = new Controls();
        activeControls = controls;
        try (ConfigurableApplicationContext context = start("STRICT", "DELAYED", controls)) {
            assertThat(controls.validationEntered.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(context.getBean(ApplicationAvailability.class).getReadinessState())
                    .isEqualTo(ReadinessState.REFUSING_TRAFFIC);
            assertHealth(context, 503);

            controls.validationRelease.countDown();
            awaitStatus(context.getBean(WarehouseCodeMapper.class), "00003",
                    WarehouseMappingStatus.VERIFIED);
            awaitStatus(context.getBean(WarehouseCodeMapper.class), "2",
                    WarehouseMappingStatus.VERIFIED);
            awaitReadiness(context, ReadinessState.ACCEPTING_TRAFFIC);
            assertHealth(context, 200);
        }
    }

    @Test
    void DEV_SUBSTITUTE는_외부_조회_없이_기동과_발행을_유지한다() {
        Controls controls = new Controls();
        activeControls = controls;
        try (ConfigurableApplicationContext context = start("DEV_SUBSTITUTE", "SUCCESS", controls)) {
            awaitReadiness(context, ReadinessState.ACCEPTING_TRAFFIC);

            assertThat(context.getBean(WarehouseCodeMapper.class).resolve("00003"))
                    .isEqualTo(HQ);
            verify(controls.client, never()).findEcountWarehouseAliases(anyCollection());
            assertHealth(context, 200);
        }
    }

    private static ConfigurableApplicationContext start(String mode, String behavior) {
        return start(mode, behavior, new Controls());
    }

    private static ConfigurableApplicationContext start(
            String mode, String behavior, Controls controls) {
        activeControls = controls;
        SpringApplication application = new SpringApplication(TestApplication.class);
        application.setWebApplicationType(WebApplicationType.SERVLET);
        return application.run(
                "--server.port=0",
                "--spring.main.banner-mode=off",
                "--app.test.mapping-mode=" + mode,
                "--app.test.behavior=" + behavior,
                "--app.publish.mapping-mode=" + mode,
                "--app.publish.warehouse-code-map.[00003]=" + HQ,
                "--app.publish.warehouse-code-map.[2]=" + HUB,
                "--app.publish.warehouse-code-map.[14]=" + ANSEONG,
                "--app.publish.warehouse-code-map.[1]=" + CHANGWON,
                "--eureka.client.enabled=false",
                "--spring.cloud.discovery.enabled=false",
                "--management.health.redis.enabled=false",
                "--management.endpoints.web.exposure.include=health",
                "--management.endpoint.health.probes.enabled=true",
                "--management.endpoint.health.group.readiness.include=readinessState");
    }

    private static void awaitStatus(
            WarehouseCodeMapper mapper, String code, WarehouseMappingStatus status) {
        Awaitility.await().atMost(Duration.ofSeconds(5)).untilAsserted(
                () -> assertThat(mapper.validationStatus(code)).isEqualTo(status));
    }

    private static void awaitReadiness(
            ConfigurableApplicationContext context, ReadinessState state) {
        Awaitility.await().atMost(Duration.ofSeconds(5)).untilAsserted(
                () -> assertThat(context.getBean(ApplicationAvailability.class).getReadinessState())
                        .isEqualTo(state));
    }

    private static void assertHealth(ConfigurableApplicationContext context, int status) {
        int port = ((org.springframework.boot.web.context.WebServerApplicationContext) context)
                .getWebServer().getPort();
        RestTemplate restTemplate = new RestTemplate();
        restTemplate.setErrorHandler(new DefaultResponseErrorHandler() {
            @Override
            public boolean hasError(ClientHttpResponse response) {
                return false;
            }
        });
        ResponseEntity<String> readiness = restTemplate.getForEntity(
                "http://localhost:" + port + "/actuator/health/readiness", String.class);
        ResponseEntity<String> overall = restTemplate.getForEntity(
                "http://localhost:" + port + "/actuator/health", String.class);

        assertThat(readiness.getStatusCode().value()).isEqualTo(status);
        assertThat(overall.getStatusCode().value()).isEqualTo(status);
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration(exclude = {
        DataSourceAutoConfiguration.class,
        DataSourceTransactionManagerAutoConfiguration.class,
        FlywayAutoConfiguration.class,
        HibernateJpaAutoConfiguration.class,
        SecurityAutoConfiguration.class,
        ManagementWebSecurityAutoConfiguration.class
    })
    static class TestApplication {

        @Bean
        WarehouseCodeMapper warehouseCodeMapper(Environment environment) {
            WarehouseCodeMapper mapper = new WarehouseCodeMapper();
            mapper.setMappingMode(environment.getProperty("app.test.mapping-mode", ""));
            mapper.setWarehouseCodeMap(Map.of(
                    "00003", HQ.toString(),
                    "2", HUB.toString(),
                    "14", ANSEONG.toString(),
                    "1", CHANGWON.toString()));
            return mapper;
        }

        @Bean
        WarehouseInternalClient warehouseInternalClient(Environment environment) {
            Controls controls = activeControls;
            WarehouseInternalClient client = mock(WarehouseInternalClient.class);
            controls.client = client;
            String behavior = environment.getProperty("app.test.behavior", "UNAVAILABLE");
            if ("SUCCESS".equals(behavior)) {
                when(client.findEcountWarehouseAliases(anyCollection()))
                        .thenReturn(Map.of(
                                "00003", new WarehouseInternalClient.EcountWarehouseAlias("00003", HQ),
                                "2", new WarehouseInternalClient.EcountWarehouseAlias("2", HUB),
                                "14", new WarehouseInternalClient.EcountWarehouseAlias("14", ANSEONG),
                                "1", new WarehouseInternalClient.EcountWarehouseAlias("1", CHANGWON)));
            } else if ("DELAYED".equals(behavior)) {
                when(client.findEcountWarehouseAliases(anyCollection())).thenAnswer(invocation -> {
                    controls.validationEntered.countDown();
                    assertThat(controls.validationRelease.await(5, TimeUnit.SECONDS)).isTrue();
                    return Map.of(
                            "00003", new WarehouseInternalClient.EcountWarehouseAlias("00003", HQ),
                            "2", new WarehouseInternalClient.EcountWarehouseAlias("2", HUB),
                            "14", new WarehouseInternalClient.EcountWarehouseAlias("14", ANSEONG),
                            "1", new WarehouseInternalClient.EcountWarehouseAlias("1", CHANGWON));
                });
            } else {
                when(client.findEcountWarehouseAliases(anyCollection()))
                        .thenThrow(new WarehouseInternalClient.WarehouseAliasUnavailableException(
                                "test unavailable", null));
            }
            return client;
        }

        @Bean(name = "applicationTaskExecutor")
        ThreadPoolTaskExecutor applicationTaskExecutor() {
            ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
            executor.setCorePoolSize(1);
            executor.setMaxPoolSize(1);
            executor.setQueueCapacity(1);
            executor.setThreadNamePrefix("warehouse-readiness-test-");
            return executor;
        }

        @Bean
        WarehouseMappingValidationService warehouseMappingValidationService(
                WarehouseCodeMapper mapper,
                WarehouseInternalClient client,
                @Qualifier("applicationTaskExecutor")
                TaskExecutor taskExecutor,
                ApplicationEventPublisher eventPublisher) {
            return new WarehouseMappingValidationService(mapper, client, taskExecutor, eventPublisher);
        }
    }

    private static final class Controls {
        private final CountDownLatch validationEntered = new CountDownLatch(1);
        private final CountDownLatch validationRelease = new CountDownLatch(1);
        private WarehouseInternalClient client;
    }
}
