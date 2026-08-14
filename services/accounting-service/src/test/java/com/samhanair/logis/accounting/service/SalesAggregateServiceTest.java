package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerLedgerSalesClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptKind;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.PartnerAccountTotal;
import com.samhanair.logis.accounting.web.dto.SalesAggregateRow;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.jpa.domain.Specification;

/**
 * SalesAggregateService 단위 테스트 — BE-A8.
 *
 * <p>커버 시나리오 4건:
 * <ul>
 *   <li>정상 — 다중 거래처 매출/수금/채권 집계</li>
 *   <li>빈 결과 — 0건 입력</li>
 *   <li>DcConfig 적용 — 매출 차변 (할인) 반영 (401 차변 = 매출 차감)</li>
 *   <li>다중 거래처 — partnerId 별 그룹핑 정확성</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class SalesAggregateServiceTest {

    @Mock private JournalLineRepository journalLineRepository;
    @Mock private CashReceiptRepository cashReceiptRepository;
    @Mock private PartnerLookupClient partnerLookupClient;
    @Mock private PartnerLedgerSalesClient partnerLedgerSalesClient;

    @InjectMocks private SalesAggregateService service;

    private static final LocalDate FROM = LocalDate.of(2026, 5, 1);
    private static final LocalDate TO = LocalDate.of(2026, 5, 31);
    private static final LocalDate LEGACY_SLIP_DATE = LocalDate.of(2026, 6, 24);

    @Test
    @DisplayName("정상 — 매출/수금/채권 집계 (단일 거래처)")
    void aggregateSinglePartner() {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerCode("P-001"))
                .thenReturn(Optional.of(new PartnerSummary(partnerId, "P-001",
                        "샘플상사", "123-45-67890", "서울시")));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of(
                        new TestPartnerAccountTotal(partnerId, "4019",
                                BigDecimal.ZERO, new BigDecimal("1000000")),
                        new TestPartnerAccountTotal(partnerId, "1089",
                                new BigDecimal("1100000"), new BigDecimal("500000"))
                ));

        List<SalesAggregateRow> rows = service.aggregate(FROM, TO, "P-001");

        assertThat(rows).hasSize(1);
        SalesAggregateRow r = rows.get(0);
        assertThat(r.partnerCode()).isEqualTo("P-001");
        assertThat(r.partnerName()).isEqualTo("샘플상사");
        assertThat(r.salesTotal()).isEqualByComparingTo("1000000");
        assertThat(r.paymentTotal()).isEqualByComparingTo("500000");
        assertThat(r.receivableBalance()).isEqualByComparingTo("600000"); // 1100000 - 500000
    }

    @Test
    @DisplayName("목록 수금 합계는 상세의 확정 입금보고서 합계를 포함한다")
    void aggregatePaymentMatchesConfirmedCashReceiptDetails() {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerCode("8428102605"))
                .thenReturn(Optional.of(new PartnerSummary(
                        partnerId, "8428102605", "주식회사 제이시스템", "8428102605", "")));
        // 5월 실 DB와 같이 401/110이 아닌 계정만 남은 journal projection이어도
        // 상세의 CASH_RECEIPT 원천은 집계되어야 한다.
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of(new TestPartnerAccountTotal(partnerId, "2559",
                        new BigDecimal("100"), new BigDecimal("100"))));
        List<CashReceipt> receipts = List.of(
                confirmedReceipt("2026-05-06-003", partnerId, "90402200", LocalDate.of(2026, 5, 6), "r1"),
                confirmedReceipt("2026-05-07-009", partnerId, "33433000", LocalDate.of(2026, 5, 7), "r2"),
                confirmedReceipt("2026-05-12-006", partnerId, "38657600", LocalDate.of(2026, 5, 12), "r3"),
                confirmedReceipt("2026-05-12-018", partnerId, "11364485", LocalDate.of(2026, 5, 12), "r4"),
                confirmedReceipt("2026-05-13-045", partnerId, "45171730", LocalDate.of(2026, 5, 13), "r5"),
                confirmedReceipt("2026-05-14-045", partnerId, "26583200", LocalDate.of(2026, 5, 14), "r6"));
        lenient().when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(receipts);

        List<SalesAggregateRow> rows = service.aggregate(FROM, TO, "8428102605");

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).salesTotal()).isEqualByComparingTo("0");
        assertThat(rows.get(0).paymentTotal()).isEqualByComparingTo("245612215");
        assertThat(rows.get(0).receivableBalance()).isEqualByComparingTo("-245612215");
    }

    @Test
    @DisplayName("CASH_RECEIPT 자동분개는 상세 입금보고서와 중복 집계하지 않는다")
    void aggregateDoesNotDoubleCountCashReceiptJournal() {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerCode("8428102605"))
                .thenReturn(Optional.of(new PartnerSummary(
                        partnerId, "8428102605", "주식회사 제이시스템", "8428102605", "")));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of(new TestPartnerAccountTotal(partnerId, "1089",
                        BigDecimal.ZERO, new BigDecimal("100"), JournalSourceType.CASH_RECEIPT)));
        lenient().when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of(
                confirmedReceipt("2026-05-06-003", partnerId, "245612215",
                        LocalDate.of(2026, 5, 6), "double-count-guard")));

        List<SalesAggregateRow> rows = service.aggregate(FROM, TO, "8428102605");

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).paymentTotal()).isEqualByComparingTo("245612215");
    }

    @Test
    @DisplayName("빈 결과 — 분개 없음")
    void aggregateEmpty() {
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of());

        List<SalesAggregateRow> rows = service.aggregate(FROM, TO, null);

        assertThat(rows).isEmpty();
    }

    @Test
    @DisplayName("partner-service UNAVAILABLE은 매출집계를 0건으로 위장하지 않는다")
    void aggregatePartnerUnavailableFailsClosed() {
        when(partnerLookupClient.findByPartnerCodeResult("P-DOWN"))
                .thenReturn(PartnerLookupClient.LookupResult.unavailable());

        assertThatThrownBy(() -> service.aggregate(FROM, TO, "P-DOWN"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException failure = (BusinessException) ex;
                    assertThat(failure.getErrorCode())
                            .isEqualTo(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE);
                    assertThat(failure.getMessage())
                            .contains("거래처 조회를 일시적으로")
                            .doesNotContain("존재하지 않는 거래처");
                });
    }

    @Test
    @DisplayName("무필터(전체) 집계 — partner-service UNAVAILABLE은 0건 성공으로 위장하지 않는다 (#831 B-1)")
    void aggregateUnfilteredPartnerUnavailableFailsClosed() {
        UUID pid = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerIdsBatchResult(any()))
                .thenReturn(PartnerLookupClient.BatchLookupResult.unavailable());
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of(
                        new TestPartnerAccountTotal(pid, "4019",
                                BigDecimal.ZERO, new BigDecimal("1000000"))
                ));

        assertThatThrownBy(() -> service.aggregate(FROM, TO, null))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException failure = (BusinessException) ex;
                    assertThat(failure.getErrorCode())
                            .isEqualTo(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE);
                    assertThat(failure.getMessage())
                            .contains("거래처 조회를 일시적으로")
                            .doesNotContain("존재하지 않는 거래처");
                });
    }

    @Test
    @DisplayName("무필터 집계 — 일부 거래처 미매칭(삭제/미존재 혼재)은 장애가 아니라 \"-\" 표시로 무회귀한다")
    void aggregateUnfilteredPartialMissIsNotTreatedAsUnavailable() {
        UUID resolved = UUID.randomUUID();
        UUID deleted = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerIdsBatchResult(any()))
                .thenReturn(PartnerLookupClient.BatchLookupResult.found(
                        Map.of(resolved, new PartnerSummary(resolved, "P-001", "정상거래처", "111", ""))));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of(
                        new TestPartnerAccountTotal(resolved, "4019", BigDecimal.ZERO, new BigDecimal("100")),
                        new TestPartnerAccountTotal(deleted, "4019", BigDecimal.ZERO, new BigDecimal("200"))
                ));

        List<SalesAggregateRow> rows = service.aggregate(FROM, TO, null);

        assertThat(rows).hasSize(2);
        SalesAggregateRow resolvedRow = rows.stream()
                .filter(r -> r.salesTotal().compareTo(new BigDecimal("100")) == 0)
                .findFirst().orElseThrow();
        assertThat(resolvedRow.partnerCode()).isEqualTo("P-001");
        SalesAggregateRow deletedRow = rows.stream()
                .filter(r -> r.salesTotal().compareTo(new BigDecimal("200")) == 0)
                .findFirst().orElseThrow();
        assertThat(deletedRow.partnerCode()).isEqualTo("-");
        assertThat(deletedRow.partnerName()).isEqualTo("-");
    }

    @Test
    @DisplayName("DcConfig 적용 — 매출 차변(할인) 반영 — 매출 = 대변 - 차변")
    void aggregateWithDiscount() {
        UUID pid = UUID.randomUUID();
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(any()))
                .thenReturn(Map.of(pid, new PartnerSummary(pid, "P-DC", "할인상사", "111", "")));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of(
                        // 매출 1,000,000 + 할인(차변) 50,000 → 순매출 950,000
                        new TestPartnerAccountTotal(pid, "4019",
                                new BigDecimal("50000"), new BigDecimal("1000000"))
                ));

        List<SalesAggregateRow> rows = service.aggregate(FROM, TO, null);

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).salesTotal()).isEqualByComparingTo("950000");
    }

    @Test
    @DisplayName("다중 거래처 — partnerId 별 그룹핑 정확성")
    void aggregateMultiPartner() {
        UUID p1 = UUID.randomUUID();
        UUID p2 = UUID.randomUUID();
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(any()))
                .thenReturn(Map.of(
                        p1, new PartnerSummary(p1, "P-001", "거래처1", "1", ""),
                        p2, new PartnerSummary(p2, "P-002", "거래처2", "2", "")));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of(
                        new TestPartnerAccountTotal(p1, "4019", BigDecimal.ZERO, new BigDecimal("100")),
                        new TestPartnerAccountTotal(p1, "1089", new BigDecimal("1089"), BigDecimal.ZERO),
                        new TestPartnerAccountTotal(p2, "4019", BigDecimal.ZERO, new BigDecimal("200")),
                        new TestPartnerAccountTotal(p2, "1089", new BigDecimal("220"), new BigDecimal("100"))
                ));

        List<SalesAggregateRow> rows = service.aggregate(FROM, TO, null);

        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(SalesAggregateRow::partnerCode)
                .containsExactlyInAnyOrder("P-001", "P-002");
        SalesAggregateRow row2 = rows.stream()
                .filter(r -> r.partnerCode().equals("P-002")).findFirst().orElseThrow();
        assertThat(row2.salesTotal()).isEqualByComparingTo("200");
        assertThat(row2.paymentTotal()).isEqualByComparingTo("100");
        assertThat(row2.receivableBalance()).isEqualByComparingTo("120"); // 220 - 100
    }

    @Test
    void selectedPartnerSalesTotalUsesOutboundLedgerSales() {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerCode("P-001"))
                .thenReturn(Optional.of(new PartnerSummary(partnerId, "P-001", "거래처", "", "")));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of(new TestPartnerAccountTotal(partnerId, "4019",
                        BigDecimal.ZERO, new BigDecimal("20000000"))));
        when(partnerLedgerSalesClient.find(FROM, TO, "P-001", partnerId))
                .thenReturn(List.of(new PartnerLedgerSalesClient.Sale(
                        "2026/03/08-1", LocalDate.of(2026, 3, 8), "INSPECTING",
                        "P-001", "거래처", null,
                        List.of(new PartnerLedgerSalesClient.Line("A", null, 1,
                                new BigDecimal("12276000"), new BigDecimal("12276000"))))));

        List<SalesAggregateRow> rows = service.aggregate(FROM, TO, "P-001");

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).salesTotal()).isEqualByComparingTo("12276000");
    }

    @Test
    @DisplayName("RED-A: 선택 거래처의 partnerCode 보존 전표 금액을 집계한다")
    void filteredAggregateReadsLegacySalesByResolvedPartnerCode() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary target = new PartnerSummary(
                partnerId, "P-0005", "대상 거래처", "165-35-10155", "");
        when(partnerLookupClient.findByPartnerCodeResult("P-0005"))
                .thenReturn(PartnerLookupClient.LookupResult.found(target));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of());
        when(partnerLedgerSalesClient.find(FROM, TO, "P-0005", partnerId))
                .thenReturn(List.of(new PartnerLedgerSalesClient.Sale(
                        "2026/05/08-target", FROM, "COMPLETED", "P-0005",
                        "대상 거래처", "165-35-10155", null,
                        List.of(new PartnerLedgerSalesClient.Line(
                                "대상", null, 1, new BigDecimal("26000000"), new BigDecimal("26000000"))))));

        List<SalesAggregateRow> rows = service.aggregate(FROM, TO, "P-0005");

        assertThat(rows).singleElement().extracting(SalesAggregateRow::salesTotal)
                .isEqualTo(new BigDecimal("26000000"));
    }

    @Test
    void unfilteredAggregateUsesOutboundLedgerSalesForEachPartner() {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerIdsBatch(any()))
                .thenReturn(Map.of(partnerId, new PartnerSummary(partnerId, "P-001", "거래처", "321", "")));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of(new TestPartnerAccountTotal(partnerId, "4019",
                        BigDecimal.ZERO, new BigDecimal("20000000"))));
        when(partnerLedgerSalesClient.find(FROM, TO, null, null))
                .thenReturn(List.of(new PartnerLedgerSalesClient.Sale(
                        "2026/03/08-1", LocalDate.of(2026, 3, 8), "INSPECTING",
                        "P-001", "거래처", null,
                        List.of(new PartnerLedgerSalesClient.Line("A", null, 1,
                                new BigDecimal("12276000"), new BigDecimal("12276000"))))));

        List<SalesAggregateRow> rows = service.aggregate(FROM, TO, null);

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).salesTotal()).isEqualByComparingTo("12276000");
    }

    @Test
    @DisplayName("무필터 집계 — 공란 partnerCode도 출고전표 사업자번호로 journal 거래처에 연결한다")
    void unfilteredAggregateMatchesBlankCodeSaleByBusinessNumber() {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerIdsBatch(any()))
                .thenReturn(Map.of(partnerId, new PartnerSummary(
                        partnerId, "P-0018", "강릉HVAC솔루션", "334-26-10558", "")));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of(new TestPartnerAccountTotal(partnerId, "4019",
                        BigDecimal.ZERO, new BigDecimal("7000000"))));
        when(partnerLedgerSalesClient.find(FROM, TO, null, null))
                .thenReturn(List.of(new PartnerLedgerSalesClient.Sale(
                        "2026/05/08-18", LocalDate.of(2026, 5, 8), "COMPLETED",
                        null, "강릉HVAC솔루션", "334-26-10558", null,
                        List.of(new PartnerLedgerSalesClient.Line("A", null, 1,
                                new BigDecimal("24646600"), new BigDecimal("24646600"))))));

        List<SalesAggregateRow> rows = service.aggregate(FROM, TO, null);

        assertThat(rows).singleElement().satisfies(row -> {
            assertThat(row.partnerCode()).isEqualTo("P-0018");
            assertThat(row.salesTotal()).isEqualByComparingTo("24646600");
        });
    }

    @Test
    @DisplayName("거래처 필터 — 화면에 보이는 사업자번호를 partnerCode로 해석한다")
    void aggregateResolvesBusinessNumberFilterToPartnerCode() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary summary = new PartnerSummary(
                partnerId, "P-0005", "대구HVAC솔루션", "165-35-10155", "");
        when(partnerLookupClient.findByPartnerCodeResult("1653510155"))
                .thenReturn(PartnerLookupClient.LookupResult.notFound());
        when(partnerLookupClient.searchDirectoryResult("1653510155", 10))
                .thenReturn(PartnerLookupClient.DirectoryLookupResult.found(List.of(summary)));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of(new TestPartnerAccountTotal(partnerId, "4019",
                        BigDecimal.ZERO, new BigDecimal("100"))));

        List<SalesAggregateRow> rows = service.aggregate(FROM, TO, "1653510155");

        assertThat(rows).singleElement().extracting(SalesAggregateRow::partnerCode)
                .isEqualTo("1653510155");
        verify(partnerLookupClient).searchDirectoryResult("1653510155", 10);
    }

    @Test
    @DisplayName("거래처 필터 집계는 원장 응답에 섞인 다른 거래처 전표를 합산하지 않는다")
    void filteredAggregateDoesNotImportSalesBelongingToAnotherPartner() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary target = new PartnerSummary(
                partnerId, "P-0005", "대상 거래처", "165-35-10155", "");
        when(partnerLookupClient.findByPartnerCodeResult("P-0005"))
                .thenReturn(PartnerLookupClient.LookupResult.found(target));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of());
        when(partnerLedgerSalesClient.find(FROM, TO, "P-0005", partnerId))
                .thenReturn(List.of(
                        new PartnerLedgerSalesClient.Sale(
                                "2026/05/08-target", FROM, "COMPLETED", null,
                                "대상 거래처", "165-35-10155", null,
                                List.of(new PartnerLedgerSalesClient.Line(
                                        "대상", null, 1, new BigDecimal("100"), new BigDecimal("100")))),
                        new PartnerLedgerSalesClient.Sale(
                                "2026/05/08-other", FROM, "COMPLETED", null,
                                "다른 거래처", "321-19-10527", null,
                                List.of(new PartnerLedgerSalesClient.Line(
                                        "오염", null, 1, new BigDecimal("900"), new BigDecimal("900"))))));

        List<SalesAggregateRow> rows = service.aggregate(FROM, TO, "P-0005");

        assertThat(rows).singleElement()
                .extracting(SalesAggregateRow::salesTotal)
                .isEqualTo(new BigDecimal("100"));
    }

    @Test
    @DisplayName("무필터 집계 — journal 후보가 없어도 legacy partner_code 출고전표를 표시한다")
    void unfilteredAggregateIncludesLegacySalesWithoutJournalCandidate() {
        when(journalLineRepository.aggregatePostedByPartnerAccount(LEGACY_SLIP_DATE, LEGACY_SLIP_DATE))
                .thenReturn(List.of());
        when(partnerLedgerSalesClient.find(LEGACY_SLIP_DATE, LEGACY_SLIP_DATE, null, null))
                .thenReturn(List.of(
                        new PartnerLedgerSalesClient.Sale(
                                "2026/06/24-901", LEGACY_SLIP_DATE, "COMPLETED",
                                "QA-GATE-A", "대구공조(검수완료)", null,
                                List.of(new PartnerLedgerSalesClient.Line(
                                        "원장 품목", null, 2, new BigDecimal("1200000"),
                                        new BigDecimal("2400000")))),
                        new PartnerLedgerSalesClient.Sale(
                                "2026/06/24-902", LEGACY_SLIP_DATE, "COMPLETED",
                                "QA-GATE-B", "부산냉동(미검수)", null, List.of())));

        List<SalesAggregateRow> rows = service.aggregate(LEGACY_SLIP_DATE, LEGACY_SLIP_DATE, null);

        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(SalesAggregateRow::partnerCode)
                .containsExactlyInAnyOrder("QA-GATE-A", "QA-GATE-B");
        SalesAggregateRow gateA = rows.stream()
                .filter(row -> row.partnerCode().equals("QA-GATE-A"))
                .findFirst().orElseThrow();
        assertThat(gateA.partnerName()).isEqualTo("대구공조(검수완료)");
        assertThat(gateA.salesTotal()).isEqualByComparingTo("2400000");
        SalesAggregateRow gateB = rows.stream()
                .filter(row -> row.partnerCode().equals("QA-GATE-B"))
                .findFirst().orElseThrow();
        assertThat(gateB.salesTotal()).isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("무필터 집계 — partnerCode가 비어도 출고전표 금액을 버리지 않는다")
    void unfilteredAggregateKeepsSalesWithBlankPartnerCode() {
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of());
        when(partnerLedgerSalesClient.find(FROM, TO, null, null))
                .thenReturn(List.of(new PartnerLedgerSalesClient.Sale(
                        "2026/05/08-903", LocalDate.of(2026, 5, 8), "COMPLETED",
                        null, "코드없는 legacy 거래처", null,
                        List.of(new PartnerLedgerSalesClient.Line(
                                "원장 품목", null, 1, new BigDecimal("500"),
                                new BigDecimal("500")
                        )))));

        List<SalesAggregateRow> rows = service.aggregate(FROM, TO, null);

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).partnerCode()).isEqualTo("-");
        assertThat(rows.get(0).partnerName()).isEqualTo("식별 불가 출고전표");
        assertThat(rows.get(0).salesTotal()).isEqualByComparingTo("500");
    }

    /** Test stub for PartnerAccountTotal projection. */
    record TestPartnerAccountTotal(UUID partnerId, String accountCode,
                                   BigDecimal debitTotal, BigDecimal creditTotal,
                                   JournalSourceType sourceType)
            implements PartnerAccountTotal {
        TestPartnerAccountTotal(UUID partnerId, String accountCode,
                                BigDecimal debitTotal, BigDecimal creditTotal) {
            this(partnerId, accountCode, debitTotal, creditTotal, null);
        }

        @Override public UUID getPartnerId() { return partnerId; }
        @Override public String getAccountCode() { return accountCode; }
        @Override public JournalSourceType getSourceType() { return sourceType; }
        @Override public BigDecimal getDebitTotal() { return debitTotal; }
        @Override public BigDecimal getCreditTotal() { return creditTotal; }
    }

    @SuppressWarnings("unused")
    private void anyStringUnused() { anyString(); }

    private static CashReceipt confirmedReceipt(String slipNo, UUID partnerId, String amount,
                                                LocalDate date, String externalRef) {
        return CashReceipt.fromMig7Staging(
                slipNo, partnerId, new BigDecimal(amount), date,
                CashReceiptKind.DEPOSIT_REPORT, "입금보고서", externalRef);
    }
}
