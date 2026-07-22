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
    @DisplayName("partnerCode 없는 legacy snapshot 은 사업자번호를 표시 데이터로만 보존")
    void snapshotBusinessNumberFallback() {
        UUID partnerId = UUID.randomUUID();
        TaxInvoice ti = newIssued(partnerId, "거래처 legacy", "20260510-0002",
                LocalDate.of(2026, 5, 10));
        addLine(ti, 1, "에어컨 R32", "20평형", BigDecimal.ONE, new BigDecimal("500000"));

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of(ti));
        when(partnerLookupClient.findByPartnerId(partnerId)).thenReturn(Optional.empty());

        List<StatementBatchRow> rows = service.batch(FROM, TO);

        assertThat(rows).singleElement().satisfies(row -> {
            assertThat(row.partnerCode()).isNull();
            assertThat(row.bizNo()).isEqualTo("111-22-33333");
        });
    }

    @Test
    @DisplayName("선택 key — 사업자번호가 다른 거래처 partnerCode 와 같아도 rows 전체가 고유")
    void selectionKeyDoesNotReuseBusinessNumberNamespace() {
        UUID legacyPartner = UUID.randomUUID();
        UUID activePartner = UUID.randomUUID();
        TaxInvoice legacy = newIssued(legacyPartner, null, "legacy-A", "ACTIVE-B",
                "TI-A", LocalDate.of(2026, 5, 1));
        TaxInvoice active = newIssued(activePartner, "ACTIVE-B", "active-B", "222-33-44444",
                "TI-B", LocalDate.of(2026, 5, 2));
        addLine(legacy, 1, "품목A", null, BigDecimal.ONE, new BigDecimal("100"));
        addLine(active, 1, "품목B", null, BigDecimal.ONE, new BigDecimal("200"));

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of(legacy, active));
        when(partnerLookupClient.findByPartnerId(any())).thenReturn(Optional.empty());
        when(chatRoomMappingClient.findChatRoomNamesByPartnerCode(eq("ACTIVE-B")))
                .thenReturn(List.of("active B 단톡방"));

        List<StatementBatchRow> rows = service.batch(FROM, TO);

        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(StatementBatchServiceTest::selectionKey)
                .doesNotHaveDuplicates();
        assertThat(rows.get(0).partnerCode()).isNotEqualTo("ACTIVE-B");
        assertThat(rows.get(0).chatRoomNames()).isEmpty();
        assertThat(rows.get(1).chatRoomNames()).containsExactly("active B 단톡방");
    }

    @Test
    @DisplayName("선택 key — 쉼표가 포함된 사업자번호를 query 구분자로 재사용하지 않음")
    void selectionKeyDoesNotReuseCommaBusinessNumber() {
        UUID partnerId = UUID.randomUUID();
        TaxInvoice invoice = newIssued(partnerId, null, "comma-legacy", "A,B",
                "TI-COMMA", LocalDate.of(2026, 5, 3));
        addLine(invoice, 1, "품목C", null, BigDecimal.ONE, new BigDecimal("300"));

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of(invoice));
        when(partnerLookupClient.findByPartnerId(partnerId)).thenReturn(Optional.empty());

        List<StatementBatchRow> rows = service.batch(FROM, TO);

        assertThat(rows).singleElement().satisfies(row -> {
            assertThat(row.partnerCode()).isNull();
            assertThat(selectionKey(row)).doesNotContain(",");
        });
    }

    @Test
    @DisplayName("선택 key — 코드와 사업자번호가 비어 있는 여러 row 도 각각 고유")
    void blankSnapshotsStillHaveUniqueSelectionKeys() {
        UUID partnerA = UUID.randomUUID();
        UUID partnerB = UUID.randomUUID();
        TaxInvoice invoiceA = newIssued(partnerA, null, "blank-A", null,
                "TI-BLANK-A", LocalDate.of(2026, 5, 4));
        TaxInvoice invoiceB = newIssued(partnerB, null, "blank-B", null,
                "TI-BLANK-B", LocalDate.of(2026, 5, 5));
        addLine(invoiceA, 1, "품목A", null, BigDecimal.ONE, new BigDecimal("400"));
        addLine(invoiceB, 1, "품목B", null, BigDecimal.ONE, new BigDecimal("500"));

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of(invoiceA, invoiceB));
        when(partnerLookupClient.findByPartnerId(any())).thenReturn(Optional.empty());

        List<StatementBatchRow> rows = service.batch(FROM, TO);

        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(StatementBatchServiceTest::selectionKey)
                .doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("대표 snapshot — 첫 invoice 가 비어 있어도 그룹 내 결정된 후속 snapshot 을 사용")
    void representativeSnapshotScansGroupDeterministically() {
        UUID partnerId = UUID.randomUUID();
        TaxInvoice first = newIssued(partnerId, null, "거래처", null,
                "TI-FIRST", LocalDate.of(2026, 5, 1));
        TaxInvoice later = newIssued(partnerId, "LATER-CODE", "거래처", "111-22-33333",
                "TI-LATER", LocalDate.of(2026, 5, 5));
        addLine(first, 1, "품목1", null, BigDecimal.ONE, new BigDecimal("100"));
        addLine(later, 1, "품목2", null, BigDecimal.ONE, new BigDecimal("200"));

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of(first, later));
        when(partnerLookupClient.findByPartnerId(partnerId)).thenReturn(Optional.empty());
        when(chatRoomMappingClient.findChatRoomNamesByPartnerCode(any())).thenReturn(List.of());

        List<StatementBatchRow> rows = service.batch(FROM, TO);

        assertThat(rows).singleElement().satisfies(row -> {
            assertThat(row.partnerCode()).isEqualTo("LATER-CODE");
            assertThat(businessNo(row)).isEqualTo("111-22-33333");
        });
    }

    @Test
    @DisplayName("대표 snapshot — 유효값이 여러 개면 repository 조회 순서의 첫 값을 고정")
    void representativeSnapshotUsesRepositoryOrder() {
        UUID partnerId = UUID.randomUUID();
        TaxInvoice earlier = newIssued(partnerId, "EARLY-CODE", "거래처", "111-22-33333",
                "TI-EARLY", LocalDate.of(2026, 5, 1));
        TaxInvoice later = newIssued(partnerId, "LATER-CODE", "거래처", "222-33-44444",
                "TI-LATER", LocalDate.of(2026, 5, 5));
        addLine(earlier, 1, "품목1", null, BigDecimal.ONE, new BigDecimal("100"));
        addLine(later, 1, "품목2", null, BigDecimal.ONE, new BigDecimal("200"));

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of(earlier, later));
        when(partnerLookupClient.findByPartnerId(partnerId)).thenReturn(Optional.empty());
        when(chatRoomMappingClient.findChatRoomNamesByPartnerCode(any())).thenReturn(List.of());

        List<StatementBatchRow> rows = service.batch(FROM, TO);

        assertThat(rows).singleElement().satisfies(row -> {
            assertThat(row.partnerCode()).isEqualTo("EARLY-CODE");
            assertThat(row.bizNo()).isEqualTo("111-22-33333");
        });
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
        return newIssued(partnerId, null, partnerName, "111-22-33333", taxInvoiceNo, supplyDate);
    }

    private static TaxInvoice newIssued(UUID partnerId, String partnerCode, String partnerName,
                                         String taxInvoiceNo, LocalDate supplyDate) {
        return newIssued(partnerId, partnerCode, partnerName, "111-22-33333", taxInvoiceNo, supplyDate);
    }

    private static TaxInvoice newIssued(UUID partnerId, String partnerCode, String partnerName,
                                         String businessNo, String taxInvoiceNo, LocalDate supplyDate) {
        TaxInvoice ti = TaxInvoice.create(partnerId, partnerCode, businessNo, partnerName,
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

    private static String selectionKey(StatementBatchRow row) {
        return row.selectionKey();
    }

    private static String businessNo(StatementBatchRow row) {
        return row.bizNo();
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
