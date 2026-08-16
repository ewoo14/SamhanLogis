package com.samhanair.logis.partnerorder.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.never;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** AuthAccountLookupClient service-to-service RestClient contract test. */
class AuthAccountLookupClientTest {

    private static final String TOKEN = "test-internal-token";
    private static final String ENDPOINT =
            "http://auth-service/auth/internal/accounts/by-login?loginId=partner-manager";

    private MockRestServiceServer server;
    private AuthAccountLookupClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://auth-service");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new AuthAccountLookupClient(builder.build(), props(TOKEN), new ObjectMapper());
    }

    @Test
    void sendsInternalTokenAndParsesEnvelopeAccountId() {
        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"accountId":"00000000-0000-0000-0000-000000000501"}}
                        """, MediaType.APPLICATION_JSON));

        Optional<UUID> result = client.findAccountIdByLoginId("partner-manager");

        assertThat(result).contains(UUID.fromString("00000000-0000-0000-0000-000000000501"));
        server.verify();
    }

    @Test
    void acceptsOpaqueEnvelopeAccountId() {
        server.expect(once(), requestTo(ENDPOINT))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"accountId":"AAAAAAAAAAAAAAAAAAAAAA"}}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.findAccountIdByLoginId("partner-manager"))
                .contains(UUID.fromString("00000000-0000-0000-0000-000000000000"));
        server.verify();
    }

    @Test
    void returnsEmptyOnNotFoundAndServerError() {
        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withServerError());

        assertThat(client.findAccountIdByLoginId("partner-manager")).isEmpty();
        assertThat(client.findAccountIdByLoginId("partner-manager")).isEmpty();
        server.verify();
    }

    @Test
    void skipsRequestWhenTokenIsBlank() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://auth-service");
        MockRestServiceServer noCallServer = MockRestServiceServer.bindTo(builder).build();
        AuthAccountLookupClient noTokenClient =
                new AuthAccountLookupClient(builder.build(), props(""), new ObjectMapper());

        noCallServer.expect(never(), requestTo(ENDPOINT));

        assertThat(noTokenClient.findAccountIdByLoginId("partner-manager")).isEmpty();
        noCallServer.verify();
    }

    private static InternalAuthProperties props(String token) {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(token);
        return props;
    }
}
