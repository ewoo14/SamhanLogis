package com.samhanair.logis.groupware.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.discovery.ServiceDiscoveryClient;
import com.samhanair.logis.userclient.UserVerifierProperties;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.slf4j.LoggerFactory;

/**
 * groupware UserClient.search(q, limit, activeOnly) 실 HTTP 계약 테스트.
 *
 * <p>{@code activeOnly=true} 배선이 검증 없이 뮤테이션되면 어떤 테스트도 잡지 못한다는 실측(§검증 결함)에
 * 대응한다 — 쿼리 파라미터 존재/부재를 실제 요청에서 확인한다.
 */
class UserClientSearchActiveOnlyTest {

    private MockRestServiceServer server;
    private UserClient client;

    @BeforeEach
    void setup() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new UserClient(builder, noopDiscovery(), "http://user-service",
                UserVerifierProperties.FailMode.OPEN, "test-token", new ObjectMapper());
    }

    @Test
    void search_activeOnly_true이면_activeOnly_쿼리파라미터를_전달한다() {
        UUID userId = UUID.randomUUID();
        server.expect(once(), requestTo(org.hamcrest.Matchers.startsWith("http://user-service/internal/users/search")))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", "test-token"))
                .andExpect(queryParam("activeOnly", "true"))
                .andRespond(withSuccess("""
                        {"success":true,"data":[{"userId":"%s","fullName":"수신자","departmentName":"영업팀","ecountCode":"EMP-1"}]}
                        """.formatted(userId), MediaType.APPLICATION_JSON));

        List<UserClient.ApproverSummary> result = client.search("수신", 20, true);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).employeeCode()).isEqualTo("EMP-1");
        server.verify();
    }

    @Test
    void search_activeOnly_기본값_false이면_activeOnly_쿼리파라미터를_보내지_않는다() {
        UUID userId = UUID.randomUUID();
        server.expect(once(), requestTo(org.hamcrest.Matchers.startsWith("http://user-service/internal/users/search")))
                .andExpect(method(HttpMethod.GET))
                .andExpect(request -> assertThat(request.getURI().toString()).doesNotContain("activeOnly"))
                .andRespond(withSuccess("""
                        {"success":true,"data":[{"userId":"%s","fullName":"결재자","departmentName":"임원실"}]}
                        """.formatted(userId), MediaType.APPLICATION_JSON));

        // 2-arg 오버로드(결재자 picker) — activeOnly 파라미터를 붙이지 않아야 한다.
        List<UserClient.ApproverSummary> result = client.search("결재", 20);

        assertThat(result).hasSize(1);
        server.verify();
    }

    @Test
    void verifyActiveBulk는_발송직전_재직검증_endpoint와_payload를_사용한다() {
        UUID active = UUID.randomUUID();
        UUID terminated = UUID.randomUUID();
        server.expect(once(), requestTo("http://user-service/internal/users/verify-active-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", "test-token"))
                .andExpect(content().json("""
                        {"userIds":["%s","%s"]}
                        """.formatted(active, terminated)))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"exists":{"%s":true,"%s":false}}}
                        """.formatted(active, terminated), MediaType.APPLICATION_JSON));

        assertThat(client.verifyActiveBulk(List.of(active, terminated)))
                .containsEntry(active, true)
                .containsEntry(terminated, false);
        server.verify();
    }

    @Test
    void verifyActiveBulk_실패시_fail_closed와_운영로그를_남긴다() {
        UUID userId = UUID.randomUUID();
        server.expect(once(), requestTo("http://user-service/internal/users/verify-active-bulk"))
                .andRespond(withServerError());

        Logger logger = (Logger) LoggerFactory.getLogger(UserClient.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            assertThat(client.verifyActiveBulk(List.of(userId)))
                    .containsEntry(userId, false);
            server.verify();
            assertThat(appender.list).anySatisfy(event -> {
                assertThat(event.getLevel()).isEqualTo(Level.ERROR);
                assertThat(event.getFormattedMessage())
                        .contains("verify-active-bulk")
                        .contains("fail-closed");
                assertThat(event.getThrowableProxy()).isNotNull();
            });
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @Test
    void resolveProfile은_실제직원의_부서와_사번을_함께반환한다_RED() {
        UUID userId = UUID.randomUUID();
        server.expect(once(), requestTo("http://user-service/internal/users/" + userId))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"id":"%s","fullName":"김개발","departmentName":"플랫폼팀","ecountCode":"E001"}}
                        """.formatted(userId), MediaType.APPLICATION_JSON));

        assertThat(client.resolveProfile(userId)).get().extracting(UserClient.UserProfile::department, UserClient.UserProfile::employeeCode)
                .containsExactly("플랫폼팀", "E001");
        server.verify();
    }

    private ServiceDiscoveryClient noopDiscovery() {
        return new ServiceDiscoveryClient() {
            @Override public void register(String serviceName, String host, int port) { }
            @Override public void deregister(String serviceName) { }
            @Override public List<com.samhanair.logis.discovery.ServiceInstance> lookup(String serviceName) {
                return List.of();
            }
            @Override public boolean healthcheck(String serviceName) {
                return false;
            }
        };
    }
}
