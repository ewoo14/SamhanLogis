package com.samhanair.logis.security.permission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.EnumSet;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class DefaultDynamicPermissionClientTest {

    @Test
    void check_calls_account_endpoint_with_internal_token() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        DefaultDynamicPermissionClient client =
                new DefaultDynamicPermissionClient(builder, "test-internal-token", "accounting-service");
        UUID accountId = UUID.fromString("a0000000-0000-0000-0000-000000000001");

        server.expect(requestTo("http://auth-service/auth/internal/permissions/check"
                        + "?accountId=a0000000-0000-0000-0000-000000000001"
                        + "&pageCode=accounting.tax-invoice.emit-nts&action=CREATE"))
                .andExpect(header("X-Internal-Token", "test-internal-token"))
                .andRespond(withSuccess("{\"success\":true,\"data\":{\"allowed\":true}}",
                        MediaType.APPLICATION_JSON));

        boolean allowed = client.check(accountId, "accounting.tax-invoice.emit-nts", PermissionAction.CREATE);

        assertThat(allowed).isTrue();
        server.verify();
    }

    @Test
    void bulkLoad_parses_page_action_map() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        DefaultDynamicPermissionClient client =
                new DefaultDynamicPermissionClient(builder, "test-internal-token", "accounting-service");
        UUID accountId = UUID.fromString("a0000000-0000-0000-0000-000000000002");

        server.expect(requestTo("http://auth-service/auth/internal/permissions/account/"
                        + "a0000000-0000-0000-0000-000000000002"))
                .andExpect(header("X-Internal-Token", "test-internal-token"))
                .andRespond(withSuccess("{\"success\":true,\"data\":{\"accounting.journals\":[\"VIEW\",\"DOWNLOAD\"]}}",
                        MediaType.APPLICATION_JSON));

        Map<String, EnumSet<PermissionAction>> result = client.bulkLoad(accountId);

        assertThat(result).containsEntry("accounting.journals",
                EnumSet.of(PermissionAction.VIEW, PermissionAction.DOWNLOAD));
        server.verify();
    }

    @Test
    void canView_calls_role_endpoint_with_internal_token_and_type() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        DefaultDynamicPermissionClient client =
                new DefaultDynamicPermissionClient(builder, "test-internal-token", "user-service");

        server.expect(requestTo("http://auth-service/auth/internal/permissions/check"
                        + "?roleCode=MANAGER&pageCode=admin.employees&type=VIEW"))
                .andExpect(header("X-Internal-Token", "test-internal-token"))
                .andExpect(header("X-User-Role", "MANAGER"))
                .andRespond(withSuccess("{\"success\":true,\"data\":{\"allowed\":true}}",
                        MediaType.APPLICATION_JSON));

        boolean allowed = client.canView("MANAGER", "admin.employees");

        assertThat(allowed).isTrue();
        server.verify();
    }

    @Test
    void canEdit_calls_role_endpoint_with_internal_token_and_type() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        DefaultDynamicPermissionClient client =
                new DefaultDynamicPermissionClient(builder, "test-internal-token", "accounting-service");

        server.expect(requestTo("http://auth-service/auth/internal/permissions/check"
                        + "?roleCode=ACCOUNTANT&pageCode=accounting.journals&type=EDIT"))
                .andExpect(header("X-Internal-Token", "test-internal-token"))
                .andExpect(header("X-User-Role", "ACCOUNTANT"))
                .andRespond(withSuccess("{\"success\":true,\"data\":{\"allowed\":false}}",
                        MediaType.APPLICATION_JSON));

        boolean allowed = client.canEdit("ACCOUNTANT", "accounting.journals");

        assertThat(allowed).isFalse();
        server.verify();
    }

    @Test
    void arologis_direct_permission_call_gets_200_with_non_empty_permission_response() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        DefaultDynamicPermissionClient client = new DefaultDynamicPermissionClient(
                builder,
                "http://auth-service",
                "test-internal-token",
                "arologis-service",
                "test-gateway-attestation");

        server.expect(requestTo("http://auth-service/auth/internal/permissions/check"
                        + "?roleCode=AROLOGIS_MASTER&pageCode=arologis.dispatch.manual&type=VIEW"))
                .andExpect(header("X-Internal-Token", "test-internal-token"))
                .andExpect(header("X-User-Role", "AROLOGIS_MASTER"))
                .andExpect(header("X-Samhan-Gateway-Attestation", "test-gateway-attestation"))
                .andRespond(withSuccess("{\"success\":true,\"data\":{\"allowed\":true}}",
                        MediaType.APPLICATION_JSON));

        boolean allowed = client.canView("AROLOGIS_MASTER", "arologis.dispatch.manual");

        assertThat(allowed).isTrue();
        server.verify();
    }
}
