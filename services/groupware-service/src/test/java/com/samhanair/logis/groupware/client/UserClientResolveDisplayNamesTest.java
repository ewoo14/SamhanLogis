package com.samhanair.logis.groupware.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.discovery.ServiceDiscoveryClient;
import com.samhanair.logis.userclient.UserVerifierProperties;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** groupware UserClient 표시명 bulk 조회 회귀 테스트. */
class UserClientResolveDisplayNamesTest {

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
    void resolveDisplayNames_uses_bulk_endpoint_once_and_returns_fullName_map() {
        UUID user1 = UUID.randomUUID();
        UUID user2 = UUID.randomUUID();

        server.expect(once(), requestTo("http://user-service/internal/users/display-names"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", "test-token"))
                .andExpect(jsonPath("$.userIds.length()").value(2))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"%s":"요청자","%s":"결재자"}}
                        """.formatted(user1, user2), MediaType.APPLICATION_JSON));

        Map<UUID, String> result = client.resolveDisplayNames(java.util.Arrays.asList(user1, user2, user1, null));

        assertThat(result).containsEntry(user1, "요청자").containsEntry(user2, "결재자");
        server.verify();
    }

    @Test
    void resolveDisplayNames_failure_returns_empty_map() {
        UUID userId = UUID.randomUUID();
        server.expect(once(), requestTo("http://user-service/internal/users/display-names"))
                .andRespond(withServerError());

        assertThat(client.resolveDisplayNames(List.of(userId))).isEmpty();
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
