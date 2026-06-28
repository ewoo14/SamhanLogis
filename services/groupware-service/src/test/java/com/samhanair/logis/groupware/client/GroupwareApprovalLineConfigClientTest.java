package com.samhanair.logis.groupware.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.approval.StepType;
import com.samhanair.logis.groupware.domain.ResolvedRole;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** 그룹웨어 결재라인 config client RestClient 계약 테스트. */
class GroupwareApprovalLineConfigClientTest {

    private MockRestServiceServer server;
    private GroupwareApprovalLineConfigClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken("test-internal-token");
        client = new GroupwareApprovalLineConfigClient(
                builder.baseUrl("http://auth-service").build(), props, new ObjectMapper());
    }

    @Test
    void fetchRoles_gets_internal_roles_and_expands_user_approvers() {
        UUID userId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        server.expect(once(), requestTo(
                        "http://auth-service/auth/internal/approval-line/roles?documentType=GROUPWARE_EXPENSE_REPORT"))
                .andExpect(header("X-Internal-Token", "test-internal-token"))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"configured":true,"roles":[
                          {"sequence":0,"label":"작성자","stepType":"CREATOR","approverGroupId":null,
                           "approverUserIds":[],"requiredPageCode":null,"required":true},
                          {"sequence":1,"label":"부서장","stepType":"GROUP","approverGroupId":"%s",
                           "approverUserIds":[],"requiredPageCode":"groupware.approvals","required":true},
                          {"sequence":2,"label":"대표","stepType":"USER","approverGroupId":null,
                           "approverUserIds":["%s"],"requiredPageCode":null,"required":true}
                        ]}}
                        """.formatted(groupId, userId), MediaType.APPLICATION_JSON));

        GroupwareApprovalLineConfigClient.ConfigLine line =
                client.fetchRoles("GROUPWARE_EXPENSE_REPORT");

        assertThat(line.configured()).isTrue();
        assertThat(line.roles()).extracting(ResolvedRole::stepType)
                .containsExactly(StepType.CREATOR, StepType.GROUP, StepType.USER);
        assertThat(line.roles().get(1).approverGroupId()).isEqualTo(groupId);
        assertThat(line.roles().get(2).approverUserId()).isEqualTo(userId);
        server.verify();
    }

    @Test
    void fetchRoles_parseFailure_returnsUnconfigured_failClosed() {
        server.expect(once(), requestTo(
                        "http://auth-service/auth/internal/approval-line/roles?documentType=GROUPWARE_EXPENSE_REPORT"))
                .andRespond(withSuccess("""
                        {"success":true}
                        """, MediaType.APPLICATION_JSON));

        GroupwareApprovalLineConfigClient.ConfigLine line =
                client.fetchRoles("GROUPWARE_EXPENSE_REPORT");

        assertThat(line.configured()).isFalse();
        assertThat(line.roles()).isEmpty();
        server.verify();
    }
}
