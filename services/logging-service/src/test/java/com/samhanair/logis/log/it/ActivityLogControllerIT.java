package com.samhanair.logis.log.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.log.LoggingServiceApplication;
import com.samhanair.logis.log.domain.AuditLog;
import com.samhanair.logis.log.repository.AuditLogRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.listener.RabbitListenerContainerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

/** DEV-3 활동 로그 HTTP 계약 통합 테스트. */
@SpringBootTest(
        classes = LoggingServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT
)
@TestPropertySource(properties = {
        "spring.profiles.active=local",
        "eureka.client.enabled=false",
        "eureka.client.register-with-eureka=false",
        "eureka.client.fetch-registry=false",
        "spring.rabbitmq.username=ci-test-user",
        "spring.rabbitmq.password=ci-test-password",
        "spring.autoconfigure.exclude=" +
                "org.springframework.boot.autoconfigure.elasticsearch.ElasticsearchRestClientAutoConfiguration," +
                "org.springframework.boot.autoconfigure.data.elasticsearch.ElasticsearchDataAutoConfiguration," +
                "org.springframework.boot.autoconfigure.data.elasticsearch.ElasticsearchRepositoriesAutoConfiguration," +
                "org.springframework.boot.autoconfigure.amqp.RabbitAutoConfiguration," +
                "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration," +
                "org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration," +
                "org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration"
        ,"app.security.internal.token=test-internal-token"
})
class ActivityLogControllerIT {

    private static final UUID DEVELOPER_ACCOUNT = UUID.fromString("11111111-1111-1111-1111-111111111111");

    @Autowired
    private TestRestTemplate restTemplate;

    @MockBean
    private AuditLogRepository auditLogRepository;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @MockBean
    private ConnectionFactory connectionFactory;

    @MockBean
    @SuppressWarnings("rawtypes")
    private RabbitListenerContainerFactory rabbitListenerContainerFactory;

    @Test
    @DisplayName("DEVELOPER 권한 보유자는 /logs/activity 다중 필터 검색을 200으로 조회한다")
    void activitySearchAllowsDeveloperWithPermission() {
        when(dynamicPermissionClient.check(DEVELOPER_ACCOUNT, "dev.activity-log", PermissionAction.VIEW))
                .thenReturn(true);
        when(auditLogRepository.searchActivity(any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(AuditLog.builder()
                        .serviceName("desktop")
                        .userId(DEVELOPER_ACCOUNT.toString())
                        .userRole("DEVELOPER")
                        .action("MENU_ACCESS")
                        .resourceType("MENU")
                        .resourceId("dev.activity-log")
                        .description("로그 메뉴 진입")
                        .occurredAt(Instant.parse("2026-06-28T00:30:00Z"))
                        .build())));

        ResponseEntity<String> response = restTemplate.exchange(
                "/logs/activity?action=MENU_ACCESS&resourceType=MENU&resourceId=dev.activity-log&q=%EB%A1%9C%EA%B7%B8&page=0&size=20",
                HttpMethod.GET,
                new HttpEntity<>(headers()),
                String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).contains("로그 메뉴 진입");
        assertThat(response.getBody()).doesNotContain(DEVELOPER_ACCOUNT.toString());
    }

    @Test
    @DisplayName("dev.activity-log VIEW 권한이 없으면 /logs/activity는 403을 반환한다")
    void activitySearchDeniesWithoutPermission() {
        when(dynamicPermissionClient.check(DEVELOPER_ACCOUNT, "dev.activity-log", PermissionAction.VIEW))
                .thenReturn(false);

        ResponseEntity<String> response = restTemplate.exchange(
                "/logs/activity?page=0&size=20",
                HttpMethod.GET,
                new HttpEntity<>(headers()),
                String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("/logs/front는 인증된 MENU_ACCESS 프론트 이벤트를 수집한다")
    void frontEventCollectsMenuAccess() {
        String body = """
                {
                  "action":"MENU_ACCESS",
                  "resourceType":"MENU",
                  "resourceId":"dev.activity-log",
                  "userId":"11111111-1111-1111-1111-111111111111",
                  "userRole":"DEVELOPER",
                  "description":"로그 메뉴 진입",
                  "occurredAt":"2026-06-28T00:30:00Z"
                }
                """;
        HttpHeaders headers = headers();
        headers.add(HttpHeaders.CONTENT_TYPE, "application/json");

        ResponseEntity<String> response = restTemplate.exchange(
                "/logs/front",
                HttpMethod.POST,
                new HttpEntity<>(body, headers),
                String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(auditLogRepository).save(any(AuditLog.class));
    }

    private static HttpHeaders headers() {
        HttpHeaders headers = new HttpHeaders();
        headers.add("X-User-Id", DEVELOPER_ACCOUNT.toString());
        headers.add("X-User-Role", "DEVELOPER");
        headers.add("X-User-Groups", "00000000-0000-0000-0000-000000000109");
        headers.add("X-Internal-Token", "test-internal-token");
        return headers;
    }
}
