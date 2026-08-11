package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** groupware 정산 결재 상태 내부 endpoint 계약 테스트. */
class GroupwareSettlementApprovalClientTest {

    private MockRestServiceServer server;
    private GroupwareSettlementApprovalClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken("test-internal-token");
        client = new GroupwareSettlementApprovalClient(
                builder.baseUrl("http://groupware-service").build(), props, new ObjectMapper());
    }

    @Test
    void hasActiveApproval_sendsDocumentNumberAndInternalToken() {
        server.expect(once(), requestTo(
                        "http://groupware-service/internal/groupware/settlement-approvals/active?documentNo=2026/08/11-1"))
                .andExpect(header("X-Internal-Token", "test-internal-token"))
                .andRespond(withSuccess(
                        "{\"success\":true,\"data\":true}",
                        org.springframework.http.MediaType.APPLICATION_JSON));

        assertThat(client.hasActiveSettlementApproval("2026/08/11-1")).isTrue();
        server.verify();
    }
}
