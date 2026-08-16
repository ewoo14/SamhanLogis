package com.samhanair.logis.accounting.it;

import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import java.nio.charset.StandardCharsets;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.RestClient;

/** H-1 accounting.bank-matching @RequirePermission 실 DPC 호출 enforcement 검증. */
@SpringBootTest(classes = {
        AccountingServiceApplication.class,
        BankTransactionPermissionEnforcementIT.RestClientMockConfig.class
})
@AutoConfigureMockMvc
@Import(com.samhanair.logis.security.test.GatewayAttestationMockMvcConfig.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@TestPropertySource(properties = "spring.main.allow-bean-definition-overriding=true")
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
class BankTransactionPermissionEnforcementIT {

    private static final String BASE_URL = "/accounting/bank-transactions";
    private static final String PAGE_CODE = "accounting.bank-matching";
    private static final String INTERNAL_TOKEN = "test-internal-token";
    private static final UUID MANAGER_ACCOUNT = UUID.fromString("a0000000-0000-0000-0000-000000000003");
    private static final UUID ACCOUNTANT_ACCOUNT = UUID.fromString("a0000000-0000-0000-0000-000000000005");
    private static final UUID SALES_ACCOUNT = UUID.fromString("a0000000-0000-0000-0000-000000000004");
    private static final UUID PARTNER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    @Autowired private MockMvc mockMvc;
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
        jdbcTemplate.update("DELETE FROM bank_transaction");
        jdbcTemplate.update("DELETE FROM bank_depositor_partner_mapping");
    }

    @Test
    @DisplayName("BankTransaction import: MANAGER/ACCOUNTANT CREATE 200, 미허용 계정 403")
    void importCsvWritePermissions_useDirectDynamicPermissionClient() throws Exception {
        expectPermission(MANAGER_ACCOUNT, PermissionAction.CREATE, true);
        expectPermission(ACCOUNTANT_ACCOUNT, PermissionAction.CREATE, true);
        expectPermission(SALES_ACCOUNT, PermissionAction.CREATE, false);

        importCsv(MANAGER_ACCOUNT, "PERM-MANAGER-001")
                .andExpect(status().isOk());
        importCsv(ACCOUNTANT_ACCOUNT, "PERM-ACCOUNTANT-001")
                .andExpect(status().isOk());
        importCsv(SALES_ACCOUNT, "PERM-SALES-001")
                .andExpect(status().isForbidden());

        restClientMockServerHolder.server.verify();
    }

    @Test
    @DisplayName("BankTransaction match-partner: ACCOUNTANT UPDATE 200, 미허용 계정 403")
    void matchPartnerUpdatePermission_usesBankMatchingPageCode() throws Exception {
        jdbcTemplate.update("""
                INSERT INTO bank_transaction (
                    id, transacted_at, txn_type, amount, description, bank_account_label,
                    source, external_ref, match_status, created_at, created_by, is_deleted
                ) VALUES (
                    ?, TIMESTAMP '2026-06-23 09:10:00', 'DEPOSIT', 150000.00, '권한테스트 입금',
                    '국민 권한테스트', 'CSV_IMPORT', 'PERM-MATCH-001', 'UNREFLECTED',
                    NOW(), 'it', FALSE
                )
                """, UUID.randomUUID());
        when(partnerLookupClient.findByPartnerCode("P-2026-0001"))
                .thenReturn(Optional.of(new PartnerSummary(
                        PARTNER_ID,
                        "P-2026-0001",
                        "권한테스트상사",
                        "111-22-33333",
                        "서울")));
        expectPermission(ACCOUNTANT_ACCOUNT, PermissionAction.UPDATE, true);
        expectPermission(SALES_ACCOUNT, PermissionAction.UPDATE, false);

        matchPartner(ACCOUNTANT_ACCOUNT, "PERM-MATCH-001")
                .andExpect(status().isOk());
        matchPartner(SALES_ACCOUNT, "PERM-MATCH-001")
                .andExpect(status().isForbidden());

        restClientMockServerHolder.server.verify();
    }

    @Test
    @DisplayName("BankTransaction match-partner/clear: ACCOUNTANT UPDATE 200, 미허용 계정 403")
    void clearPartnerUpdatePermission_usesBankMatchingPageCode() throws Exception {
        jdbcTemplate.update("""
                INSERT INTO bank_transaction (
                    id, transacted_at, txn_type, amount, description, bank_account_label,
                    source, external_ref, match_status, created_at, created_by, is_deleted
                ) VALUES (
                    ?, TIMESTAMP '2026-06-23 09:10:00', 'DEPOSIT', 150000.00, '권한해제테스트 입금',
                    '국민 권한테스트', 'CSV_IMPORT', 'PERM-CLEAR-001', 'UNREFLECTED',
                    NOW(), 'it', FALSE
                )
                """, UUID.randomUUID());
        expectPermission(ACCOUNTANT_ACCOUNT, PermissionAction.UPDATE, true);
        expectPermission(SALES_ACCOUNT, PermissionAction.UPDATE, false);

        clearPartner(ACCOUNTANT_ACCOUNT, "PERM-CLEAR-001")
                .andExpect(status().isOk());
        clearPartner(SALES_ACCOUNT, "PERM-CLEAR-001")
                .andExpect(status().isForbidden());

        restClientMockServerHolder.server.verify();
    }

    /**
     * #810 적대검증 R1 (L2-H1) — clear-and-delete-mapping 이중 게이트 실 DPC enforcement.
     *
     * <p>{@code bank-matching:UPDATE} 만 있고 {@code deposit-mapping:DELETE} 가 없으면 403 이고
     * 거래 해제/매핑 삭제 모두 롤백, 양쪽 보유 시에만 200 이다.
     */
    @Test
    @DisplayName("clear-and-delete-mapping: bank-matching UPDATE + deposit-mapping DELETE 양쪽 필요")
    void clearAndDeleteMappingRequiresBothPermissions() throws Exception {
        UUID mappingId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO bank_depositor_partner_mapping
                    (id, raw_name, normalized_name, partner_id, created_by, is_deleted)
                VALUES (?, '권한테스트상사', '권한테스트상사', ?, 'it', FALSE)
                """, mappingId, PARTNER_ID);
        jdbcTemplate.update("""
                INSERT INTO bank_transaction (
                    id, transacted_at, txn_type, amount, description, bank_account_label,
                    source, external_ref, match_status, matched_partner_id, partner_match_source,
                    matched_mapping_id, partner_matched_at, partner_matched_by,
                    matched_mapping_raw_name, matched_mapping_normalized_name,
                    created_at, created_by, is_deleted
                ) VALUES (
                    ?, TIMESTAMP '2026-06-23 09:10:00', 'DEPOSIT', 150000.00, '이중게이트 입금',
                    '국민 권한테스트', 'CSV_IMPORT', 'PERM-DUAL-001', 'UNREFLECTED', ?, 'DEPOSITOR_MAPPING',
                    ?, NOW(), 'SYSTEM', '권한테스트상사', '권한테스트상사',
                    NOW(), 'it', FALSE
                )
                """, UUID.randomUUID(), PARTNER_ID, mappingId);

        // MockRestServiceServer는 첫 실요청 이후 expectation 추가를 금지하므로 4건을 선선언한다(순서 일치).
        expectPermission(ACCOUNTANT_ACCOUNT, PermissionAction.UPDATE, true);
        expectPermission(ACCOUNTANT_ACCOUNT, "accounting.deposit-mapping", PermissionAction.DELETE, false);
        expectPermission(ACCOUNTANT_ACCOUNT, PermissionAction.UPDATE, true);
        expectPermission(ACCOUNTANT_ACCOUNT, "accounting.deposit-mapping", PermissionAction.DELETE, true);

        // 1차: UPDATE 허용 + deposit-mapping DELETE 거부 → 403, 거래·매핑 모두 원상 유지(롤백).
        clearAndDeleteMapping(ACCOUNTANT_ACCOUNT, "PERM-DUAL-001")
                .andExpect(status().isForbidden());
        Integer stillMatched = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_transaction WHERE external_ref = 'PERM-DUAL-001' AND matched_partner_id IS NOT NULL",
                Integer.class);
        Integer stillActiveMapping = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_depositor_partner_mapping WHERE id = ? AND is_deleted = FALSE",
                Integer.class, mappingId);
        org.assertj.core.api.Assertions.assertThat(stillMatched).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(stillActiveMapping).isEqualTo(1);

        // 2차: 양쪽 허용 → 200, 거래 해제 + 매핑 soft delete.
        clearAndDeleteMapping(ACCOUNTANT_ACCOUNT, "PERM-DUAL-001")
                .andExpect(status().isOk());
        Integer cleared = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_transaction WHERE external_ref = 'PERM-DUAL-001' AND matched_partner_id IS NULL",
                Integer.class);
        Integer deletedMapping = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_depositor_partner_mapping WHERE id = ? AND is_deleted = TRUE",
                Integer.class, mappingId);
        org.assertj.core.api.Assertions.assertThat(cleared).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(deletedMapping).isEqualTo(1);

        restClientMockServerHolder.server.verify();
    }

    private org.springframework.test.web.servlet.ResultActions clearPartner(UUID accountId, String externalRef)
            throws Exception {
        return mockMvc.perform(patch(BASE_URL + "/match-partner/clear")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "bankAccountLabel": "국민 권한테스트",
                          "transactedAt": "2026-06-23T09:10:00",
                          "amount": 150000.00,
                          "externalRef": "%s"
                        }
                        """.formatted(externalRef))
                .header("X-User-Id", accountId.toString()));
    }

    private org.springframework.test.web.servlet.ResultActions clearAndDeleteMapping(UUID accountId,
                                                                                     String externalRef)
            throws Exception {
        return mockMvc.perform(patch(BASE_URL + "/match-partner/clear-and-delete-mapping")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "bankAccountLabel": "국민 권한테스트",
                          "transactedAt": "2026-06-23T09:10:00",
                          "amount": 150000.00,
                          "externalRef": "%s"
                        }
                        """.formatted(externalRef))
                .header("X-User-Id", accountId.toString()));
    }

    private void expectPermission(UUID accountId, PermissionAction action, boolean allowed) {
        expectPermission(accountId, PAGE_CODE, action, allowed);
    }

    private void expectPermission(UUID accountId, String pageCode, PermissionAction action, boolean allowed) {
        restClientMockServerHolder.server.expect(once(), requestTo("http://auth-service/auth/internal/permissions/check"
                        + "?accountId=" + accountId
                        + "&pageCode=" + pageCode
                        + "&action=" + action.name()))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(header("X-User-Id", "system-internal:accounting-service"))
                .andRespond(withSuccess("{\"success\":true,\"data\":{\"allowed\":" + allowed + "}}",
                        org.springframework.http.MediaType.APPLICATION_JSON));
    }

    private org.springframework.test.web.servlet.ResultActions importCsv(UUID accountId, String externalRef)
            throws Exception {
        return mockMvc.perform(multipart(BASE_URL + "/import")
                .file(csv(externalRef))
                .param("bankAccountLabel", "국민 권한테스트")
                .param("dateColumn", "거래일시")
                .param("depositColumn", "입금액")
                .param("withdrawalColumn", "출금액")
                .param("balanceColumn", "잔액")
                .param("descriptionColumn", "적요")
                .param("counterpartyColumn", "상대")
                .param("externalRefColumn", "참조")
                .param("headerRow", "true")
                .header("X-User-Id", accountId.toString()));
    }

    private static MockMultipartFile csv(String externalRef) {
        String csv = """
                거래일시,입금액,출금액,잔액,적요,상대,참조
                2026-06-23 09:10,150000,,1150000,권한테스트 입금,권한테스트상사,%s
                """.formatted(externalRef);
        return new MockMultipartFile(
                "file",
                "bank-permission.csv",
                MediaType.TEXT_PLAIN_VALUE,
                csv.getBytes(StandardCharsets.UTF_8));
    }

    private org.springframework.test.web.servlet.ResultActions matchPartner(UUID accountId, String externalRef)
            throws Exception {
        return mockMvc.perform(patch(BASE_URL + "/match-partner")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "bankAccountLabel": "국민 권한테스트",
                          "transactedAt": "2026-06-23T09:10:00",
                          "amount": 150000.00,
                          "externalRef": "%s",
                          "partnerCode": "P-2026-0001"
                        }
                        """.formatted(externalRef))
                .header("X-User-Id", accountId.toString()));
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
