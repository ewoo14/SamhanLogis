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
import com.samhanair.logis.accounting.domain.DailyClosing;
import com.samhanair.logis.accounting.domain.DailyClosingKind;
import com.samhanair.logis.accounting.domain.DailyClosingSourceKind;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.repository.DailyClosingRepository;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.service.PurchaseAccountingSlipNumberGenerator;
import com.samhanair.logis.accounting.web.dto.CreatePurchaseAccountingSlipRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PurchaseAccountingSlipControllerIT extends AbstractPostgresIT {

    private static final UUID PARTNER_ID = UUID.fromString("00000000-0000-0000-0000-000000000823");

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @Autowired PurchaseAccountingSlipRepository purchaseSlipRepository;
    @Autowired DailyClosingRepository dailyClosingRepository;
    @Autowired PlatformTransactionManager transactionManager;

    @MockBean SlipServiceClient slipServiceClient;
    @MockBean ETaxClient eTaxClient;
    @MockBean KftcClient kftcClient;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) DynamicPermissionClient dynamicPermissionClient;
    @MockBean PurchaseAccountingSlipNumberGenerator numberGenerator;

    @BeforeEach
    void seedLockedPurchaseClosing() {
        requiresNewTransaction().executeWithoutResult(status -> {
            DailyClosing closing = DailyClosing.createV2(
                    LocalDate.of(2026, 5, 19), PARTNER_ID, DailyClosingKind.PURCHASE,
                    DailyClosingSourceKind.PURCHASE_SLIP, BigDecimal.ZERO, BigDecimal.ZERO,
                    BigDecimal.ZERO, 0);
            closing.lock("test-accountant");
            dailyClosingRepository.saveAndFlush(closing);
        });
    }

    @AfterEach
    void removePurchaseClosingFixture() {
        requiresNewTransaction().executeWithoutResult(status -> {
            dailyClosingRepository.findByClosingDateAndPartnerIdAndClosingKindAndSourceKind(
                            LocalDate.of(2026, 5, 19), PARTNER_ID, DailyClosingKind.PURCHASE,
                            DailyClosingSourceKind.PURCHASE_SLIP)
                    .ifPresent(closing -> {
                        closing.markDeleted("test-cleanup");
                        dailyClosingRepository.saveAndFlush(closing);
                    });
                });
    }

    private TransactionTemplate requiresNewTransaction() {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(Propagation.REQUIRES_NEW.value());
        return template;
    }

    @Test
    void POST_admin_purchase_slips_일마감_미선행은_409로_차단한다() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        LocalDate dateWithoutClosing = LocalDate.of(2026, 5, 20);
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-2026-05-0043", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "상품", 10,
                new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED", "INBOUND"));

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                dateWithoutClosing, PARTNER_ID, "P-2026-0002", "원천 거래처", SalesTaxType.TAXABLE,
                "gate", List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "상품", "상품", new BigDecimal("10"), new BigDecimal("150000"),
                        List.of(new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "IN-2026-05-0043", sourceLineId, 1,
                                new BigDecimal("10"), new BigDecimal("1500000"))))));

        mvc.perform(post("/admin/purchase-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(req)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("일마감을 먼저 완료해 주세요"));
    }

    @Test
    void POST_admin_purchase_slips_DRAFT_정상생성() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-1");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-2026-05-0042", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "RX다배관 30A",
                10, new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED", "INBOUND"));

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-2026-0001", "(주)한국공조",
                SalesTaxType.TAXABLE, "IT Docker 실서버 검증",
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", new BigDecimal("10"), new BigDecimal("150000"),
                        List.of(new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "IN-2026-05-0042", sourceLineId, 1,
                                new BigDecimal("10"), new BigDecimal("1500000"))))));

        mvc.perform(post("/admin/purchase-slips")
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
    void POST_admin_purchase_slips_taxType_ZERO_RATED_VAT_0() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-2");
        stubConfirmedSourceLine(sourceSlipId, sourceLineId, new BigDecimal("1500000"));

        mvc.perform(post("/admin/purchase-slips")
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
    void POST_admin_purchase_slips_taxType_EXEMPT_VAT_0() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-3");
        stubConfirmedSourceLine(sourceSlipId, sourceLineId, new BigDecimal("1500000"));

        mvc.perform(post("/admin/purchase-slips")
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
    void POST_admin_purchase_slips_overAllocation_정확boundary() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-4", "2026/05/19-5");
        stubConfirmedSourceLine(sourceSlipId, sourceLineId, new BigDecimal("1500000"));

        mvc.perform(post("/admin/purchase-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(
                                sourceSlipId, sourceLineId, SalesTaxType.TAXABLE,
                                new BigDecimal("10"), new BigDecimal("150000"),
                                new BigDecimal("1500000")))))
                .andExpect(status().isOk());

        mvc.perform(post("/admin/purchase-slips")
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
    void POST_admin_purchase_slips_empty_allocations_거부() throws Exception {
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-6");
        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-2026-0001", "(주)한국공조",
                SalesTaxType.TAXABLE, "empty allocations",
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", new BigDecimal("10"), new BigDecimal("150000"),
                        List.of())));

        mvc.perform(post("/admin/purchase-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(req)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_LINE_AMOUNT_MISMATCH"));
    }

    @Test
    void POST_admin_purchase_slips_source_partner_불일치_422() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-PM");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-PARTNER-MISMATCH", sourceLineId, UUID.randomUUID(),
                "P-MISMATCH", "상이 원천 거래처", "P",
                1, new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));

        mvc.perform(post("/admin/purchase-slips")
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
    void POST_admin_purchase_slips_source_partner_null_422() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-PN");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-PARTNER-NULL", sourceLineId, null,
                "P-MISSING", "거래처 미상", "P",
                1, new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));

        mvc.perform(post("/admin/purchase-slips")
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
    void POST_admin_purchase_slips_source_partner_code_name_null은_실DB제약전에_422_MISSING() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-PNC");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-PARTNER-CODE-NAME-NULL", sourceLineId, PARTNER_ID,
                null, null, "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));

        mvc.perform(post("/admin/purchase-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(sourceSlipId, sourceLineId,
                                SalesTaxType.TAXABLE, BigDecimal.ONE, new BigDecimal("100000"),
                                new BigDecimal("100000")))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_SOURCE_PARTNER_MISSING"));

        assertThat(purchaseSlipRepository.findBySlipNo("2026/05/19-PNC")).isEmpty();
    }

    @Test
    void POST_admin_purchase_slips_source_partner_code_null_name_valid은_독립적으로_422_MISSING() throws Exception {
        assertSourcePartnerMissing(UUID.randomUUID(), UUID.randomUUID(), "IN-PARTNER-CODE-NULL",
                null, "원천 거래처");
    }

    @Test
    void POST_admin_purchase_slips_source_partner_code_valid_name_null은_독립적으로_422_MISSING() throws Exception {
        assertSourcePartnerMissing(UUID.randomUUID(), UUID.randomUUID(), "IN-PARTNER-NAME-NULL",
                "P-SOURCE-823", null);
    }

    @Test
    void POST_admin_purchase_slips_source_partner_code_whitespace_only은_독립적으로_422_MISSING() throws Exception {
        assertSourcePartnerMissing(UUID.randomUUID(), UUID.randomUUID(), "IN-PARTNER-CODE-BLANK",
                "   ", "원천 거래처");
    }

    @Test
    void POST_admin_purchase_slips_source_partner_name_whitespace_only은_독립적으로_422_MISSING() throws Exception {
        assertSourcePartnerMissing(UUID.randomUUID(), UUID.randomUUID(), "IN-PARTNER-NAME-BLANK",
                "P-SOURCE-823", "   ");
    }

    @Test
    void POST_admin_purchase_slips_header_partner_null은_원천조회_전에_400() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        ObjectNode body = (ObjectNode) om.readTree(om.writeValueAsString(request(sourceSlipId, sourceLineId,
                SalesTaxType.TAXABLE, BigDecimal.ONE, new BigDecimal("100000"),
                new BigDecimal("100000"))));
        body.putNull("partnerId");

        mvc.perform(post("/admin/purchase-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    void POST_admin_purchase_slips_sourceLineId_null은_400_INVALID_INPUT() throws Exception {
        ObjectNode body = (ObjectNode) om.readTree(om.writeValueAsString(request(
                UUID.randomUUID(), null, SalesTaxType.TAXABLE, BigDecimal.ONE,
                new BigDecimal("100000"), new BigDecimal("100000"))));

        mvc.perform(post("/admin/purchase-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    void POST_admin_purchase_slips_null_allocation_element은_400_INVALID_INPUT() throws Exception {
        ObjectNode body = (ObjectNode) om.readTree(om.writeValueAsString(request(
                UUID.randomUUID(), UUID.randomUUID(), SalesTaxType.TAXABLE, BigDecimal.ONE,
                new BigDecimal("100000"), new BigDecimal("100000"))));
        ObjectNode line = (ObjectNode) body.withArray("lines").get(0);
        line.putArray("allocations").addNull();

        mvc.perform(post("/admin/purchase-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    void POST_admin_purchase_slips_multi_source_두번째_partner_불일치_preflight_실패_시_전표_미저장() throws Exception {
        UUID firstSlipId = UUID.randomUUID();
        UUID firstLineId = UUID.randomUUID();
        UUID secondSlipId = UUID.randomUUID();
        UUID secondLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-MIX");
        when(slipServiceClient.getSlipLine(firstLineId)).thenReturn(new SlipLineSnapshot(
                firstSlipId, "IN-MIX-A", firstLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));
        when(slipServiceClient.getSlipLine(secondLineId)).thenReturn(new SlipLineSnapshot(
                secondSlipId, "IN-MIX-B", secondLineId, UUID.randomUUID(),
                "P-MISMATCH", "상이 원천 거래처", "P", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));
        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-2026-0001", "(주)한국공조",
                SalesTaxType.TAXABLE, "mixed source",
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "P", "P", new BigDecimal("2"), new BigDecimal("100000"), List.of(
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                firstSlipId, "PAYLOAD-A", firstLineId, 1,
                                BigDecimal.ONE, new BigDecimal("100000")),
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                secondSlipId, "PAYLOAD-B", secondLineId, 1,
                                BigDecimal.ONE, new BigDecimal("100000"))))));

        mvc.perform(post("/admin/purchase-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(req)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_SOURCE_PARTNER_MISMATCH"));

        assertThat(purchaseSlipRepository.findBySlipNo("2026/05/19-MIX")).isEmpty();
    }

    @Test
    void POST_admin_purchase_slips_OUTBOUND_source_거부() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-7");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-2026-05-0042", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "RX다배관 30A",
                10, new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED", "OUTBOUND"));

        mvc.perform(post("/admin/purchase-slips")
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
    void POST_admin_purchase_slips_post_acceptsHyphenDateSlugAndTransitionsPosted() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-8");
        stubConfirmedSourceLine(sourceSlipId, sourceLineId, new BigDecimal("1500000"));

        mvc.perform(post("/admin/purchase-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(
                                sourceSlipId, sourceLineId, SalesTaxType.TAXABLE,
                                new BigDecimal("10"), new BigDecimal("150000"),
                                new BigDecimal("1500000"), "P-PURCHASE-SLUG"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));

        mvc.perform(post("/admin/purchase-slips/2026-05-19-8/post")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isNoContent());

        assertThat(purchaseSlipRepository.findBySlipNo("2026/05/19-8"))
                .get()
                .extracting("status")
                .isEqualTo(PurchaseSlipStatus.POSTED);
    }

    private void stubConfirmedSourceLine(UUID sourceSlipId, UUID sourceLineId, BigDecimal lineTotal) {
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "IN-2026-05-0042", sourceLineId, PARTNER_ID,
                "P-SOURCE-823", "원천 거래처", "RX다배관 30A",
                10, new BigDecimal("150000"), lineTotal, "CONFIRMED", "INBOUND"));
    }

    private void assertSourcePartnerMissing(UUID sourceSlipId, UUID sourceLineId, String sourceSlipNo,
            String partnerCode, String partnerName) throws Exception {
        long before = purchaseSlipRepository.count();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, sourceSlipNo, sourceLineId, PARTNER_ID,
                partnerCode, partnerName, "RX다배관 30A", 1,
                new BigDecimal("100000"), new BigDecimal("100000"), "CONFIRMED", "INBOUND"));

        mvc.perform(post("/admin/purchase-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(request(sourceSlipId, sourceLineId,
                                SalesTaxType.TAXABLE, BigDecimal.ONE, new BigDecimal("100000"),
                                new BigDecimal("100000")))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_SOURCE_PARTNER_MISSING"));

        assertThat(purchaseSlipRepository.count()).isEqualTo(before);
    }

    private static CreatePurchaseAccountingSlipRequest request(UUID sourceSlipId, UUID sourceLineId,
            SalesTaxType taxType, BigDecimal qty, BigDecimal unitPrice, BigDecimal allocatedAmount) {
        return request(sourceSlipId, sourceLineId, taxType, qty, unitPrice, allocatedAmount, "P-2026-0001");
    }

    private static CreatePurchaseAccountingSlipRequest request(UUID sourceSlipId, UUID sourceLineId,
            SalesTaxType taxType, BigDecimal qty, BigDecimal unitPrice, BigDecimal allocatedAmount,
            String partnerCode) {
        return new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, partnerCode, "(주)한국공조",
                taxType, "IT Docker 실서버 검증",
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", qty, unitPrice,
                        List.of(new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "IN-2026-05-0042", sourceLineId, 1,
                                qty, allocatedAmount)))));
    }

    // ===== #850 R1 적대검증 보강 — HTTP 입력 계약(HIGH-2)·in-request 경계/누적(MED-1/3) 매입 대칭 =====

    /**
     * HIGH-2 입력 계약(HTTP) — Controller {@code @Valid @RequestBody} 가 금액/수량 음수·0·null·scale
     * 초과·{@code @Digits} overflow·라인 원소 null 을 모두 400 {@code INVALID_INPUT} 으로 거부한다.
     */
    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidHttpRequests")
    void POST_admin_purchase_slips_입력계약위반은_400_INVALID_INPUT(
            String label, CreatePurchaseAccountingSlipRequest req) throws Exception {
        mvc.perform(post("/admin/purchase-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(req)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    static Stream<Arguments> invalidHttpRequests() {
        return Stream.of(
                Arguments.of("금액_음수", invalidHttpRequest(BigDecimal.ONE, new BigDecimal("-100"))),
                Arguments.of("금액_0", invalidHttpRequest(BigDecimal.ONE, BigDecimal.ZERO)),
                Arguments.of("금액_null", invalidHttpRequest(BigDecimal.ONE, null)),
                Arguments.of("수량_음수", invalidHttpRequest(new BigDecimal("-1"), new BigDecimal("100"))),
                Arguments.of("수량_0", invalidHttpRequest(BigDecimal.ZERO, new BigDecimal("100"))),
                Arguments.of("수량_null", invalidHttpRequest(null, new BigDecimal("100"))),
                Arguments.of("금액_소수3자리_scale초과", invalidHttpRequest(BigDecimal.ONE, new BigDecimal("1.001"))),
                Arguments.of("수량_소수4자리_scale초과", invalidHttpRequest(new BigDecimal("1.0001"), new BigDecimal("100"))),
                Arguments.of("금액_정수14자리_Digits초과",
                        invalidHttpRequest(BigDecimal.ONE, new BigDecimal("10000000000000"))),
                Arguments.of("수량_정수10자리_Digits초과",
                        invalidHttpRequest(new BigDecimal("1000000000"), new BigDecimal("100"))),
                Arguments.of("lines_원소_null", new CreatePurchaseAccountingSlipRequest(
                        LocalDate.of(2026, 5, 19), PARTNER_ID, "P-2026-0001", "(주)한국공조",
                        SalesTaxType.TAXABLE, "input contract",
                        Arrays.asList((CreatePurchaseAccountingSlipRequest.LineRequest) null))));
    }

    private static CreatePurchaseAccountingSlipRequest invalidHttpRequest(BigDecimal allocQty, BigDecimal allocAmount) {
        return new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-2026-0001", "(주)한국공조",
                SalesTaxType.TAXABLE, "input contract",
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", new BigDecimal("10"), new BigDecimal("150000"),
                        List.of(new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "IN-2026-05-0042", UUID.randomUUID(), 1,
                                allocQty, allocAmount)))));
    }

    /**
     * MED-1 in-request 경계(HTTP) — 동일 원천 한 라인 내 {@code 750000+750000=1,500,000}(=원천 잔여)·
     * 수량 {@code 5+5=10}(=잔여) 는 정확 경계라 통과하여 실 DB 에 영속된다.
     */
    @Test
    void POST_admin_purchase_slips_in_request_동일원천_두배분_합계_잔여경계_통과() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-INBND");
        stubConfirmedSourceLine(sourceSlipId, sourceLineId, new BigDecimal("1500000"));

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-2026-0001", "(주)한국공조",
                SalesTaxType.TAXABLE, "in-request boundary",
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", new BigDecimal("10"), new BigDecimal("150000"), List.of(
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "IN-2026-05-0042", sourceLineId, 1,
                                new BigDecimal("5"), new BigDecimal("750000")),
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "IN-2026-05-0042", sourceLineId, 1,
                                new BigDecimal("5"), new BigDecimal("750000"))))));

        mvc.perform(post("/admin/purchase-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));

        assertThat(purchaseSlipRepository.findBySlipNo("2026/05/19-INBND")).isPresent();
    }

    /**
     * MED-3 in-request 누적 초과(HTTP·실 DB) — 한 요청 내 {@code 750000+900000>1,500,000} 은 422
     * {@code SAS_OVER_ALLOCATION} 이고, 거부 후 전표가 실 DB 에 0행 영속(mock times(0) 아닌 실 조회)이어야 한다.
     */
    @Test
    void POST_admin_purchase_slips_in_request_누적초과는_422_이고_전표_미저장() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("2026/05/19-INOVER");
        stubConfirmedSourceLine(sourceSlipId, sourceLineId, new BigDecimal("1500000"));
        long before = purchaseSlipRepository.count();

        CreatePurchaseAccountingSlipRequest req = new CreatePurchaseAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), PARTNER_ID, "P-2026-0001", "(주)한국공조",
                SalesTaxType.TAXABLE, "in-request over",
                List.of(new CreatePurchaseAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", new BigDecimal("11"), new BigDecimal("150000"), List.of(
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "IN-2026-05-0042", sourceLineId, 1,
                                new BigDecimal("5"), new BigDecimal("750000")),
                        new CreatePurchaseAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "IN-2026-05-0042", sourceLineId, 1,
                                new BigDecimal("6"), new BigDecimal("900000"))))));

        mvc.perform(post("/admin/purchase-slips")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000114")
                        .header("X-User-Role", "MASTER")
                        .content(om.writeValueAsString(req)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SAS_OVER_ALLOCATION"));

        assertThat(purchaseSlipRepository.findBySlipNo("2026/05/19-INOVER")).isEmpty();
        assertThat(purchaseSlipRepository.count()).isEqualTo(before);
    }
}
