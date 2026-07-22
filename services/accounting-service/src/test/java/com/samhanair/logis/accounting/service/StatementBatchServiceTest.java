package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceLine;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.StatementBatchRow;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * StatementBatchService 단위 테스트 — BE-A10.
 *
 * <p>커버 시나리오 3건:
 * <ul>
 *   <li>slip line snapshot — 라인 데이터 정확 매핑</li>
 *   <li>거래처 그룹핑 — 같은 partnerId 내 여러 세금계산서 묶음</li>
 *   <li>빈 결과 — 0건 입력</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class StatementBatchServiceTest {

    @Mock private TaxInvoiceRepository taxInvoiceRepository;
    @Mock private PartnerLookupClient partnerLookupClient;
    @Mock private ChatRoomMappingClient chatRoomMappingClient;

    @InjectMocks private StatementBatchService service;

    private static final LocalDate FROM = LocalDate.of(2026, 5, 1);
    private static final LocalDate TO = LocalDate.of(2026, 5, 31);

    @Test
    @DisplayName("slip line snapshot — 라인 데이터 정확 매핑")
    void slipLineSnapshot() {
        UUID partnerId = UUID.randomUUID();
        TaxInvoice ti = newIssued(partnerId, "샘플상사", "20260510-0001",
                LocalDate.of(2026, 5, 10));
        addLine(ti, 1, "에어컨 R32", "20평형",
                new BigDecimal("2"), new BigDecimal("500000"));

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of(ti));
        lenient().when(partnerLookupClient.findByPartnerId(partnerId))
                .thenReturn(Optional.of(new PartnerSummary(partnerId, "P-001", "샘플상사", "111", "")));
        lenient().when(chatRoomMappingClient.findChatRoomNamesByPartnerCode(any()))
                .thenReturn(List.of("샘플단톡"));

        List<StatementBatchRow> rows = service.batch(FROM, TO);

        assertThat(rows).hasSize(1);
        StatementBatchRow row = rows.get(0);
        assertThat(row.partnerCode()).isEqualTo("P-001");
        assertThat(row.slips()).hasSize(1);
        StatementBatchRow.StatementSlip slip = row.slips().get(0);
        assertThat(slip.slipNo()).isEqualTo("20260510-0001");
        assertThat(slip.lines()).hasSize(1);
        assertThat(slip.lines().get(0).productName()).isEqualTo("에어컨 R32");
        assertThat(slip.lines().get(0).supplyAmount()).isEqualByComparingTo("1000000");
        assertThat(slip.lines().get(0).vatAmount()).isEqualByComparingTo("100000");
    }

    @Test
    @DisplayName("거래처 그룹핑 — 같은 partnerId 의 여러 세금계산서 1 group")
    void partnerGrouping() {
        UUID partnerA = UUID.randomUUID();
        UUID partnerB = UUID.randomUUID();
        TaxInvoice tiA1 = newIssued(partnerA, "거래처A", "TI-A1", LocalDate.of(2026, 5, 1));
        addLine(tiA1, 1, "품목1", null, BigDecimal.ONE, new BigDecimal("100"));
        TaxInvoice tiA2 = newIssued(partnerA, "거래처A", "TI-A2", LocalDate.of(2026, 5, 5));
        addLine(tiA2, 1, "품목2", null, BigDecimal.ONE, new BigDecimal("200"));
        TaxInvoice tiB = newIssued(partnerB, "거래처B", "TI-B1", LocalDate.of(2026, 5, 3));
        addLine(tiB, 1, "품목3", null, BigDecimal.ONE, new BigDecimal("300"));

        when(taxInvoiceRepository.findIssuedInRange(eq(TaxInvoiceStatus.ISSUED), eq(FROM), eq(TO)))
                .thenReturn(List.of(tiA1, tiA2, tiB));
        lenient().when(partnerLookupClient.findByPartnerId(any()))
                .thenReturn(Optional.empty());
        lenient().when(chatRoomMappingClient.findChatRoomNamesByPartnerCode(any()))
                .thenReturn(List.of());

        List<StatementBatchRow> rows = service.batch(FROM, TO);

        assertThat(rows).hasSize(2); // partnerA + partnerB 두 그룹
        StatementBatchRow groupA = rows.stream()
                .filter(r -> "거래처A".equals(r.partnerName())).findFirst().orElseThrow();
        assertThat(groupA.slips()).hasSize(2);
    }

    @Test
    @DisplayName("partner lookup 실패 시 세금계산서 snapshot partnerCode 를 선택 key 로 보존")
    void snapshotPartnerCodeFallback() {
        UUID partnerId = UUID.randomUUID();
        TaxInvoice ti = newIssued(partnerId, "SNAP-001", "샘플상사", "20260510-0001",
                LocalDate.of(2026, 5, 10));
        addLine(ti, 1, "에어컨 R32", "20평형", BigDecimal.ONE, new BigDecimal("500000"));

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of(ti));
        when(partnerLookupClient.findByPartnerId(partnerId)).thenReturn(Optional.empty());
        when(chatRoomMappingClient.findChatRoomNamesByPartnerCode(any()))
                .thenReturn(List.of());

        List<StatementBatchRow> rows = service.batch(FROM, TO);

        assertThat(rows).singleElement().extracting(StatementBatchRow::partnerCode)
                .isEqualTo("SNAP-001");
    }

    @Test
    @DisplayName("partnerCode 없는 legacy snapshot 은 사업자번호를 선택 key 로 사용")
    void snapshotBusinessNumberFallback() {
        UUID partnerId = UUID.randomUUID();
        TaxInvoice ti = newIssued(partnerId, "거래처 legacy", "20260510-0002",
                LocalDate.of(2026, 5, 10));
        addLine(ti, 1, "에어컨 R32", "20평형", BigDecimal.ONE, new BigDecimal("500000"));

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of(ti));
        when(partnerLookupClient.findByPartnerId(partnerId)).thenReturn(Optional.empty());
        when(chatRoomMappingClient.findChatRoomNamesByPartnerCode(any()))
                .thenReturn(List.of());

        List<StatementBatchRow> rows = service.batch(FROM, TO);

        assertThat(rows).singleElement().extracting(StatementBatchRow::partnerCode)
                .isEqualTo("111-22-33333");
    }

    @Test
    @DisplayName("빈 결과 — ISSUED 0건")
    void emptyResult() {
        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of());

        List<StatementBatchRow> rows = service.batch(FROM, TO);

        assertThat(rows).isEmpty();
    }

    private static TaxInvoice newIssued(UUID partnerId, String partnerName, String taxInvoiceNo,
                                         LocalDate supplyDate) {
        return newIssued(partnerId, null, partnerName, taxInvoiceNo, supplyDate);
    }

    private static TaxInvoice newIssued(UUID partnerId, String partnerCode, String partnerName,
                                         String taxInvoiceNo, LocalDate supplyDate) {
        TaxInvoice ti = TaxInvoice.create(partnerId, partnerCode, "111-22-33333", partnerName,
                "주소", supplyDate, "비고", TaxInvoiceType.SALES);
        // 본 단계는 라인 추가 후 issue 호출로 ISSUED 전이 모사
        try {
            Field idField = TaxInvoice.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(ti, UUID.randomUUID());
            Field noField = TaxInvoice.class.getDeclaredField("taxInvoiceNo");
            noField.setAccessible(true);
            noField.set(ti, taxInvoiceNo);
            Field statusField = TaxInvoice.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(ti, TaxInvoiceStatus.ISSUED);
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
        return ti;
    }

    private static void addLine(TaxInvoice ti, int lineNo, String itemName, String spec,
                                 BigDecimal qty, BigDecimal unitPrice) {
        TaxInvoiceLine line = TaxInvoiceLine.create(ti, lineNo, itemName, spec, qty, unitPrice, null);
        // ti.addLine 은 DRAFT only — 직접 lines 컬렉션 reflective 추가
        try {
            Field linesField = TaxInvoice.class.getDeclaredField("lines");
            linesField.setAccessible(true);
            @SuppressWarnings("unchecked")
            List<TaxInvoiceLine> lines = (List<TaxInvoiceLine>) linesField.get(ti);
            lines.add(line);
            // recalc — supply/vat/total 갱신
            Field supplyField = TaxInvoice.class.getDeclaredField("supplyAmount");
            supplyField.setAccessible(true);
            Field vatField = TaxInvoice.class.getDeclaredField("vatAmount");
            vatField.setAccessible(true);
            Field totalField = TaxInvoice.class.getDeclaredField("totalAmount");
            totalField.setAccessible(true);
            BigDecimal supplySum = lines.stream()
                    .map(TaxInvoiceLine::getSupplyAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal vatSum = lines.stream()
                    .map(TaxInvoiceLine::getVatAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            supplyField.set(ti, supplySum);
            vatField.set(ti, vatSum);
            totalField.set(ti, supplySum.add(vatSum));
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }
}
