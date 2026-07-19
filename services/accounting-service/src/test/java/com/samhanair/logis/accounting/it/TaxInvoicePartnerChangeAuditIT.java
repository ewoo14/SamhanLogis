package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;

/** 실 Spring/Postgres PUT 경로에서 taxInvoice.partner audit의 UUID 비공개 계약을 검증한다. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class TaxInvoicePartnerChangeAuditIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private EntityManager entityManager;

    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private DynamicPermissionClient permissionClient;

    private static final UUID PARTNER_1 = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID PARTNER_2 = UUID.fromString("22222222-2222-2222-2222-222222222222");

    @BeforeEach
    void clean() {
        jdbcTemplate.update("DELETE FROM accounting_audit_logs WHERE field_name = 'taxInvoice.partner'");
        jdbcTemplate.update("DELETE FROM tax_invoice_lines");
        jdbcTemplate.update("DELETE FROM tax_invoices");
    }

    @Test
    @DisplayName("동일 UUID+description 변경은 partner audit 0건, 다른 UUID+동일 표시값은 1건이다")
    void partnerUuidChangeIsAuditedEvenWhenDisplayValuesMatch() throws Exception {
        String id = createDraft(PARTNER_1, "설명 1");

        updateDraft(id, PARTNER_1, "설명 2");
        assertThat(partnerAuditCount()).isZero();

        updateDraft(id, PARTNER_2, "설명 3");
        assertThat(partnerAuditCount()).isEqualTo(1);

        Map<String, Object> audit = jdbcTemplate.queryForMap("""
                SELECT field_name, old_value, new_value FROM accounting_audit_logs
                 WHERE field_name = 'taxInvoice.partner'
                 ORDER BY changed_at DESC LIMIT 1
                """);
        assertThat(audit.get("field_name")).isEqualTo("taxInvoice.partner");
        assertThat(audit.get("old_value").toString()).doesNotContain(PARTNER_1.toString(), PARTNER_2.toString());
        assertThat(audit.get("new_value").toString()).doesNotContain(PARTNER_1.toString(), PARTNER_2.toString());
        assertThat(audit.get("old_value")).isEqualTo("동일상호 (동일코드)");
        assertThat(audit.get("new_value")).isEqualTo("동일상호 (동일코드)");
    }

    private String createDraft(UUID partnerId, String description) throws Exception {
        MvcResult result = mockMvc.perform(post("/accounting/tax-invoices")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body(partnerId, description))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("data").get("id").asText();
    }

    private void updateDraft(String id, UUID partnerId, String description) throws Exception {
        mockMvc.perform(put("/accounting/tax-invoices/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body(partnerId, description))))
                .andExpect(status().isOk());
        entityManager.flush();
    }

    private static Map<String, Object> body(UUID partnerId, String description) {
        return Map.of(
                "partnerId", partnerId,
                "partnerCode", "동일코드",
                "partnerName", "동일상호",
                "supplyDate", "2026-07-20",
                "description", description,
                "lines", List.of(Map.of(
                        "itemName", "품목",
                        "quantity", 1,
                        "unitPrice", 1000)));
    }

    private int partnerAuditCount() {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM accounting_audit_logs WHERE field_name = 'taxInvoice.partner'", Integer.class);
    }
}
