package com.samhanair.logis.arologis.it;

import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.RestClient;

/**
 * {@link ArologisMyPermissionsController} 계약 IT.
 *
 * <p>MockMvc 컨트롤러 호출에서 {@link AuthPermissionAdminClientImpl} 의 RestClient 를 거쳐
 * auth-service {@code /auth/internal/permissions/role-matrix?pagePrefix=arologis.} stub 까지 이어지는
 * 실 HTTP 변환 경로를 검증한다.
 */
@SpringBootTest(
                classes = {
                        ArologisServiceApplication.class,
                        ArologisMyPermissionsControllerIT.RestClientMockConfig.class,
                        GatewayAttestationMockMvcConfig.class
                },
        properties = {
                "samhan.auth-service.url=http://auth-service-stub",
                "app.security.internal.token=test-internal-token",
                "spring.main.allow-bean-definition-overriding=true",
                "eureka.client.enabled=false",
                "samhan.security.gateway-attestation=test-gateway-attestation"
        })
@AutoConfigureMockMvc
@ActiveProfiles("local")
class ArologisMyPermissionsControllerIT {

    private static final String BASE_URL = "http://auth-service-stub";
    private static final String TOKEN = "test-internal-token";
    private static final String CALLER = "arologis-service";
    private static final String MATRIX_ENDPOINT = BASE_URL
            + "/auth/internal/permissions/role-matrix?pagePrefix=arologis.";

    @Autowired
    private RestClientMockServerHolder mockServerHolder;

    private MockRestServiceServer server;

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private PartnerClient partnerClient;

    @MockBean
    private SlipClient slipClient;

    @MockBean
    private NotificationClient notificationClient;

    @MockBean
    private SlipServiceClient slipServiceClient;

    @BeforeEach
    void setUp() {
        server = mockServerHolder.server;
        server.reset();
    }

    @Test
    @WithMockUser(username = "arologis-master", authorities = {"ROLE_AROLOGIS_MASTER"})
    void arologis_master는_MASTER_row를_조회해_view와_편집_action을_반환한다() throws Exception {
        expectMatrix("""
                {"success":true,"data":{
                  "MASTER":{
                    "arologis.accounting.cashbook":{
                      "roleCode":"MASTER",
                      "pageCode":"arologis.accounting.cashbook",
                      "displayName":"현금출납장",
                      "canView":true,
                      "canEdit":true
                    }
                  }
                }}""");

        mockMvc.perform(get("/admin/arologis/permissions/my"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data['arologis.accounting.cashbook'][0]").value("VIEW"))
                .andExpect(jsonPath("$.data['arologis.accounting.cashbook'][1]").value("CREATE"))
                .andExpect(jsonPath("$.data['arologis.accounting.cashbook'][2]").value("UPDATE"))
                .andExpect(jsonPath("$.data['arologis.accounting.cashbook'][3]").value("DELETE"))
                .andExpect(jsonPath("$.data['arologis.accounting.cashbook'][4]").value("RESTORE"))
                .andExpect(jsonPath("$.data['arologis.accounting.cashbook'][5]").value("DOWNLOAD"))
                .andExpect(jsonPath("$.data['arologis.accounting.cashbook'][6]").value("PRINT"));

        server.verify();
    }

    @Test
    @WithMockUser(username = "arologis-accountant", authorities = {"ROLE_AROLOGIS_ACCOUNTANT"})
    void arologis_accountant는_ACCOUNTANT_row를_조회해_회계_page_action을_반환한다() throws Exception {
        expectMatrix("""
                {"success":true,"data":{
                  "ACCOUNTANT":{
                    "arologis.accounting.accounts":{
                      "roleCode":"ACCOUNTANT",
                      "pageCode":"arologis.accounting.accounts",
                      "displayName":"계정과목",
                      "canView":true,
                      "canEdit":false
                    }
                  }
                }}""");

        mockMvc.perform(get("/admin/arologis/permissions/my"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data['arologis.accounting.accounts'][0]").value("VIEW"))
                .andExpect(jsonPath("$.data['arologis.accounting.accounts'].length()").value(1));

        server.verify();
    }

    @Test
    @WithMockUser(username = "arologis-driver", authorities = {"ROLE_AROLOGIS_DRIVER"})
    void 매트릭스에_없는_롤은_빈_map을_200으로_반환한다() throws Exception {
        expectMatrix("""
                {"success":true,"data":{
                  "MASTER":{
                    "arologis.admin.permissions":{
                      "roleCode":"MASTER",
                      "pageCode":"arologis.admin.permissions",
                      "displayName":"권한 관리",
                      "canView":true,
                      "canEdit":true
                    }
                  }
                }}""");

        mockMvc.perform(get("/admin/arologis/permissions/my"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());

        server.verify();
    }

    @Test
    void 인증_없는_요청은_401_또는_403으로_차단한다() throws Exception {
        mockMvc.perform(get("/admin/arologis/permissions/my"))
                .andExpect(status().is4xxClientError())
                .andExpect(result -> {
                    int status = result.getResponse().getStatus();
                    org.assertj.core.api.Assertions.assertThat(status).isIn(401, 403);
                });

        server.verify();
    }

    @Test
    void role_authority_없는_헤더_spoof는_빈_권한으로_fail_closed한다() throws Exception {
        mockMvc.perform(get("/admin/arologis/permissions/my")
                        .header("X-User-Id", "spoof-001")
                        .header("X-User-Role", "AROLOGIS_MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());

        server.verify();
    }

    private void expectMatrix(String body) {
        server.expect(once(), requestTo(MATRIX_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", "system-internal:" + CALLER))
                .andExpect(header("X-User-Role", CALLER))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
    }

    @TestConfiguration
    static class RestClientMockConfig {

        @Bean
        RestClientMockServerHolder restClientMockServerHolder() {
            return new RestClientMockServerHolder();
        }

        @Bean
        @Primary
        RestClient.Builder restClientBuilder(RestClientMockServerHolder holder) {
            RestClient.Builder builder = RestClient.builder();
            holder.server = MockRestServiceServer.bindTo(builder).build();
            return builder;
        }
    }

    static class RestClientMockServerHolder {
        private MockRestServiceServer server;
    }
}
