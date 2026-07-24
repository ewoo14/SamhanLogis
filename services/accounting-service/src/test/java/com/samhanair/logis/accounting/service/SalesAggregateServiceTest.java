package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
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
    @Mock private PartnerLookupClient partnerLookupClient;

    @InjectMocks private SalesAggregateService service;

    private static final LocalDate FROM = LocalDate.of(2026, 5, 1);
    private static final LocalDate TO = LocalDate.of(2026, 5, 31);

    @Test
    @DisplayName("정상 — 매출/수금/채권 집계 (단일 거래처)")
    void aggregateSinglePartner() {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerCode("P-001"))
                .thenReturn(Optional.of(new PartnerSummary(partnerId, "P-001",
                        "샘플상사", "123-45-67890", "서울시")));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of(
                        new TestPartnerAccountTotal(partnerId, "401",
                                BigDecimal.ZERO, new BigDecimal("1000000")),
                        new TestPartnerAccountTotal(partnerId, "110",
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
    @DisplayName("DcConfig 적용 — 매출 차변(할인) 반영 — 매출 = 대변 - 차변")
    void aggregateWithDiscount() {
        UUID pid = UUID.randomUUID();
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(any()))
                .thenReturn(Map.of(pid, new PartnerSummary(pid, "P-DC", "할인상사", "111", "")));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO))
                .thenReturn(List.of(
                        // 매출 1,000,000 + 할인(차변) 50,000 → 순매출 950,000
                        new TestPartnerAccountTotal(pid, "401",
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
                        new TestPartnerAccountTotal(p1, "401", BigDecimal.ZERO, new BigDecimal("100")),
                        new TestPartnerAccountTotal(p1, "110", new BigDecimal("110"), BigDecimal.ZERO),
                        new TestPartnerAccountTotal(p2, "401", BigDecimal.ZERO, new BigDecimal("200")),
                        new TestPartnerAccountTotal(p2, "110", new BigDecimal("220"), new BigDecimal("100"))
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

    /** Test stub for PartnerAccountTotal projection. */
    record TestPartnerAccountTotal(UUID partnerId, String accountCode,
                                   BigDecimal debitTotal, BigDecimal creditTotal)
            implements PartnerAccountTotal {
        @Override public UUID getPartnerId() { return partnerId; }
        @Override public String getAccountCode() { return accountCode; }
        @Override public BigDecimal getDebitTotal() { return debitTotal; }
        @Override public BigDecimal getCreditTotal() { return creditTotal; }
    }

    @SuppressWarnings("unused")
    private void anyStringUnused() { anyString(); }
}
