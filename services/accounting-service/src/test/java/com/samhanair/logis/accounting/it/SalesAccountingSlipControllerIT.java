package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.service.SalesAccountingSlipNumberGenerator;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class SalesAccountingSlipControllerIT extends AbstractPostgresIT {

    private static final UUID PARTNER_ID = UUID.fromString("00000000-0000-0000-0000-000000000823");

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @Autowired SalesAccountingSlipRepository salesSlipRepository;

    @MockBean SlipServiceClient slipServiceClient;
    @MockBean ETaxClient eTaxClient;
    @MockBean KftcClient kftcClient;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) DynamicPermissionClient dynamicPermissionClient;
    @MockBean SalesAccountingSlipNumberGenerator numberGenerator;

    @Test
    void POST_admin_sales_slips_DRAFT_정상생성() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-1");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-2026-05-0042", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "RX다배관 30A",
                10, new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED", "OUTBOUND"));

        CreateSalesAccountingSlipRequest req = new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-2026-0001", "(주)한국공조",
                SalesTaxType.TAXABLE, "IT Docker 실서버 검증",
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", new BigDecimal("10"), new BigDecimal("150000"),
                        List.of(new CreateSalesAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "OUT-2026-05-0042", sourceLineId, 1,
                                new BigDecimal("10"), new BigDecimal("1500000"))))));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.partnerCode").value("P-SOURCE-823"))
                .andExpect(jsonPath("$.partnerName").value("원천 거래처"))
                .andExpect(jsonPath("$.totalSupplyAmount").value(1363636))
                .andExpect(jsonPath("$.totalVatAmount").value(136364))
                .andExpect(jsonPath("$.totalAmount").value(1500000));
    }

    @Test
    void POST_admin_sales_slips_taxType_ZERO_RATED_VAT_0() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-2");
        stubConfirmedSourceLine(sourceSlipId, sourceLineId, new BigDecimal("1500000"));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(
                                sourceSlipId, sourceLineId, SalesTaxType.ZERO_RATED,
                                new BigDecimal("10"), new BigDecimal("150000"),
                                new BigDecimal("1500000")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalSupplyAmount").value(1500000))
                .andExpect(jsonPath("$.totalVatAmount").value(0))
                .andExpect(jsonPath("$.totalAmount").value(1500000));
    }

    @Test
    void POST_admin_sales_slips_taxType_EXEMPT_VAT_0() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-3");
        stubConfirmedSourceLine(sourceSlipId, sourceLineId, new BigDecimal("1500000"));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(
                                sourceSlipId, sourceLineId, SalesTaxType.EXEMPT,
                                new BigDecimal("10"), new BigDecimal("150000"),
                                new BigDecimal("1500000")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalSupplyAmount").value(1500000))
                .andExpect(jsonPath("$.totalVatAmount").value(0))
                .andExpect(jsonPath("$.totalAmount").value(1500000));
    }

    @Test
    void POST_admin_sales_slips_overAllocation_정확boundary() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-4", "2026/05/19-5");
        stubConfirmedSourceLine(sourceSlipId, sourceLineId, new BigDecimal("1500000"));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(
                                sourceSlipId, sourceLineId, SalesTaxType.TAXABLE,
                                new BigDecimal("10"), new BigDecimal("150000"),
                                new BigDecimal("1500000")))))
                .andExpect(status().isOk());

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(
                                sourceSlipId, sourceLineId, SalesTaxType.TAXABLE,
                                new BigDecimal("0.01"), new BigDecimal("1"),
                                new BigDecimal("0.01")))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_OVER_ALLOCATION"));
    }

    @Test
    void POST_admin_sales_slips_empty_allocations_거부() throws Exception {
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-6");
        CreateSalesAccountingSlipRequest req = new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-2026-0001", "(주)한국공조",
                SalesTaxType.TAXABLE, "empty allocations",
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", new BigDecimal("10"), new BigDecimal("150000"),
                        List.of())));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(req)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_LINE_AMOUNT_MISMATCH"));
    }

    @Test
    void POST_admin_sales_slips_source_partner_불일치_422() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-PM");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-PARTNER-MISMATCH", sourceLineId, UUID.randomUUID(),
                "P-MISMATCH", "상이 원천 거래처", "P",
                1, new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "OUTBOUND"));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(sourceSlipId, sourceLineId,
                                SalesTaxType.TAXABLE, BigDecimal.ONE, new BigDecimal("100000"),
                                new BigDecimal("100000")))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_SOURCE_PARTNER_MISMATCH"));
    }

    @Test
    void POST_admin_sales_slips_source_partner_null_422() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-PN");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-PARTNER-NULL", sourceLineId, null,
                "P-MISSING", "거래처 미상", "P",
                1, new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "OUTBOUND"));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(sourceSlipId, sourceLineId,
                                SalesTaxType.TAXABLE, BigDecimal.ONE, new BigDecimal("100000"),
                                new BigDecimal("100000")))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_SOURCE_PARTNER_MISSING"));
    }

    @Test
    void POST_admin_sales_slips_source_partner_code_name_null은_실DB제약전에_422_MISSING() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-PNC");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-PARTNER-CODE-NAME-NULL", sourceLineId, PARTNER_ID,
                null, null, "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "OUTBOUND"));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(sourceSlipId, sourceLineId,
                                SalesTaxType.TAXABLE, BigDecimal.ONE, new BigDecimal("100000"),
                                new BigDecimal("100000")))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_SOURCE_PARTNER_MISSING"));

        assertThat(salesSlipRepository.findBySlipNo("2026/05/19-PNC")).isEmpty();
    }

    @Test
    void POST_admin_sales_slips_source_partner_code_null_name_valid은_독립적으로_422_MISSING() throws Exception {
        assertSourcePartnerMissing(UUID.randomUUID(), UUID.randomUUID(), "OUT-PARTNER-CODE-NULL",
                null, "원천 거래처");
    }

    @Test
    void POST_admin_sales_slips_source_partner_code_valid_name_null은_독립적으로_422_MISSING() throws Exception {
        assertSourcePartnerMissing(UUID.randomUUID(), UUID.randomUUID(), "OUT-PARTNER-NAME-NULL",
                "P-SOURCE-823", null);
    }

    @Test
    void POST_admin_sales_slips_source_partner_code_whitespace_only은_독립적으로_422_MISSING() throws Exception {
        assertSourcePartnerMissing(UUID.randomUUID(), UUID.randomUUID(), "OUT-PARTNER-CODE-BLANK",
                "   ", "원천 거래처");
    }

    @Test
    void POST_admin_sales_slips_source_partner_name_whitespace_only은_독립적으로_422_MISSING() throws Exception {
        assertSourcePartnerMissing(UUID.randomUUID(), UUID.randomUUID(), "OUT-PARTNER-NAME-BLANK",
                "P-SOURCE-823", "   ");
    }

    @Test
    void POST_admin_sales_slips_header_partner_null은_원천조회_전에_400() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        ObjectNode body = (ObjectNode) om.readTree(om.writeValueAsString(request(sourceSlipId, sourceLineId,
                SalesTaxType.TAXABLE, BigDecimal.ONE, new BigDecimal("100000"),
                new BigDecimal("100000"))));
        body.putNull("partnerId");

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    void POST_admin_sales_slips_multi_source_두번째_partner_불일치_preflight_실패_시_전표_미저장() throws Exception {
        UUID firstSlipId = UUID.randomUUID();
        UUID firstLineId = UUID.randomUUID();
        UUID secondSlipId = UUID.randomUUID();
        UUID secondLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-MIX");
        when(slipServiceClient.getSlipLine(firstLineId)).thenReturn(new SlipLineSnapshot(
                firstSlipId, "OUT-MIX-A", firstLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "OUTBOUND"));
        when(slipServiceClient.getSlipLine(secondLineId)).thenReturn(new SlipLineSnapshot(
                secondSlipId, "OUT-MIX-B", secondLineId, UUID.randomUUID(),
                "P-MISMATCH", "상이 원천 거래처", "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "OUTBOUND"));
        CreateSalesAccountingSlipRequest req = new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-2026-0001", "(주)한국공조",
                SalesTaxType.TAXABLE, "mixed source",
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        "P", "P", new BigDecimal("2"), new BigDecimal("100000"), List.of(
                        new CreateSalesAccountingSlipRequest.AllocationRequest(
                                firstSlipId, "PAYLOAD-A", firstLineId, 1,
                                BigDecimal.ONE, new BigDecimal("100000")),
                        new CreateSalesAccountingSlipRequest.AllocationRequest(
                                secondSlipId, "PAYLOAD-B", secondLineId, 1,
                                BigDecimal.ONE, new BigDecimal("100000"))))));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(req)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_SOURCE_PARTNER_MISMATCH"));

        assertThat(salesSlipRepository.findBySlipNo("2026/05/19-MIX")).isEmpty();
    }

    @Test
    void POST_admin_sales_slips_INBOUND_source_거부() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-7");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-2026-05-0042", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "RX다배관 30A",
                10, new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED", "INBOUND"));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(
                                sourceSlipId, sourceLineId, SalesTaxType.TAXABLE,
                                new BigDecimal("1"), new BigDecimal("100000"),
                                new BigDecimal("100000")))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_SOURCE_SLIP_TYPE_MISMATCH"));
    }

    @Test
    void POST_admin_sales_slips_post_acceptsHyphenDateSlugAndTransitionsPosted() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-8");
        stubConfirmedSourceLine(sourceSlipId, sourceLineId, new BigDecimal("1500000"));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(
                                sourceSlipId, sourceLineId, SalesTaxType.TAXABLE,
                                new BigDecimal("10"), new BigDecimal("150000"),
                                new BigDecimal("1500000"), "P-SALES-SLUG"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));

        mvc.perform(post("/admin/sales-slips/2026-05-19-8/post")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isNoContent());

        assertThat(salesSlipRepository.findBySlipNo("2026/05/19-8"))
                .get()
                .extracting("status")
                .isEqualTo(SalesSlipStatus.POSTED);
    }

    private void stubConfirmedSourceLine(UUID sourceSlipId, UUID sourceLineId, BigDecimal lineTotal) {
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-2026-05-0042", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "RX다배관 30A",
                10, new BigDecimal("150000"), lineTotal, "CONFIRMED", "OUTBOUND"));
    }

    private void assertSourcePartnerMissing(UUID sourceSlipId, UUID sourceLineId, String sourceSlipNo,
            String partnerCode, String partnerName) throws Exception {
        long before = salesSlipRepository.count();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, sourceSlipNo, sourceLineId, PARTNER_ID,
                partnerCode, partnerName, "RX다배관 30A", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "OUTBOUND"));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(sourceSlipId, sourceLineId,
                                SalesTaxType.TAXABLE, BigDecimal.ONE, new BigDecimal("100000"),
                                new BigDecimal("100000")))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_SOURCE_PARTNER_MISSING"));

        assertThat(salesSlipRepository.count()).isEqualTo(before);
    }

    private static CreateSalesAccountingSlipRequest request(UUID sourceSlipId, UUID sourceLineId,
            SalesTaxType taxType, BigDecimal qty, BigDecimal unitPrice, BigDecimal allocatedAmount) {
        return request(sourceSlipId, sourceLineId, taxType, qty, unitPrice, allocatedAmount, "P-2026-0001");
    }

    private static CreateSalesAccountingSlipRequest request(UUID sourceSlipId, UUID sourceLineId,
            SalesTaxType taxType, BigDecimal qty, BigDecimal unitPrice, BigDecimal allocatedAmount,
            String partnerCode) {
        return new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, partnerCode, "(주)한국공조",
                taxType, "IT Docker 실서버 검증",
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", qty, unitPrice,
                        List.of(new CreateSalesAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "OUT-2026-05-0042", sourceLineId, 1,
                                qty, allocatedAmount)))));
    }
}
