package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.security.permission.DefaultDynamicPermissionClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.RestClient;

/** G-1/G-2 accounting.receivables @RequirePermission 실 DPC 호출 enforcement 검증. */
@SpringBootTest(classes = {
        AccountingServiceApplication.class,
        ReceivablesPermissionEnforcementIT.RestClientMockConfig.class
})
@AutoConfigureMockMvc
@Import(com.samhanair.logis.security.test.GatewayAttestationMockMvcConfig.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@TestPropertySource(properties = "spring.main.allow-bean-definition-overriding=true")
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
class ReceivablesPermissionEnforcementIT {

    private static final String PAGE_CODE = "accounting.receivables";
    private static final String INTERNAL_TOKEN = "test-internal-token";
    private static final UUID MANAGER_ACCOUNT = UUID.fromString("a0000000-0000-0000-0000-000000000003");
    private static final UUID ACCOUNTANT_ACCOUNT = UUID.fromString("a0000000-0000-0000-0000-000000000005");
    private static final UUID SALES_ACCOUNT = UUID.fromString("a0000000-0000-0000-0000-000000000004");
    private static final UUID PARTNER_ID = UUID.fromString("00000000-0000-0000-0000-00000000e201");
    private static final PartnerSummary PARTNER =
            new PartnerSummary(PARTNER_ID, "P-RCV-001", "채권권한상사", "222-22-22222", "서울");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private RestClientMockServerHolder restClientMockServerHolder;

    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private SlipQueryClient slipQueryClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;

    @DynamicPropertySource
    static void registerDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", AbstractPostgresIT.POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", AbstractPostgresIT.POSTGRES::getUsername);
        registry.add("spring.datasource.password", AbstractPostgresIT.POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("eureka.client.enabled", () -> "false");
        registry.add("eureka.client.register-with-eureka", () -> "false");
        registry.add("eureka.client.fetch-registry", () -> "false");
        registry.add("app.security.internal.token", () -> INTERNAL_TOKEN);
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "5");
        registry.add("spring.datasource.hikari.minimum-idle", () -> "1");
    }

    @BeforeEach
    void setUp() {
        restClientMockServerHolder.server.reset();
        jdbcTemplate.update("DELETE FROM collection_plan WHERE partner_id = ?", PARTNER_ID);
        jdbcTemplate.update("DELETE FROM notes_receivable WHERE partner_id = ?", PARTNER_ID);
        lenient().when(partnerLookupClient.findByPartnerCode("P-RCV-001"))
                .thenReturn(java.util.Optional.of(PARTNER));
        lenient().when(partnerLookupClient.findByPartnerId(PARTNER_ID))
                .thenReturn(java.util.Optional.of(PARTNER));
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(any()))
                .thenReturn(Map.of(PARTNER_ID, PARTNER));
    }

    @Test
    @DisplayName("CollectionPlan: MANAGER/ACCOUNTANT POST/PATCH 200, 미허용 계정 403")
    void collectionPlanWritePermissions_useDirectDynamicPermissionClient() throws Exception {
        expectPermission(MANAGER_ACCOUNT, "CREATE", true);
        expectPermission(ACCOUNTANT_ACCOUNT, "UPDATE", true);
        expectPermission(SALES_ACCOUNT, "CREATE", false);
        mockMvc.perform(post("/accounting/collection-plans")
                        .header("X-User-Id", MANAGER_ACCOUNT.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(collectionPlanBody("2026-08-01", "MANUAL", null))))
                .andExpect(status().isCreated());

        String planNo = jdbcTemplate.queryForObject("""
                SELECT plan_no FROM collection_plan
                 WHERE partner_id = ? AND is_deleted = FALSE
                 ORDER BY created_at DESC LIMIT 1
                """, String.class, PARTNER_ID);

        mockMvc.perform(patch("/accounting/collection-plans/" + planNo.replace("/", "-") + "/status")
                        .header("X-User-Id", ACCOUNTANT_ACCOUNT.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"OVERDUE\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/accounting/collection-plans")
                        .header("X-User-Id", SALES_ACCOUNT.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(collectionPlanBody("2026-08-02", "MANUAL", null))))
                .andExpect(status().isForbidden());

        restClientMockServerHolder.server.verify();
    }

    @Test
    @DisplayName("NotesReceivable: MANAGER/ACCOUNTANT POST/PATCH 200, 미허용 계정 403")
    void notesReceivableWritePermissions_useDirectDynamicPermissionClient() throws Exception {
        expectPermission(MANAGER_ACCOUNT, "CREATE", true);
        expectPermission(ACCOUNTANT_ACCOUNT, "UPDATE", true);
        expectPermission(SALES_ACCOUNT, "CREATE", false);
        mockMvc.perform(post("/accounting/notes-receivable")
                        .header("X-User-Id", MANAGER_ACCOUNT.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(notesReceivableBody("NR-PERM-001"))))
                .andExpect(status().isCreated());

        mockMvc.perform(patch("/accounting/notes-receivable/NR-PERM-001/status")
                        .header("X-User-Id", ACCOUNTANT_ACCOUNT.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"COLLECTING\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/accounting/notes-receivable")
                        .header("X-User-Id", SALES_ACCOUNT.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(notesReceivableBody("NR-PERM-002"))))
                .andExpect(status().isForbidden());

        restClientMockServerHolder.server.verify();
    }

    private void expectPermission(UUID accountId, String action, boolean allowed) {
        restClientMockServerHolder.server.expect(once(), requestTo("http://auth-service/auth/internal/permissions/check"
                        + "?accountId=" + accountId
                        + "&pageCode=" + PAGE_CODE
                        + "&action=" + action))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(header("X-User-Id", "system-internal:accounting-service"))
                .andRespond(withSuccess("{\"success\":true,\"data\":{\"allowed\":" + allowed + "}}",
                        org.springframework.http.MediaType.APPLICATION_JSON));
    }

    private Map<String, Object> collectionPlanBody(String plannedDate, String basis, String sourceReference) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("partnerCode", "P-RCV-001");
        body.put("plannedDate", plannedDate);
        body.put("plannedAmount", new BigDecimal("100000"));
        body.put("basis", basis);
        if (sourceReference != null) {
            body.put("sourceReference", sourceReference);
        }
        return body;
    }

    private Map<String, Object> notesReceivableBody(String noteNo) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("partnerCode", "P-RCV-001");
        body.put("noteNo", noteNo);
        body.put("issueDate", LocalDate.of(2026, 7, 1).toString());
        body.put("maturityDate", LocalDate.of(2026, 8, 1).toString());
        body.put("amount", new BigDecimal("200000"));
        body.put("noteType", "PROMISSORY");
        body.put("status", "BOARDING");
        return body;
    }

    @TestConfiguration
    static class RestClientMockConfig {

        @Bean
        RestClientMockServerHolder restClientMockServerHolder() {
            return new RestClientMockServerHolder();
        }

        @Bean
        DynamicPermissionClient dynamicPermissionClient(RestClientMockServerHolder holder) {
            RestClient.Builder builder = RestClient.builder();
            holder.server = MockRestServiceServer.bindTo(builder).ignoreExpectOrder(false).build();
            return new DefaultDynamicPermissionClient(
                    builder,
                    "http://auth-service",
                    INTERNAL_TOKEN,
                    "accounting-service",
                    "test-gateway-attestation"
            );
        }
    }

    static class RestClientMockServerHolder {
        private MockRestServiceServer server;
    }
}
