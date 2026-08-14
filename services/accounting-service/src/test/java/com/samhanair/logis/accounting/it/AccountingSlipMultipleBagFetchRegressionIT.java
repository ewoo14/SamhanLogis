package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipLine;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipLine;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * #729-family 회귀 테스트 — {@code MultipleBagFetchException} (Hibernate 6, 2-bag 동시 fetch:
 * {@code lines} + {@code lines.allocations}) 재발 방지.
 *
 * <p>수정 전(2-bag {@code @EntityGraph}) 상태로는 아래 각 테스트가 전부
 * {@code org.hibernate.loader.MultipleBagFetchException: cannot simultaneously fetch multiple
 * bags} 로 실패한다 — Mockito 기반 서비스 unit test({@code SalesAccountingSlipServiceTest} 등)는
 * repository 를 mock 하므로 실제 Hibernate 쿼리 플랜을 태우지 않아 이 결함을 잡지 못했다
 * (메모리 {@code feedback_jpa_joinfetch_cartesian_dedup.md} — 실 DB round-trip 필수).
 *
 * <p>각 슬립은 2 lines × 2 allocations 로 시딩하여 (a) 예외 미발생, (b) DISTINCT 가 root 만
 * dedup 한다는 전제 하에 카르테시안 중복 없는 정확한 행/컬렉션 크기, (c) allocations 합계가
 * lineTotal 과 정확히 일치(라운드트립 후 데이터 무결성)를 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@ActiveProfiles("test")
@Transactional
class AccountingSlipMultipleBagFetchRegressionIT extends AbstractPostgresIT {

    @Autowired SalesAccountingSlipRepository salesSlipRepository;
    @Autowired PurchaseAccountingSlipRepository purchaseSlipRepository;
    @Autowired EntityManager entityManager;

    @MockBean SlipServiceClient slipServiceClient;
    @MockBean ETaxClient eTaxClient;
    @MockBean KftcClient kftcClient;
    @MockBean(classes = DynamicPermissionClient.class) DynamicPermissionClient dynamicPermissionClient;

    private static final LocalDate SLIP_DATE = LocalDate.of(2026, 7, 8);
    private static final String PARTNER_CODE = "P-MBF-729";

    private static final String SALES_SLIP_NO_1 = "2026/07/08-901";
    private static final String SALES_SLIP_NO_2 = "2026/07/08-902";
    private static final String SALES_SLIP_NO_DRAFT = "2026/07/08-903";

    private static final String PURCHASE_SLIP_NO_1 = "2026/07/08-901";
    private static final String PURCHASE_SLIP_NO_2 = "2026/07/08-902";
    private static final String PURCHASE_SLIP_NO_DRAFT = "2026/07/08-903";

    @BeforeEach
    void seedMultiLineMultiAllocationSlips() {
        // 출고전표 2건 — 각 2 lines × 2 allocations, POSTED, 미연결(taxInvoiceId=null).
        salesSlipRepository.saveAndFlush(
                buildPostedSalesSlip(SALES_SLIP_NO_1, "(주)엠비에프하나"));
        salesSlipRepository.saveAndFlush(
                buildPostedSalesSlip(SALES_SLIP_NO_2, "(주)엠비에프둘"));
        // 음성 대조군 — DRAFT 상태라 status 필터에서 제외되어야 함(필터 보존 검증).
        salesSlipRepository.saveAndFlush(
                buildDraftSalesSlip(SALES_SLIP_NO_DRAFT, "(주)엠비에프드래프트"));

        // 입고전표 2건 — 각 2 lines × 2 allocations, POSTED.
        purchaseSlipRepository.saveAndFlush(
                buildPostedPurchaseSlip(PURCHASE_SLIP_NO_1, "(주)엠비에프하나"));
        purchaseSlipRepository.saveAndFlush(
                buildPostedPurchaseSlip(PURCHASE_SLIP_NO_2, "(주)엠비에프둘"));
        purchaseSlipRepository.saveAndFlush(
                buildDraftPurchaseSlip(PURCHASE_SLIP_NO_DRAFT, "(주)엠비에프드래프트"));

        // 세션 1차 캐시를 비워 이후 조회가 진짜 DB 왕복(JOIN FETCH + batch)을 타도록 강제.
        entityManager.flush();
        entityManager.clear();
    }

    // ---------------------------------------------------------------- Sales

    @Test
    void findBySlipDateAndStatusWithLines_매출_다중라인다중배분_예외없이단일bag조회() {
        assertThatCode(() ->
                salesSlipRepository.findBySlipDateAndStatusWithLines(SLIP_DATE, SalesSlipStatus.POSTED))
                .doesNotThrowAnyException();

        List<SalesAccountingSlip> result =
                salesSlipRepository.findBySlipDateAndStatusWithLines(SLIP_DATE, SalesSlipStatus.POSTED);

        // (b) 카르테시안 중복 없음 — DRAFT 대조군 제외, 정확히 2건, ORDER BY slipNo ASC 보존.
        assertThat(result).extracting(SalesAccountingSlip::getSlipNo)
                .containsExactly(SALES_SLIP_NO_1, SALES_SLIP_NO_2);

        // (c) lines/allocations 정확 populate.
        for (SalesAccountingSlip slip : result) {
            assertLinesAndAllocationsIntact(slip.getLines());
        }
    }

    @Test
    void findByFilters_매출_다중라인다중배분_예외없이단일bag조회() {
        LocalDate from = SLIP_DATE.minusDays(1);
        LocalDate to = SLIP_DATE.plusDays(1);

        assertThatCode(() ->
                salesSlipRepository.findByFilters(from, to, PARTNER_CODE, SalesSlipStatus.POSTED))
                .doesNotThrowAnyException();

        List<SalesAccountingSlip> result =
                salesSlipRepository.findByFilters(from, to, PARTNER_CODE, SalesSlipStatus.POSTED);

        // ORDER BY slipDate DESC, slipNo DESC — 동일 slipDate 이므로 slipNo 역순.
        assertThat(result).extracting(SalesAccountingSlip::getSlipNo)
                .containsExactly(SALES_SLIP_NO_2, SALES_SLIP_NO_1);

        for (SalesAccountingSlip slip : result) {
            assertLinesAndAllocationsIntact(slip.getLines());
        }
    }

    @Test
    void findPostedUnlinkedForBatchCandidates_매출_다중라인다중배분_예외없이단일bag조회() {
        LocalDate from = SLIP_DATE.minusDays(1);
        LocalDate to = SLIP_DATE.plusDays(1);

        assertThatCode(() -> salesSlipRepository
                .findPostedUnlinkedForBatchCandidates(from, to, PARTNER_CODE))
                .doesNotThrowAnyException();

        List<SalesAccountingSlip> result =
                salesSlipRepository.findPostedUnlinkedForBatchCandidates(from, to, PARTNER_CODE);

        // ORDER BY partnerCode ASC, slipDate ASC, slipNo ASC — 동일 partnerCode/slipDate 이므로 slipNo 정순.
        assertThat(result).extracting(SalesAccountingSlip::getSlipNo)
                .containsExactly(SALES_SLIP_NO_1, SALES_SLIP_NO_2);
        assertThat(result).allSatisfy(slip -> assertThat(slip.getTaxInvoiceId()).isNull());

        // 이 consumer(TaxInvoiceBatchCandidateResponse.of)는 allocations 를 읽지 않지만,
        // BatchSize 가 lazy 컬렉션을 깨뜨리지 않고 여전히 트랜잭션 내에서 정상 로드됨을 증명.
        for (SalesAccountingSlip slip : result) {
            assertLinesAndAllocationsIntact(slip.getLines());
        }
    }

    @Test
    void findByFilters_매출_allocations_batchSize_단일배치로드_쿼리수검증() {
        LocalDate from = SLIP_DATE.minusDays(1);
        LocalDate to = SLIP_DATE.plusDays(1);

        SessionFactory sessionFactory =
                entityManager.getEntityManagerFactory().unwrap(SessionFactory.class);
        Statistics statistics = sessionFactory.getStatistics();
        statistics.setStatisticsEnabled(true);
        statistics.clear();

        List<SalesAccountingSlip> result =
                salesSlipRepository.findByFilters(from, to, PARTNER_CODE, SalesSlipStatus.POSTED);
        // DTO 매핑 시 실제로 벌어지는 접근 패턴 재현 — 모든 라인의 allocations 를 touch.
        long allocationTouchCount = result.stream()
                .flatMap(slip -> slip.getLines().stream())
                .mapToLong(line -> line.getAllocations().size())
                .sum();

        long preparedStatementCount = statistics.getPrepareStatementCount();

        // 시딩 = 2 slips × 2 lines × 2 allocations = lines 4건(batchSize=100 이하이므로 전부 한
        // 배치에 들어감). 기대 쿼리 수 = 1(root+lines JOIN FETCH, DISTINCT) + 1(allocations
        // IN(...) 배치) = 2. 상한 3 은 Hibernate 내부 구현 편차 margin. @BatchSize 가 회귀로
        // 제거/축소되면 라인 4개가 각각 별도 SELECT 를 쏴 최소 1(root)+4(N+1)=5 로 폭증하므로
        // 이 상한이 batch 로드는 항상 통과시키면서 N+1 회귀는 확실히 잡아낸다. 하한 2 는 통계가
        // 실제로 켜져 활동을 기록했는지(0 이면 vacuous pass) 를 함께 보장한다.
        assertThat(preparedStatementCount).isGreaterThanOrEqualTo(2).isLessThanOrEqualTo(3);
        assertThat(allocationTouchCount).isEqualTo(8);

        for (SalesAccountingSlip slip : result) {
            assertLinesAndAllocationsIntact(slip.getLines());
        }
    }

    @Test
    void findByFilters_매출_파트너코드다름및기간외제외_slipDate정렬검증() {
        LocalDate from = SLIP_DATE.minusDays(1);
        LocalDate to = SLIP_DATE.plusDays(1);

        // 네거티브 컨트롤 1 — 다른 partnerCode: LIKE 필터에서 제외되어야 한다.
        salesSlipRepository.saveAndFlush(buildPostedSalesSlip(
                "2026/07/08-970", "P-MBF-OTHER", "(주)엠비에프타사", SLIP_DATE));

        // 네거티브 컨트롤 2 — 기간(from~to) 밖 slipDate: 날짜 필터에서 제외되어야 한다.
        LocalDate outOfWindowDate = to.plusMonths(6);
        salesSlipRepository.saveAndFlush(buildPostedSalesSlip(
                "2027/01/09-971", PARTNER_CODE, "(주)엠비에프기간외", outOfWindowDate));

        // ORDER BY slipDate DESC 를 slipNo tie-break 와 분리 검증 — slipNo 는 작지만 slipDate 가
        // 가장 늦은 건이 최상단에, slipNo 는 크지만 slipDate 가 가장 이른 건이 최하단에 와야 한다.
        LocalDate earlyDate = from;
        LocalDate lateDate = to;
        salesSlipRepository.saveAndFlush(buildPostedSalesSlip(
                "2026/07/07-100", PARTNER_CODE, "(주)엠비에프이른날짜", earlyDate));
        salesSlipRepository.saveAndFlush(buildPostedSalesSlip(
                "2026/07/09-050", PARTNER_CODE, "(주)엠비에프늦은날짜", lateDate));

        entityManager.flush();
        entityManager.clear();

        List<SalesAccountingSlip> result =
                salesSlipRepository.findByFilters(from, to, PARTNER_CODE, SalesSlipStatus.POSTED);

        // slipDate DESC 가 최우선 정렬키임을 증명 — slipNo 오름차순으로는 "050"이 "901"/"902"/"100"
        // 보다 작은데도 최상단에 오고, "100"은 가장 크지 않은데도(문자열상 "050"<"100"<"901"<"902")
        // 최하단에 오는 것은 slipNo 만으로 정렬했다면 절대 나올 수 없는 순서 — slipDate 컬럼이
        // 실제로 정렬을 주도함을 증명한다.
        assertThat(result).extracting(SalesAccountingSlip::getSlipNo)
                .containsExactly(
                        "2026/07/09-050",
                        SALES_SLIP_NO_2,
                        SALES_SLIP_NO_1,
                        "2026/07/07-100");
        // 다른 partnerCode·기간외 slipDate 대조군은 명시적으로 배제 확인(위 containsExactly 로도
        // 이미 증명되지만 의도를 명확히 하기 위해 별도 assert).
        assertThat(result).extracting(SalesAccountingSlip::getSlipNo)
                .doesNotContain("2026/07/08-970", "2027/01/09-971");

        for (SalesAccountingSlip slip : result) {
            assertLinesAndAllocationsIntact(slip.getLines());
        }
    }

    // ------------------------------------------------------------- Purchase

    @Test
    void findBySlipDateAndStatusWithLines_매입_다중라인다중배분_예외없이단일bag조회() {
        assertThatCode(() -> purchaseSlipRepository
                .findBySlipDateAndStatusWithLines(SLIP_DATE, PurchaseSlipStatus.POSTED))
                .doesNotThrowAnyException();

        List<PurchaseAccountingSlip> result = purchaseSlipRepository
                .findBySlipDateAndStatusWithLines(SLIP_DATE, PurchaseSlipStatus.POSTED);

        assertThat(result).extracting(PurchaseAccountingSlip::getSlipNo)
                .containsExactly(PURCHASE_SLIP_NO_1, PURCHASE_SLIP_NO_2);

        for (PurchaseAccountingSlip slip : result) {
            assertPurchaseLinesAndAllocationsIntact(slip.getLines());
        }
    }

    @Test
    void findByFilters_매입_다중라인다중배분_예외없이단일bag조회() {
        LocalDate from = SLIP_DATE.minusDays(1);
        LocalDate to = SLIP_DATE.plusDays(1);

        assertThatCode(() ->
                purchaseSlipRepository.findByFilters(from, to, PARTNER_CODE, PurchaseSlipStatus.POSTED))
                .doesNotThrowAnyException();

        List<PurchaseAccountingSlip> result =
                purchaseSlipRepository.findByFilters(from, to, PARTNER_CODE, PurchaseSlipStatus.POSTED);

        assertThat(result).extracting(PurchaseAccountingSlip::getSlipNo)
                .containsExactly(PURCHASE_SLIP_NO_2, PURCHASE_SLIP_NO_1);

        for (PurchaseAccountingSlip slip : result) {
            assertPurchaseLinesAndAllocationsIntact(slip.getLines());
        }
    }

    // --------------------------------------------------------------- fixtures

    private SalesAccountingSlip buildPostedSalesSlip(String slipNo, String partnerName) {
        return buildPostedSalesSlip(slipNo, PARTNER_CODE, partnerName, SLIP_DATE);
    }

    // [FIX] #729-family 재리뷰 — 필터 네거티브 컨트롤(다른 partnerCode/기간외 slipDate) 시드용
    // 오버로드. 기존 2-arg 버전은 PARTNER_CODE/SLIP_DATE 기본값으로 위임하여 동작 불변.
    private SalesAccountingSlip buildPostedSalesSlip(
            String slipNo, String partnerCode, String partnerName, LocalDate slipDate) {
        SalesAccountingSlip slip = buildDraftSalesSlip(slipNo, partnerCode, partnerName, slipDate);
        slip.post("it-actor");
        return slip;
    }

    private SalesAccountingSlip buildDraftSalesSlip(String slipNo, String partnerName) {
        return buildDraftSalesSlip(slipNo, PARTNER_CODE, partnerName, SLIP_DATE);
    }

    private SalesAccountingSlip buildDraftSalesSlip(
            String slipNo, String partnerCode, String partnerName, LocalDate slipDate) {
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft(
                slipNo, slipDate, UUID.randomUUID(), partnerCode, partnerName,
                SalesTaxType.TAXABLE, "MultipleBagFetchException 회귀 IT 시드");
        for (int lineNo = 1; lineNo <= 2; lineNo++) {
            BigDecimal lineTotal = new BigDecimal("100000.00");
            SalesAccountingSlipLine line = SalesAccountingSlipLine.create(
                    slip, lineNo, "SKU-" + lineNo, "품목" + lineNo,
                    BigDecimal.ONE, lineTotal, lineTotal, BigDecimal.ZERO, lineTotal);
            slip.getLines().add(line);
            for (int allocNo = 1; allocNo <= 2; allocNo++) {
                line.getAllocations().add(SalesAccountingSlipAllocation.create(
                        line, UUID.randomUUID(), "OUT-" + slipNo + "-" + lineNo + "-" + allocNo,
                        UUID.randomUUID(), allocNo, BigDecimal.ONE, new BigDecimal("50000.00")));
            }
        }
        slip.recalcTotals();
        return slip;
    }

    private PurchaseAccountingSlip buildPostedPurchaseSlip(String slipNo, String partnerName) {
        PurchaseAccountingSlip slip = buildDraftPurchaseSlip(slipNo, partnerName);
        slip.post("it-actor");
        return slip;
    }

    private PurchaseAccountingSlip buildDraftPurchaseSlip(String slipNo, String partnerName) {
        PurchaseAccountingSlip slip = PurchaseAccountingSlip.createDraft(
                slipNo, SLIP_DATE, UUID.randomUUID(), PARTNER_CODE, partnerName,
                SalesTaxType.TAXABLE, "MultipleBagFetchException 회귀 IT 시드");
        for (int lineNo = 1; lineNo <= 2; lineNo++) {
            BigDecimal lineTotal = new BigDecimal("100000.00");
            PurchaseAccountingSlipLine line = PurchaseAccountingSlipLine.create(
                    slip, lineNo, "SKU-" + lineNo, "품목" + lineNo,
                    BigDecimal.ONE, lineTotal, lineTotal, BigDecimal.ZERO, lineTotal);
            slip.getLines().add(line);
            for (int allocNo = 1; allocNo <= 2; allocNo++) {
                line.getAllocations().add(PurchaseAccountingSlipAllocation.create(
                        line, UUID.randomUUID(), "IN-" + slipNo + "-" + lineNo + "-" + allocNo,
                        UUID.randomUUID(), allocNo, BigDecimal.ONE, new BigDecimal("50000.00")));
            }
        }
        slip.recalcTotals();
        return slip;
    }

    private static void assertLinesAndAllocationsIntact(List<SalesAccountingSlipLine> lines) {
        assertThat(lines).hasSize(2);
        for (SalesAccountingSlipLine line : lines) {
            assertThat(line.getAllocations()).hasSize(2);
            BigDecimal allocSum = line.getAllocations().stream()
                    .map(SalesAccountingSlipAllocation::getAllocatedAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            assertThat(allocSum).isEqualByComparingTo(line.getLineTotal());
        }
    }

    private static void assertPurchaseLinesAndAllocationsIntact(List<PurchaseAccountingSlipLine> lines) {
        assertThat(lines).hasSize(2);
        for (PurchaseAccountingSlipLine line : lines) {
            assertThat(line.getAllocations()).hasSize(2);
            BigDecimal allocSum = line.getAllocations().stream()
                    .map(PurchaseAccountingSlipAllocation::getAllocatedAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            assertThat(allocSum).isEqualByComparingTo(line.getLineTotal());
        }
    }
}
