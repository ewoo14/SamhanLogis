package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.domain.BankDepositorPartnerMapping;
import com.samhanair.logis.accounting.domain.TaxInvoiceBatchExclusion;
import com.samhanair.logis.accounting.repository.BankDepositorPartnerMappingRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceBatchExclusionRepository;
import com.samhanair.logis.accounting.web.dto.BankDepositorPartnerMappingRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceBatchExclusionRequest;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
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
import org.springframework.transaction.annotation.Transactional;

/** V63 fresh PostgreSQL에서 회계 partner_code 4개 컬럼과 실 entity flush를 검증한다. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class PartnerCodeWidthMigrationIT extends AbstractPostgresIT {

    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private MockMvc mockMvc;
    @Autowired private jakarta.validation.Validator validator;
    @Autowired private TaxInvoiceBatchExclusionRepository exclusionRepository;
    @Autowired private BankDepositorPartnerMappingRepository mappingRepository;

    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private DynamicPermissionClient permissionClient;

    @BeforeEach
    void clean() {
        jdbcTemplate.update("DELETE FROM tax_invoice_batch_exclusions");
        jdbcTemplate.update("DELETE FROM bank_depositor_partner_mapping");
        jdbcTemplate.update("DELETE FROM staging.ecount_sales_ledger_raw");
        jdbcTemplate.update("DELETE FROM staging.ecount_purchase_ledger_raw");
    }

    @Test
    @DisplayName("V63은 accounting 유효 스키마의 partner_code 4개를 VARCHAR(100)으로 확장한다")
    void v63WidenedFourInScopeColumns() {
        List<Map<String, Object>> columns = jdbcTemplate.queryForList("""
                SELECT table_schema, table_name, column_name, character_maximum_length
                  FROM information_schema.columns
                 WHERE column_name = 'partner_code'
                   AND ((table_schema = 'public' AND table_name IN (
                            'tax_invoice_batch_exclusions', 'bank_depositor_partner_mapping'))
                    OR (table_schema = 'staging' AND table_name IN (
                            'ecount_sales_ledger_raw', 'ecount_purchase_ledger_raw')))
                """);

        assertThat(columns).hasSize(4);
        assertThat(columns).allSatisfy(column ->
                assertThat(column.get("character_maximum_length")).isEqualTo(100));
    }

    @Test
    @DisplayName("86자와 정확히 100자 partner_code는 batch exclusion/depositor entity flush 왕복이 된다")
    void entityFlushRoundTripsAtHundredCharacters() {
        String code86 = "P".repeat(86);
        String code100 = "Q".repeat(100);

        TaxInvoiceBatchExclusion exclusion = exclusionRepository.saveAndFlush(
                TaxInvoiceBatchExclusion.create(code86, "매출처", "경계값"));
        BankDepositorPartnerMapping mapping = mappingRepository.saveAndFlush(
                BankDepositorPartnerMapping.create("입금자", UUID.randomUUID(), code100));

        assertThat(exclusionRepository.findById(exclusion.getId()).orElseThrow().getPartnerCode())
                .isEqualTo(code86);
        assertThat(mappingRepository.findById(mapping.getId()).orElseThrow().getPartnerCodeSnapshot())
                .isEqualTo(code100);
    }

    @Test
    @DisplayName("대표 저장 endpoint는 partnerCode 101자를 Validator 단계에서 400으로 거부한다")
    void representativeTaxInvoiceEndpointRejects101Characters() throws Exception {
        Map<String, Object> line = Map.of(
                "itemName", "품목",
                "quantity", BigDecimal.ONE,
                "unitPrice", new BigDecimal("1000"));
        Map<String, Object> body = Map.of(
                "partnerId", UUID.randomUUID(),
                "partnerCode", "X".repeat(101),
                "partnerName", "거래처",
                "supplyDate", "2026-07-20",
                "lines", List.of(line));

        mockMvc.perform(post("/accounting/tax-invoices")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    /**
     * 본 슬라이스가 실제로 @Size(100)을 추가·변경한 in-scope DTO 2종의 partnerCode 경계 가드.
     *
     * <p>대표 endpoint(tax-invoices)는 pre-existing DTO(V61/#825)라 본 PR 위젠 대상이 아니다
     * (R1 dim3/dim5 L1). {@code BankDepositorPartnerMappingRequest}·
     * {@code TaxInvoiceBatchExclusionRequest}의 {@code @Size(max = 100)}을 Bean Validator 로
     * 직접 단언 — @Size 를 지우면 101자에서 위반이 사라져 RED. DB VARCHAR(100) backstop 앞단
     * 400 게이트를 명시 고정한다(오설정 시 DB 500 회귀 차단).
     */
    @Test
    @DisplayName("in-scope 위젠 DTO는 partnerCode 101자를 @Size(100)로 거부하고 100자는 통과시킨다")
    void inScopeWidenedDtosGuardPartnerCodeAt100() {
        String code101 = "X".repeat(101);
        String code100 = "X".repeat(100);

        assertThat(validator.validate(new BankDepositorPartnerMappingRequest("입금자", code101, "사유")))
                .as("depositor mapping 101자 partnerCode 위반")
                .anyMatch(v -> v.getPropertyPath().toString().equals("partnerCode"));
        assertThat(validator.validate(new BankDepositorPartnerMappingRequest("입금자", code100, "사유")))
                .as("depositor mapping 100자 partnerCode 통과")
                .noneMatch(v -> v.getPropertyPath().toString().equals("partnerCode"));

        assertThat(validator.validate(new TaxInvoiceBatchExclusionRequest(code101, "매출처", "제외사유")))
                .as("batch exclusion 101자 partnerCode 위반")
                .anyMatch(v -> v.getPropertyPath().toString().equals("partnerCode"));
        assertThat(validator.validate(new TaxInvoiceBatchExclusionRequest(code100, "매출처", "제외사유")))
                .as("batch exclusion 100자 partnerCode 통과")
                .noneMatch(v -> v.getPropertyPath().toString().equals("partnerCode"));
    }
}
