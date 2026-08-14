package com.samhanair.logis.log.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.log.domain.AuditLog;
import com.samhanair.logis.log.repository.AuditLogRepository;
import com.samhanair.logis.log.web.ActivityLogSearchCondition;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.listener.RabbitListenerContainerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.mapping.IndexCoordinates;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.elasticsearch.ElasticsearchContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * DEV-3 활동 로그 검색 — <b>실 Elasticsearch(Testcontainers)</b> 질의 의미 검증.
 *
 * <p>Opus 라운드에서 P-item 으로 남긴 ES NativeQuery 런타임 검증을 closure 한다: optional 조건 AND 결합,
 * description text match, 기간 range, occurredAt desc 정렬, 빈 조건 match_all.
 */
@Testcontainers
@SpringBootTest(classes = com.samhanair.logis.log.LoggingServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE)
@TestPropertySource(properties = {
        "spring.profiles.active=local",
        "eureka.client.enabled=false",
        "eureka.client.register-with-eureka=false",
        "eureka.client.fetch-registry=false",
        "spring.rabbitmq.username=ci-test-user",
        "spring.rabbitmq.password=ci-test-password",
        "spring.autoconfigure.exclude=" +
                "org.springframework.boot.autoconfigure.amqp.RabbitAutoConfiguration," +
                "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration," +
                "org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration," +
                "org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration"
})
class AuditLogActivitySearchRealEsIT {

    @Container
    static final ElasticsearchContainer ES = new ElasticsearchContainer(
            DockerImageName.parse("docker.elastic.co/elasticsearch/elasticsearch:8.15.3"))
            .withEnv("xpack.security.enabled", "false")
            .withEnv("discovery.type", "single-node");

    @DynamicPropertySource
    static void elasticsearchProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.elasticsearch.uris", () -> "http://" + ES.getHttpHostAddress());
    }

    @MockBean
    private ConnectionFactory connectionFactory;

    @MockBean
    @SuppressWarnings("rawtypes")
    private RabbitListenerContainerFactory rabbitListenerContainerFactory;

    @Autowired
    private AuditLogRepository repository;

    @Autowired
    private ElasticsearchOperations operations;

    @BeforeEach
    void seed() {
        repository.deleteAll();
        // 의도적으로 occurredAt 오름차순(=desc 의 역순)으로 색인 — 빈 조건 desc 정렬이 실제로 재정렬함을 검증.
        repository.saveAll(List.of(
                row("a-3", "UPDATE", "MENU", "admin.app-release", "버전 관리 릴리스 수정", "2026-06-27T23:00:00Z"),
                row("a-2", "MENU_ACCESS", "MENU", "dev.popup-notice", "팝업공지 메뉴 진입", "2026-06-28T00:20:00Z"),
                row("a-1", "MENU_ACCESS", "MENU", "dev.activity-log", "로그 메뉴 진입", "2026-06-28T00:30:00Z")));
        operations.indexOps(IndexCoordinates.of("samhan-audit-logs")).refresh();
    }

    @Test
    @DisplayName("resourceId + action 조건은 AND 로 결합되어 단일 행만 반환한다")
    void andCombinesResourceIdAndAction() {
        Page<AuditLog> page = repository.searchActivity(
                new ActivityLogSearchCondition("MENU_ACCESS", "MENU", "dev.popup-notice", null, null, null, null),
                PageRequest.of(0, 20));
        assertThat(page.getContent()).hasSize(1);
        assertThat(page.getContent().get(0).getResourceId()).isEqualTo("dev.popup-notice");
    }

    @Test
    @DisplayName("q 는 description text match, 기간은 range — '릴리스' + 6/27~6/28 은 UPDATE 행만")
    void textMatchAndDateRange() {
        Page<AuditLog> page = repository.searchActivity(
                new ActivityLogSearchCondition(null, null, null, null, "릴리스",
                        Instant.parse("2026-06-27T00:00:00Z"), Instant.parse("2026-06-28T00:00:00Z")),
                PageRequest.of(0, 20));
        assertThat(page.getContent()).hasSize(1);
        assertThat(page.getContent().get(0).getAction()).isEqualTo("UPDATE");
    }

    @Test
    @DisplayName("빈 조건은 match_all 로 전체를 occurredAt desc 정렬해 반환한다")
    void emptyConditionReturnsAllSortedDesc() {
        Page<AuditLog> page = repository.searchActivity(
                new ActivityLogSearchCondition(null, null, null, null, null, null, null),
                PageRequest.of(0, 20, Sort.by(Sort.Direction.DESC, "occurredAt")));
        assertThat(page.getTotalElements()).isEqualTo(3);
        // 오름차순 색인을 desc pageable 이 재정렬해 occurredAt 내림차순(a-1 > a-2 > a-3)으로 반환해야 한다.
        assertThat(page.getContent()).extracting(AuditLog::getResourceId)
                .containsExactly("dev.activity-log", "dev.popup-notice", "admin.app-release");
    }

    private static AuditLog row(String id, String action, String resourceType, String resourceId,
            String description, String occurredAt) {
        return AuditLog.builder()
                .id(id)
                .serviceName("desktop")
                .userId("11111111-1111-1111-1111-111111111111")
                .userRole("DEVELOPER")
                .action(action)
                .resourceType(resourceType)
                .resourceId(resourceId)
                .description(description)
                .occurredAt(Instant.parse(occurredAt))
                .ingestedAt(Instant.parse(occurredAt))
                .build();
    }
}
