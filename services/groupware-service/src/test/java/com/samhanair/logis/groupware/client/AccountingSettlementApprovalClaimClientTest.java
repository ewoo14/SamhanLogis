package com.samhanair.logis.groupware.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** groupware → accounting claim 내부 API 계약 테스트. */
class AccountingSettlementApprovalClaimClientTest {

    private MockRestServiceServer server;
    private AccountingSettlementApprovalClaimClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken("test-internal-token");
        client = new AccountingSettlementApprovalClaimClient(
                builder.baseUrl("http://accounting-service").build(), props, new ObjectMapper());
    }

    @Test
    void reserve_sendsDocumentNumberApprovalOwnerAndInternalToken() {
        UUID approvalId = UUID.randomUUID();
        UUID claimToken = UUID.randomUUID();
        server.expect(once(), requestTo(
                        "http://accounting-service/internal/accounting/settlement-approval-claims"))
                .andExpect(header("X-Internal-Token", "test-internal-token"))
                .andExpect(jsonPath("$.documentNo").value("2026/08/11-3"))
                .andExpect(jsonPath("$.approvalId").value(approvalId.toString()))
                .andRespond(withSuccess(
                        "{\"success\":true,\"data\":{\"claimToken\":\"" + claimToken
                                + "\",\"status\":\"RESERVED\",\"expiresAt\":\"2026-08-11T12:00:30\"}}",
                        MediaType.APPLICATION_JSON));

        assertThat(client.reserve("2026/08/11-3", approvalId)).isEqualTo(claimToken);
        server.verify();
    }
}
