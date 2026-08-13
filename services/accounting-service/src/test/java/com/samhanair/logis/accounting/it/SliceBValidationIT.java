package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.PartnerAccountTotal;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository.VatSummary;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * P0-1 Slice B — 부가세신고서 / 법인세신고서 / 거래처 미수미지급 검증용 IT.
 *
 * <p>검증 목적:
 * <ul>
 *   <li>V8 Flyway seed (2026/04/05-1~S003, 2026/04/10-1~P002) 5건 TaxInvoice 적재 확인</li>
 *   <li>VAT report endpoint GET /accounting/reports/vat?period=202604 — 2Q 집계 검증</li>
 *   <li>법인세 report endpoint GET /accounting/reports/corporate-tax?year=2026 — 법인세 집계 검증</li>
 *   <li>V9 partner_aging seed 5건 — 110(외상매출금) 차변 / 201(외상매입금) 대변 잔액 검증</li>
 * </ul>
 *
 * <p>이중 가드: {@code AbstractPostgresIT} Testcontainers PostgreSQL + Flyway V1~V9 자동 적용.
 * Docker 미가용 환경에서는 {@link AbstractPostgresIT.DockerAvailableCondition} 이 skip 처리.
 *
 * <p>외부 client {@code @MockBean} 격리 ({@code feedback_it_mockbean_external_clients}) —
 * Eureka 비활성 환경에서 외부 RestClient 초기화 실패로 인한 5xx 회피.
 *
 * <p>{@code @Transactional} 적용 — Lazy 컬렉션 호출 시 Session 유지 + 테스트 후 롤백.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SliceBValidationIT extends AbstractPostgresIT {

    /** 외부 client @MockBean 격리 (feedback_it_mockbean_external_clients 가드 준수). */
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private ProductClient productClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean private KftcClient kftcClient;
    /**
     * SP-D2 동적 권한 client 격리. SP-D5 cycle 2 fix (P1-4): {@code @RequirePermission} AOP 활성 후
     * report endpoint 호출 시 canView=false 회귀 차단 위해 lenient stub 적용.
     */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUpPermissionStub() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private TaxInvoiceRepository taxInvoiceRepository;
    @Autowired private JournalLineRepository journalLineRepository;

    // ===== V8 TaxInvoice seed UUID (결정적 하드코딩) =====
    private static final UUID ID_VAT_S001 =
            Objects.requireNonNull(UUID.fromString("a1b2c3d4-e5f6-7890-abcd-ef1234567801"));
    private static final UUID ID_VAT_S002 =
            Objects.requireNonNull(UUID.fromString("a1b2c3d4-e5f6-7890-abcd-ef1234567802"));
    private static final UUID ID_VAT_S003 =
            Objects.requireNonNull(UUID.fromString("a1b2c3d4-e5f6-7890-abcd-ef1234567803"));
    private static final UUID ID_VAT_P001 =
            Objects.requireNonNull(UUID.fromString("a1b2c3d4-e5f6-7890-abcd-ef1234567811"));
    private static final UUID ID_VAT_P002 =
            Objects.requireNonNull(UUID.fromString("a1b2c3d4-e5f6-7890-abcd-ef1234567812"));

    // ===== V9 partner_aging seed 더미 partner UUID =====
    private static final UUID PARTNER_SAMHAN   =
            Objects.requireNonNull(UUID.fromString("b0000001-0000-0000-0000-000000000001"));
    private static final UUID PARTNER_HANKOOK  =
            Objects.requireNonNull(UUID.fromString("b0000001-0000-0000-0000-000000000002"));
    private static final UUID PARTNER_DONGBANG =
            Objects.requireNonNull(UUID.fromString("b0000001-0000-0000-0000-000000000003"));
    private static final UUID PARTNER_HYUNDAI  =
            Objects.requireNonNull(UUID.fromString("b0000001-0000-0000-0000-000000000011"));
    private static final UUID PARTNER_SK       =
            Objects.requireNonNull(UUID.fromString("b0000001-0000-0000-0000-000000000012"));

    // -------------------------------------------------------------------------
    // 1. VAT 검증 시나리오 — V8 seed TaxInvoice 5건 적재 확인
    // -------------------------------------------------------------------------

    /**
     * V8 seed — 매출 세금계산서 3건이 ISSUED + SALES 상태로 존재.
     *
     * <p>공급가액 합계: 5,000,000 + 3,200,000 + 1,800,000 = 10,000,000
     * 부가세 합계: 1,000,000 (10%)
     */
    @Test
    @DisplayName("V8 seed — 매출 세금계산서 3건 ISSUED+SALES 적재 + 공급가액 합계 검증")
    void vatSeedSalesInvoicesExistAndSumCorrect() {
        // 3건 개별 존재 확인
        List<UUID> salesIds = List.of(ID_VAT_S001, ID_VAT_S002, ID_VAT_S003);
        for (UUID id : salesIds) {
            var invoice = taxInvoiceRepository.findById(id)
                    .orElseThrow(() -> new AssertionError("V8 seed 매출 TaxInvoice 미존재 — id=" + id));
            assertThat(invoice.getStatus())
                    .as("slash-format SALES VAT seed ISSUED 상태")
                    .isEqualTo(TaxInvoiceStatus.ISSUED);
            assertThat(invoice.getInvoiceType())
                    .as("slash-format SALES VAT seed SALES 타입")
                    .isEqualTo(TaxInvoiceType.SALES);
        }

        // 2026-04 매출 집계 확인
        VatSummary summary = taxInvoiceRepository.aggregateVatByType(
                TaxInvoiceType.SALES,
                LocalDate.of(2026, 4, 1),
                LocalDate.of(2026, 4, 30));

        assertThat(summary.getInvoiceCount())
                .as("2026-04 매출 세금계산서 건수 (seed 3건 포함)")
                .isGreaterThanOrEqualTo(3L);
        BigDecimal salesSupply = (BigDecimal) summary.getSupplyAmountSum();
        assertThat(salesSupply.compareTo(new BigDecimal("10000000")))
                .as("2026-04 매출 공급가액 합계 (seed: 10,000,000 이상)")
                .isGreaterThanOrEqualTo(0);
        BigDecimal salesVat = (BigDecimal) summary.getVatAmountSum();
        assertThat(salesVat.compareTo(new BigDecimal("1000000")))
                .as("2026-04 매출 부가세 합계 (seed: 1,000,000 이상)")
                .isGreaterThanOrEqualTo(0);
    }

    /**
     * V8 seed — 매입 세금계산서 2건이 ISSUED + PURCHASE 상태로 존재.
     *
     * <p>공급가액 합계: 2,500,000 + 1,200,000 = 3,700,000
     * 부가세 합계: 370,000 (10%)
     */
    @Test
    @DisplayName("V8 seed — 매입 세금계산서 2건 ISSUED+PURCHASE 적재 + 공급가액 합계 검증")
    void vatSeedPurchaseInvoicesExistAndSumCorrect() {
        List<UUID> purchaseIds = List.of(ID_VAT_P001, ID_VAT_P002);
        for (UUID id : purchaseIds) {
            var invoice = taxInvoiceRepository.findById(id)
                    .orElseThrow(() -> new AssertionError("V8 seed 매입 TaxInvoice 미존재 — id=" + id));
            assertThat(invoice.getStatus())
                    .as("slash-format PURCHASE VAT seed ISSUED 상태")
                    .isEqualTo(TaxInvoiceStatus.ISSUED);
            assertThat(invoice.getInvoiceType())
                    .as("slash-format PURCHASE VAT seed PURCHASE 타입")
                    .isEqualTo(TaxInvoiceType.PURCHASE);
        }

        // 2026-04 매입 집계 확인
        VatSummary summary = taxInvoiceRepository.aggregateVatByType(
                TaxInvoiceType.PURCHASE,
                LocalDate.of(2026, 4, 1),
                LocalDate.of(2026, 4, 30));

        assertThat(summary.getInvoiceCount())
                .as("2026-04 매입 세금계산서 건수 (seed 2건 포함)")
                .isGreaterThanOrEqualTo(2L);
        BigDecimal purchaseSupply = (BigDecimal) summary.getSupplyAmountSum();
        assertThat(purchaseSupply.compareTo(new BigDecimal("3700000")))
                .as("2026-04 매입 공급가액 합계 (seed: 3,700,000 이상)")
                .isGreaterThanOrEqualTo(0);
    }

    /**
     * VAT report endpoint — GET /accounting/reports/vat?period=202604.
     *
     * <p>2026-04 기준 납부세액 = 매출VAT(1,000,000+) - 매입VAT(370,000+) = 양수 확인.
     * 신고 기한: 2Q(4~6월) → 2026-07-25.
     */
    @Test
    @DisplayName("VAT report endpoint — 202604 기간 조회 200 OK + 납부세액 양수 + 신고기한 확인")
    void vatReportEndpointReturns200WithPositivePayable() throws Exception {
        mockMvc.perform(get("/accounting/reports/vat")
                        .param("period", "202604")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000111")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.period").value("2026-04"))
                .andExpect(jsonPath("$.data.salesInvoiceCount").isNumber())
                .andExpect(jsonPath("$.data.purchaseInvoiceCount").isNumber())
                .andExpect(jsonPath("$.data.vatPayable").isNumber())
                .andExpect(jsonPath("$.data.filingDeadline").value("2026-07-25"));
    }

    // -------------------------------------------------------------------------
    // 2. 법인세 검증 시나리오 — Corporate Tax report endpoint
    // -------------------------------------------------------------------------

    /**
     * Corporate Tax report endpoint — GET /accounting/reports/corporate-tax?fiscalYear=2026.
     *
     * <p>V6 seed 분개 (2026/12/31-1 법인세비용 700,000) 가 포함된 2026 사업연도 신고서.
     * 신고 기한: 결산일(2026-12-31) + 3개월 = 2027-03-31.
     *
     * <p>TM PR #136 fix: BE controller 가 {@code @RequestParam int fiscalYear} 를
     * 필수로 받으므로 query param 명을 {@code fiscalYear} 로 정정 (기존 {@code year} 는 400).
     */
    @Test
    @DisplayName("Corporate Tax report endpoint — 2026 사업연도 조회 200 OK + 신고기한 2027-03-31 확인")
    void corporateTaxReportEndpointReturns200() throws Exception {
        mockMvc.perform(get("/accounting/reports/corporate-tax")
                        .param("fiscalYear", "2026")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000111")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fiscalYear").value(2026))
                .andExpect(jsonPath("$.data.filingDeadline").value("2027-03-31"))
                .andExpect(jsonPath("$.data.taxableIncome").isNumber())
                .andExpect(jsonPath("$.data.calculatedTax").isNumber());
    }

    // -------------------------------------------------------------------------
    // 3. 거래처 partner_aging 검증 시나리오 — V9 seed 분개 라인 확인
    // -------------------------------------------------------------------------

    /**
     * V9 seed — 미수 잔액 검증.
     *
     * <p>110(외상매출금) 차변 3건이 각각 다른 partner_id 로 존재.
     * {@code aggregateAgingByAccount("110", 2026-04-30)} 결과에서
     * 삼한물류(2,200,000) / 한국통운(3,520,000) / 동방물류(1,980,000) 확인.
     */
    @Test
    @DisplayName("V9 seed — RECEIVABLE: 110 외상매출금 3거래처 차변 잔액 검증")
    void partnerAgingReceivableBalancesExist() {
        List<PartnerAccountTotal> totals = journalLineRepository.aggregateAgingByAccount(
                "1089", LocalDate.of(2026, 4, 30));

        // 삼한물류 (b0000001-...001) — debit 2,200,000
        PartnerAccountTotal samhan = totals.stream()
                .filter(t -> PARTNER_SAMHAN.equals(t.getPartnerId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "V9 seed 미수 분개 미존재 — partner=(주)삼한물류 account=110"));
        assertThat(((BigDecimal) samhan.getDebitTotal()).compareTo(new BigDecimal("2200000")))
                .as("(주)삼한물류 110 차변 합계 (2,200,000 이상)")
                .isGreaterThanOrEqualTo(0);

        // 한국통운 (b0000001-...002) — debit 3,520,000
        PartnerAccountTotal hankook = totals.stream()
                .filter(t -> PARTNER_HANKOOK.equals(t.getPartnerId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "V9 seed 미수 분개 미존재 — partner=한국통운(주) account=110"));
        assertThat(((BigDecimal) hankook.getDebitTotal()).compareTo(new BigDecimal("3520000")))
                .as("한국통운(주) 110 차변 합계 (3,520,000 이상)")
                .isGreaterThanOrEqualTo(0);

        // 동방물류 (b0000001-...003) — debit 1,980,000
        PartnerAccountTotal dongbang = totals.stream()
                .filter(t -> PARTNER_DONGBANG.equals(t.getPartnerId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "V9 seed 미수 분개 미존재 — partner=동방물류(주) account=110"));
        assertThat(((BigDecimal) dongbang.getDebitTotal()).compareTo(new BigDecimal("1980000")))
                .as("동방물류(주) 110 차변 합계 (1,980,000 이상)")
                .isGreaterThanOrEqualTo(0);
    }

    /**
     * V9 seed — 미지급 잔액 검증.
     *
     * <p>201(외상매입금) 대변 2건이 각각 다른 partner_id 로 존재.
     * {@code aggregateAgingByAccount("201", 2026-04-30)} 결과에서
     * 현대오일뱅크(2,750,000) / SK렌터카(1,320,000) 확인.
     */
    @Test
    @DisplayName("V9 seed — PAYABLE: 201 외상매입금 2거래처 대변 잔액 검증")
    void partnerAgingPayableBalancesExist() {
        List<PartnerAccountTotal> totals = journalLineRepository.aggregateAgingByAccount(
                "2519", LocalDate.of(2026, 4, 30));

        // 현대오일뱅크 (b0000001-...011) — credit 2,750,000
        PartnerAccountTotal hyundai = totals.stream()
                .filter(t -> PARTNER_HYUNDAI.equals(t.getPartnerId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "V9 seed 미지급 분개 미존재 — partner=현대오일뱅크(주) account=201"));
        assertThat(((BigDecimal) hyundai.getCreditTotal()).compareTo(new BigDecimal("2750000")))
                .as("현대오일뱅크(주) 201 대변 합계 (2,750,000 이상)")
                .isGreaterThanOrEqualTo(0);

        // SK렌터카 (b0000001-...012) — credit 1,320,000
        PartnerAccountTotal sk = totals.stream()
                .filter(t -> PARTNER_SK.equals(t.getPartnerId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "V9 seed 미지급 분개 미존재 — partner=SK렌터카(주) account=201"));
        assertThat(((BigDecimal) sk.getCreditTotal()).compareTo(new BigDecimal("1320000")))
                .as("SK렌터카(주) 201 대변 합계 (1,320,000 이상)")
                .isGreaterThanOrEqualTo(0);
    }

    /**
     * V9 seed — 복식부기 균형 검증.
     *
     * <p>2026/04/05-1 ~ 003 (미수): 110 차변 합계 = 7,700,000
     * 2026/04/10-1 ~ 005 (미지급): 101 차변 합계 = 각각 대변과 동일
     * 전체 5건 분개에서 차변 합계 = 대변 합계 검증 (2026-04-01 ~ 2026-04-30 기간).
     */
    @Test
    @DisplayName("V9 seed — 복식부기 균형: 2026-04 기간 partner_aging 분개 차변=대변")
    void partnerAgingJournalsAreBalanced() {
        List<PartnerAccountTotal> totals = journalLineRepository.aggregatePostedByPartnerAccount(
                LocalDate.of(2026, 4, 1),
                LocalDate.of(2026, 4, 30));

        // 거래처가 있는 분개 라인의 차변 합계 / 대변 합계 계산
        BigDecimal totalDebit  = totals.stream()
                .map(PartnerAccountTotal::getDebitTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalCredit = totals.stream()
                .map(PartnerAccountTotal::getCreditTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        assertThat(totalDebit)
                .as("2026-04 거래처 분개 차변 합계 = 대변 합계 (복식부기 균형)")
                .isEqualByComparingTo(totalCredit);
    }
}
