package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.Optional;
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

/** #810 deposit-mapping RequirePermission이 실제 HTTP permission client를 통해 enforcement되는지 검증한다. */
@SpringBootTest(classes = {
        AccountingServiceApplication.class,
        BankDepositorPartnerMappingPermissionEnforcementIT.RestClientMockConfig.class
})
@AutoConfigureMockMvc
@Import(com.samhanair.logis.security.test.GatewayAttestationMockMvcConfig.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@TestPropertySource(properties = "spring.main.allow-bean-definition-overriding=true")
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
class BankDepositorPartnerMappingPermissionEnforcementIT {

    private static final String BASE_URL = "/accounting/deposit-mappings";
    private static final String PAGE_CODE = "accounting.deposit-mapping";
    private static final String INTERNAL_TOKEN = "test-internal-token";
    private static final UUID ACCOUNTANT = UUID.fromString("a0000000-0000-0000-0000-000000000005");
    private static final UUID SALES = UUID.fromString("a0000000-0000-0000-0000-000000000004");
    private static final PartnerSummary PARTNER = new PartnerSummary(
            UUID.fromString("11111111-1111-1111-1111-111111111111"), "P-001", "삼한상사", null, null);

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private RestClientMockServerHolder holder;
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
        holder.server.reset();
        jdbcTemplate.update("DELETE FROM bank_depositor_partner_mapping");
        lenient().when(partnerLookupClient.findByPartnerCode("P-001")).thenReturn(Optional.of(PARTNER));
    }

    @Test
    @DisplayName("실 HTTP enforcement: ACCOUNTANT CREATE 허용, SALES CREATE 거부")
    void createPermissionUsesRealHttpClient() throws Exception {
        expectPermission(ACCOUNTANT, true);
        expectPermission(SALES, false);

        create(ACCOUNTANT, "Allowed").andExpect(status().isCreated());
        create(SALES, "Denied").andExpect(status().isForbidden());

        holder.server.verify();
    }

    private org.springframework.test.web.servlet.ResultActions create(UUID accountId, String rawName)
            throws Exception {
        return mockMvc.perform(post(BASE_URL)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"rawName\":\"" + rawName + "\",\"partnerCode\":\"P-001\"}")
                .header("X-User-Id", accountId.toString()));
    }

    private void expectPermission(UUID accountId, boolean allowed) {
        holder.server.expect(once(), requestTo("http://auth-service/auth/internal/permissions/check"
                        + "?accountId=" + accountId + "&pageCode=" + PAGE_CODE + "&action=CREATE"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(header("X-User-Id", "system-internal:accounting-service"))
                .andRespond(withSuccess("{\"success\":true,\"data\":{\"allowed\":" + allowed + "}}",
                        MediaType.APPLICATION_JSON));
    }

    /** permission check용 실제 RestClient adapter를 MockRestServiceServer에 연결한다. */
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
            return new DefaultDynamicPermissionClient(builder, "http://auth-service", INTERNAL_TOKEN,
                    "accounting-service", "test-gateway-attestation");
        }
    }

    static class RestClientMockServerHolder {
        private MockRestServiceServer server;
    }
}
