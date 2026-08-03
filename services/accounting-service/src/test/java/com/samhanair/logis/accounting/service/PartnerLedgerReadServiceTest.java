package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.PartnerLedgerSalesClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.jpa.domain.Specification;

/** R13 code-only 거래처 원장 상세 회귀 테스트. */
@ExtendWith(MockitoExtension.class)
class PartnerLedgerReadServiceTest {

    private static final LocalDate FROM = LocalDate.of(2026, 6, 1);
    private static final LocalDate TO = LocalDate.of(2026, 6, 30);

    @Mock private PartnerLedgerSalesClient salesClient;
    @Mock private CashReceiptRepository cashReceiptRepository;
    @Mock private PartnerLookupClient partnerLookupClient;

    @InjectMocks private PartnerLedgerReadService service;

    @Test
    @DisplayName("code-only 기존 판매전표도 거래처 원장 상세를 422 없이 연다")
    void codeOnlyExistingSaleIsReadableWithoutPartnerMaster() {
        when(partnerLookupClient.findByPartnerCodeResult("QA-GATE-A"))
                .thenReturn(PartnerLookupClient.LookupResult.notFound());
        lenient().when(salesClient.find(FROM, TO, "QA-GATE-A", null))
                .thenReturn(List.of(new PartnerLedgerSalesClient.Sale(
                        "2026/06/24-901", LocalDate.of(2026, 6, 24), "COMPLETED",
                        "QA-GATE-A", "대구공조(검수완료)", null,
                        List.of(new PartnerLedgerSalesClient.Line(
                                "원장 품목", null, 2, new BigDecimal("1200000"),
                                new BigDecimal("2400000"))))));
        lenient().when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());

        var response = service.read("QA-GATE-A", FROM, TO);

        assertThat(response.partnerCode()).isEqualTo("QA-GATE-A");
        assertThat(response.partnerName()).isEqualTo("대구공조(검수완료)");
        assertThat(response.documents()).hasSize(1);
        assertThat(response.documents().get(0).lines()).hasSize(1);
        assertThat(response.documents().get(0).amount()).isEqualByComparingTo("2400000");
    }

    @Test
    @DisplayName("정상 거래처 상세는 기존 partnerId 조회 계약을 유지한다")
    void masterBackedPartnerStillReadsByPartnerId() {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerCodeResult("P-2026-0001"))
                .thenReturn(PartnerLookupClient.LookupResult.found(
                        new com.samhanair.logis.accounting.client.PartnerSummary(
                                partnerId, "P-2026-0001", "정상 거래처", "1234567890", "")));
        when(salesClient.find(FROM, TO, null, partnerId))
                .thenReturn(List.of(new PartnerLedgerSalesClient.Sale(
                        "2026/06/24-903", LocalDate.of(2026, 6, 24), "COMPLETED",
                        "P-2026-0001", "정상 거래처", null,
                        List.of(new PartnerLedgerSalesClient.Line(
                                "정상 품목", null, 1, new BigDecimal("100"), new BigDecimal("100"))))));
        lenient().when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());

        var response = service.read("P-2026-0001", FROM, TO);

        assertThat(response.partnerCode()).isEqualTo("P-2026-0001");
        assertThat(response.partnerName()).isEqualTo("정상 거래처");
        assertThat(response.documents()).hasSize(1);
    }
}
