package com.samhanair.logis.accounting.it;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.SalesTaxType;
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

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;

    @MockBean SlipServiceClient slipServiceClient;
    @MockBean ETaxClient eTaxClient;
    @MockBean KftcClient kftcClient;
    @MockBean(classes = com.samhanair.logis.accounting.client.DynamicPermissionClient.class) DynamicPermissionClient dynamicPermissionClient;
    @MockBean SalesAccountingSlipNumberGenerator numberGenerator;

    @Test
    void POST_admin_sales_slips_DRAFT_정상생성() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("SAS-IT-0001");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-2026-05-0042", sourceLineId, "RX다배관 30A",
                10, new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED", "OUTBOUND"));

        CreateSalesAccountingSlipRequest req = new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), UUID.randomUUID(), "P-2026-0001", "(주)한국공조",
                SalesTaxType.TAXABLE, "IT Docker 실서버 검증",
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", new BigDecimal("10"), new BigDecimal("150000"),
                        List.of(new CreateSalesAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "OUT-2026-05-0042", sourceLineId, 1,
                                new BigDecimal("10"), new BigDecimal("1500000"))))));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "it-tester")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.totalSupplyAmount").value(1363636))
                .andExpect(jsonPath("$.totalVatAmount").value(136364))
                .andExpect(jsonPath("$.totalAmount").value(1500000));
    }

    @Test
    void POST_admin_sales_slips_taxType_ZERO_RATED_VAT_0() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("SAS-IT-ZERO");
        stubConfirmedSourceLine(sourceSlipId, sourceLineId, new BigDecimal("1500000"));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "it-tester")
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
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("SAS-IT-EXEMPT");
        stubConfirmedSourceLine(sourceSlipId, sourceLineId, new BigDecimal("1500000"));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "it-tester")
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
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("SAS-IT-B1", "SAS-IT-B2");
        stubConfirmedSourceLine(sourceSlipId, sourceLineId, new BigDecimal("1500000"));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "it-tester")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(
                                sourceSlipId, sourceLineId, SalesTaxType.TAXABLE,
                                new BigDecimal("10"), new BigDecimal("150000"),
                                new BigDecimal("1500000")))))
                .andExpect(status().isOk());

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "it-tester")
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
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("SAS-IT-EMPTY");
        CreateSalesAccountingSlipRequest req = new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), UUID.randomUUID(), "P-2026-0001", "(주)한국공조",
                SalesTaxType.TAXABLE, "empty allocations",
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", new BigDecimal("10"), new BigDecimal("150000"),
                        List.of())));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "it-tester")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(req)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_LINE_AMOUNT_MISMATCH"));
    }

    @Test
    void POST_admin_sales_slips_INBOUND_source_거부() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("SAS-IT-TYPE");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-2026-05-0042", sourceLineId, "RX다배관 30A",
                10, new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED", "INBOUND"));

        mvc.perform(post("/admin/sales-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "it-tester")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(
                                sourceSlipId, sourceLineId, SalesTaxType.TAXABLE,
                                new BigDecimal("1"), new BigDecimal("100000"),
                                new BigDecimal("100000")))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_SOURCE_SLIP_TYPE_MISMATCH"));
    }

    private void stubConfirmedSourceLine(UUID sourceSlipId, UUID sourceLineId, BigDecimal lineTotal) {
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-2026-05-0042", sourceLineId, "RX다배관 30A",
                10, new BigDecimal("150000"), lineTotal, "CONFIRMED", "OUTBOUND"));
    }

    private static CreateSalesAccountingSlipRequest request(UUID sourceSlipId, UUID sourceLineId,
            SalesTaxType taxType, BigDecimal qty, BigDecimal unitPrice, BigDecimal allocatedAmount) {
        return new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), UUID.randomUUID(), "P-2026-0001", "(주)한국공조",
                taxType, "IT Docker 실서버 검증",
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", qty, unitPrice,
                        List.of(new CreateSalesAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "OUT-2026-05-0042", sourceLineId, 1,
                                qty, allocatedAmount)))));
    }
}
