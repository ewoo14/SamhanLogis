package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.ApplicablePrice;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.ProductLabelMatch;
import com.samhanair.logis.accounting.client.ProductSummary;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.AccountingPeriod;
import com.samhanair.logis.accounting.domain.PeriodStatus;
import com.samhanair.logis.accounting.domain.PeriodType;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipLine;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipLine;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceLine;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.repository.AccountingPeriodRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.DailyClosingDetailResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * MonthEndCloseService.getDailyDetail() 단위 테스트 — BE-A12.
 *
 * <p>커버 시나리오 4건:
 * <ul>
 *   <li>일별 detail — 세금계산서 합계 + 모델별 합계</li>
 *   <li>product 마스터 — productClient 주입 보장 (NPE 가드)</li>
 *   <li>할인 적용 — totalDiscount 0 (placeholder)</li>
 *   <li>마감 lock 가드 — requireDateNotClosed 호출 시 CONFLICT</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class DailyClosingDetailServiceTest {

    @Mock private AccountingPeriodRepository periodRepository;
    @Mock private JournalLineRepository journalLineRepository;
    @Mock private SlipServiceClient slipServiceClient;
    @Mock private TaxInvoiceRepository taxInvoiceRepository;
    @Mock private ProductClient productClient;
    @Spy private DiscountRevalidator discountRevalidator = new DiscountRevalidator();
    @Mock private PartnerLookupClient partnerLookupClient;
    @Mock private SalesAccountingSlipRepository salesAccountingSlipRepository;
    @Mock private PurchaseAccountingSlipRepository purchaseAccountingSlipRepository;

    @InjectMocks private MonthEndCloseService service;

    private static final LocalDate DATE = LocalDate.of(2026, 5, 10);
    private static final LocalDate BEFORE_INCREASE_DATE = LocalDate.of(2000, 1, 1);

    @BeforeEach
    void setUpProductClientDefaults() {
        lenient().when(productClient.applicablePrices(anyList(), eq(DATE))).thenReturn(Map.of());
        lenient().when(productClient.fixedDiscountRates(anyList())).thenReturn(Map.of());
        lenient().when(productClient.priceChangeDefaultVariants()).thenReturn(Map.of(
                "homemulti", false,
                "singleSets", false,
                "commercialMulti", false,
                "oldProducts", false));
        lenient().when(productClient.lookup(anyList())).thenAnswer(invocation -> {
            List<UUID> ids = invocation.getArgument(0);
            return ids.stream().map(id -> productSummary(id, "homemulti")).toList();
        });
    }

    @Test
    @DisplayName("일별 detail — 세금계산서 합계 + 모델별 합계")
    void dailyDetailNormal() {
        TaxInvoice ti = newIssued("TI-001", "거래처A", DATE);
        addLine(ti, "에어컨", BigDecimal.ONE, new BigDecimal("500000"));
        addLine(ti, "에어컨", BigDecimal.ONE, new BigDecimal("500000")); // 같은 모델 누적
        addLine(ti, "송풍기", new BigDecimal("2"), new BigDecimal("100000"));
        recalcSnapshot(ti);

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));
        when(productClient.resolveByLabelBulk(anyList())).thenReturn(Map.of(
                "에어컨", ProductLabelMatch.notFound(),
                "송풍기", ProductLabelMatch.notFound()));

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        assertThat(resp.date()).isEqualTo(DATE);
        assertThat(resp.totalTaxInvoiceCount()).isEqualTo(1);
        assertThat(resp.totalSupply()).isEqualByComparingTo("1200000");
        assertThat(resp.totalVat()).isEqualByComparingTo("120000");
        assertThat(resp.taxInvoices()).hasSize(1);
        assertThat(resp.productSummaries()).hasSize(2); // 에어컨 + 송풍기
        DailyClosingDetailResponse.DailyProductLine 에어컨Line = resp.productSummaries().stream()
                .filter(p -> "에어컨".equals(p.productName())).findFirst().orElseThrow();
        assertThat(에어컨Line.quantity()).isEqualByComparingTo("2");
        assertThat(에어컨Line.supplyAmount()).isEqualByComparingTo("1000000");
        assertThat(에어컨Line.releasePrice()).isNull();
        assertThat(에어컨Line.deliveryPrice()).isNull();
        assertThat(에어컨Line.expectedRate()).isNull();
        assertThat(에어컨Line.actualRate()).isNull();
        assertThat(에어컨Line.verified()).isNull();
        assertThat(에어컨Line.revalidationStatus()).isEqualTo("NOT_FOUND");
        verify(productClient, never()).applicablePrices(anyList(), eq(DATE));
        verify(productClient, never()).fixedDiscountRates(anyList());
    }

    @Test
    @DisplayName("일마감 상세는 가격 이력 납품가가 아니라 원천 전표의 VAT 포함 실제 단가를 응답한다")
    void dailyDetailExposesAuthoritativeVatInclusiveUnitPrice() throws Exception {
        TaxInvoice ti = newIssued("TI-ACTUAL-PRICE", "실제단가거래처", DATE);
        addLine(ti, "실제단가품목", BigDecimal.ONE, new BigDecimal("500000"));
        recalcSnapshot(ti);

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));
        when(productClient.resolveByLabelBulk(anyList())).thenReturn(Map.of(
                "실제단가품목", ProductLabelMatch.notFound()));

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);
        String json = new ObjectMapper().findAndRegisterModules().writeValueAsString(resp);

        // RED: 현재 응답에는 actualUnitPrice가 없고, 화면은 별도 price history 납품가를 표시한다.
        assertThat(new ObjectMapper().readTree(json).at("/productSummaries/0/actualUnitPrice")
                .decimalValue()).isEqualByComparingTo("550000");
    }

    @Test
    @DisplayName("같은 축의 서로 다른 전표는 전표별 실제 단가를 각각 응답한다")
    void dailyDetailDoesNotAverageDifferentSlipUnitPrices() {
        TaxInvoice first = newIssued("TI-PRICE-1", "첫 거래처", DATE);
        addLineWithAxis(first, "동일모델", "AM480AXVHJH1SY", "commercialMulti",
                BigDecimal.ONE, new BigDecimal("23494250"));
        recalcSnapshot(first);

        TaxInvoice second = newIssued("TI-PRICE-2", "둘째 거래처", DATE);
        addLineWithAxis(second, "동일모델", "AM480AXVHJH1SY", "commercialMulti",
                BigDecimal.ONE, new BigDecimal("25494250"));
        recalcSnapshot(second);

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(first, second));
        when(productClient.resolveByLabelBulk(anyList())).thenReturn(Map.of(
                "동일모델", ProductLabelMatch.notFound()));

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        assertThat(resp.productSummaries()).hasSize(2);
        assertThat(resp.productSummaries())
                .extracting(DailyClosingDetailResponse.DailyProductLine::actualUnitPrice)
                .containsExactly(new BigDecimal("25843675.0000000000"),
                        new BigDecimal("28043675.0000000000"));
    }

    @Test
    @DisplayName("product 마스터 — productClient 주입 가드 (정상 호출)")
    void productClientInjected() {
        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of());

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        assertThat(resp.totalTaxInvoiceCount()).isZero();
        assertThat(resp.productSummaries()).isEmpty();
        verify(productClient, never()).resolveByLabelBulk(anyList());
        verify(productClient, never()).applicablePrices(anyList(), eq(DATE));
        verify(productClient, never()).fixedDiscountRates(anyList());
    }

    @Test
    @DisplayName("일마감 상세 — 인상 전 기본 설정 품목은 baseline price_history 단가를 표시한다")
    void dailyDetailPreChangeDefaultUsesBaselinePriceHistory() {
        UUID matched = UUID.randomUUID();
        TaxInvoice ti = newIssued("TI-PRE-CHANGE", "인상전거래처", DATE);
        addLineWithAxis(ti, "AJ040RXH4BC1 [4멀티]", "AJ040RXH4BC1", "homemulti",
                BigDecimal.ONE, new BigDecimal("50000"));
        recalcSnapshot(ti);

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));
        when(productClient.resolveByLabelBulk(anyList())).thenReturn(Map.of(
                "AJ040RXH4BC1 [4멀티]", ProductLabelMatch.matched(matched, "AJ040RXH4BC1")));
        when(productClient.priceChangeDefaultVariants()).thenReturn(Map.of("homemulti", true));
        when(productClient.applicablePrices(anyList(), eq(BEFORE_INCREASE_DATE))).thenReturn(Map.of(
                matched, new ApplicablePrice(new BigDecimal("90000"), new BigDecimal("63000"),
                        BEFORE_INCREASE_DATE)));
        when(productClient.fixedDiscountRates(anyList())).thenReturn(Map.of(
                matched, new BigDecimal("45.00")));

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        DailyClosingDetailResponse.DailyProductLine line = findProductLine(
                resp, "AJ040RXH4BC1 [4멀티]");
        assertThat(line.releasePrice()).isEqualByComparingTo("90000");
        assertThat(line.deliveryPrice()).isEqualByComparingTo("63000");
        verify(productClient).applicablePrices(List.of(matched), BEFORE_INCREASE_DATE);
    }

    @Test
    @DisplayName("B-03 exact snapshot 모델이 있으면 품명 다의성보다 exact 모델 축을 우선한다")
    void dailyDetailExactModelSnapshotWinsOverAmbiguousLabel() {
        UUID matched = UUID.randomUUID();
        TaxInvoice ti = newIssued("TI-B03", "거래처", DATE);
        addLineWithAxis(ti, "무풍 4way 냉난방 1등급", "AC060CS4FBH2SY", "singleSets",
                BigDecimal.ONE, new BigDecimal("1800000"));
        recalcSnapshot(ti);
        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));
        when(productClient.resolveByLabelBulk(anyList())).thenReturn(Map.of(
                "무풍 4way 냉난방 1등급", ProductLabelMatch.ambiguous()));
        when(productClient.lookupByModel("AC060CS4FBH2SY"))
                .thenReturn(new ProductSummary(matched, "테스트품목", "AC060CS4FBH2SY", null,
                        null, "ACTIVE", "singleSets", "AC060CS4FBH2SY"));
        when(productClient.applicablePrices(anyList(), eq(DATE))).thenReturn(Map.of(
                matched, new ApplicablePrice(new BigDecimal("3121800"), new BigDecimal("1840000"), DATE)));

        DailyClosingDetailResponse response = service.getDailyDetail(DATE);

        DailyClosingDetailResponse.DailyProductLine line = findProductLine(
                response, "무풍 4way 냉난방 1등급");
        assertThat(line.revalidationStatus()).isNotEqualTo("AMBIGUOUS");
        assertThat(line.releasePrice()).isEqualByComparingTo("3121800");
        assertThat(line.deliveryPrice()).isEqualByComparingTo("1840000");
    }

    @Test
    @DisplayName("할인 적용 — totalDiscount 0 (placeholder)")
    void discountPlaceholder() {
        TaxInvoice ti = newIssued("TI-DC", "할인거래처", DATE);
        addLine(ti, "할인품목", BigDecimal.ONE, new BigDecimal("100000"));
        recalcSnapshot(ti);
        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));
        when(productClient.resolveByLabelBulk(anyList()))
                .thenReturn(Map.of("할인품목", ProductLabelMatch.notFound()));

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        assertThat(resp.totalDiscount()).isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("세금계산서 detail — 라벨 해소 후 referent bulk 1회 조회와 재검증 필드를 노출한다")
    void taxInvoiceDetailRevalidatesWithBulkReferents() {
        UUID matched = UUID.randomUUID();
        UUID missingPrice = UUID.randomUUID();
        UUID missingFixedRate = UUID.randomUUID();
        UUID single = UUID.randomUUID();
        TaxInvoice ti = newIssued("TI-RV", "재검증거래처", DATE);
        // 단가 50000(순액) → 공급가 50000 + 세액 5000 = VAT포함 유효단가 55000 → 출고가 100000 대비 45%.
        addLineWithAxis(ti, "AJ040RXH4BC1 (RX다배관)", "AJ040RXH4BC1", "homemulti",
                BigDecimal.ONE, new BigDecimal("50000"));
        addLineWithAxis(ti, "AJ050RXH5BC1 [5다배관]", "AJ050RXH5BC1", "homemulti",
                BigDecimal.ONE, new BigDecimal("50000"));
        addLineWithAxis(ti, "AJ060MXHNBC1 [단배관]", "AJ060MXHNBC1", "homemulti",
                BigDecimal.ONE, new BigDecimal("50000"));
        addLine(ti, "AXJ-YA1509N [N-분기관]", BigDecimal.ONE, new BigDecimal("70000"));
        addLineWithAxis(ti, "AC023CN1DBC1 [CN냉전 실내기]", "AC023CN1DBC1", "singleSets",
                BigDecimal.ONE, new BigDecimal("80000"));
        addLine(ti, "운임", BigDecimal.ONE, new BigDecimal("10000"));
        recalcSnapshot(ti);

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));
        // LinkedHashMap 명시 — 실 프로덕션 경로(JSON 응답 → LinkedHashMap)는 라벨 등장 순서를 보존하며,
        // 아래 matchedProductIds 순서 단언이 그 순서에 의존한다(Map.of 는 순서를 보장하지 않아 부적합).
        Map<String, ProductLabelMatch> labelBulkResult = new LinkedHashMap<>();
        labelBulkResult.put("AJ040RXH4BC1 (RX다배관)", ProductLabelMatch.matched(matched, "AJ040RXH4BC1"));
        labelBulkResult.put("AJ050RXH5BC1 [5다배관]", ProductLabelMatch.matched(missingPrice, "AJ050RXH5BC1"));
        labelBulkResult.put("AJ060MXHNBC1 [단배관]", ProductLabelMatch.matched(missingFixedRate, "AJ060MXHNBC1"));
        labelBulkResult.put("AXJ-YA1509N [N-분기관]", ProductLabelMatch.notFound());
        labelBulkResult.put("AC023CN1DBC1 [CN냉전 실내기]", ProductLabelMatch.matched(single, "AC023CN1DBC1"));
        labelBulkResult.put("운임", ProductLabelMatch.notFound());
        when(productClient.resolveByLabelBulk(anyList())).thenReturn(labelBulkResult);
        when(productClient.applicablePrices(anyList(), eq(DATE))).thenReturn(Map.of(
                matched, new ApplicablePrice(new BigDecimal("100000"), new BigDecimal("70000"), DATE),
                missingFixedRate, new ApplicablePrice(new BigDecimal("100000"), new BigDecimal("70000"), DATE),
                single, new ApplicablePrice(new BigDecimal("100000"), new BigDecimal("70000"), DATE)));
        Map<UUID, BigDecimal> fixedRates = new LinkedHashMap<>();
        fixedRates.put(matched, new BigDecimal("45.00"));
        fixedRates.put(missingPrice, null);
        when(productClient.fixedDiscountRates(anyList())).thenReturn(fixedRates);

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        DailyClosingDetailResponse.DailyProductLine verified = findProductLine(resp, "AJ040RXH4BC1 (RX다배관)");
        assertThat(verified.releasePrice()).isEqualByComparingTo("100000");
        assertThat(verified.deliveryPrice()).isEqualByComparingTo("70000");
        assertThat(verified.expectedRate()).isEqualTo(45);
        assertThat(verified.actualRate()).isEqualTo(45);
        assertThat(verified.discountAmount()).isNull();
        assertThat(verified.verified()).isTrue();
        assertThat(verified.revalidationStatus()).isEqualTo("VERIFIED");

        DailyClosingDetailResponse.DailyProductLine missing = findProductLine(resp, "AJ050RXH5BC1 [5다배관]");
        assertThat(missing.revalidationStatus()).isEqualTo("MISSING_REFERENT");
        assertThat(missing.verified()).isNull();
        assertThat(missing.releasePrice()).isNull();

        // Finding6 fix: 출고가는 있고 fixedDc key만 없는 매칭 제품은 MISSING_REFERENT가 아니라
        // 멀티 45 폴백으로 판정된다(fixedDc는 멀티 분기에서만 소비).
        DailyClosingDetailResponse.DailyProductLine fixedDcFallback =
                findProductLine(resp, "AJ060MXHNBC1 [단배관]");
        assertThat(fixedDcFallback.revalidationStatus()).isEqualTo("VERIFIED");
        assertThat(fixedDcFallback.releasePrice()).isEqualByComparingTo("100000");
        assertThat(fixedDcFallback.expectedRate()).isEqualTo(45);
        assertThat(fixedDcFallback.actualRate()).isEqualTo(45);
        assertThat(fixedDcFallback.verified()).isTrue();

        DailyClosingDetailResponse.DailyProductLine notFound = findProductLine(resp, "AXJ-YA1509N [N-분기관]");
        assertThat(notFound.revalidationStatus()).isEqualTo("NOT_FOUND");
        assertThat(notFound.verified()).isNull();

        DailyClosingDetailResponse.DailyProductLine singleLine = findProductLine(resp, "AC023CN1DBC1 [CN냉전 실내기]");
        assertThat(singleLine.revalidationStatus()).isEqualTo("VERIFIED");
        assertThat(singleLine.verified()).isFalse();
        assertThat(singleLine.discountAmount()).isEqualByComparingTo("12000");

        DailyClosingDetailResponse.DailyProductLine freight = findProductLine(resp, "운임");
        assertThat(freight.revalidationStatus()).isEqualTo("VERIFIED");
        assertThat(freight.verified()).isTrue();
        assertThat(freight.releasePrice()).isNull();
        assertThat(freight.actualRate()).isNull();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<UUID>> idsCaptor = ArgumentCaptor.forClass(List.class);
        // #773 후속 — 라벨 수(6건)만큼 순차 호출(N+1)하던 이전 계약 대신 벌크 1회 호출로 배치화됐음을 증명한다.
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> labelsCaptor = ArgumentCaptor.forClass(List.class);
        verify(productClient, times(1)).resolveByLabelBulk(labelsCaptor.capture());
        assertThat(labelsCaptor.getValue()).containsExactly(
                "AJ040RXH4BC1 (RX다배관)", "AJ050RXH5BC1 [5다배관]", "AJ060MXHNBC1 [단배관]",
                "AXJ-YA1509N [N-분기관]", "AC023CN1DBC1 [CN냉전 실내기]", "운임");
        verify(productClient, times(1)).applicablePrices(idsCaptor.capture(), eq(DATE));
        assertThat(idsCaptor.getValue()).containsExactly(matched, missingPrice, missingFixedRate, single);
        verify(productClient, times(1)).fixedDiscountRates(idsCaptor.capture());
        assertThat(idsCaptor.getValue()).containsExactly(matched, missingPrice, missingFixedRate, single);
    }

    @Test
    @DisplayName("일마감 detail 라벨 101건은 100/1 청크로 조회하고 두 번째 청크 결과를 병합한다")
    void taxInvoiceDetailChunks101LabelsAndMergesSecondChunk() {
        TaxInvoice ti = newIssued("TI-CHUNK", "청킹거래처", DATE);
        List<String> labels = java.util.stream.IntStream.range(0, 101)
                .mapToObj(i -> String.format("CHUNK-%03d [규격]", i))
                .toList();
        labels.forEach(label -> addLineWithAxis(ti, label,
                String.format("AJ%05d", labels.indexOf(label)), "homemulti",
                BigDecimal.ONE, new BigDecimal("1000")));
        recalcSnapshot(ti);

        Map<String, UUID> productIdsByLabel = new LinkedHashMap<>();
        labels.forEach(label -> productIdsByLabel.put(label, UUID.randomUUID()));
        UUID secondChunkProductId = productIdsByLabel.get(labels.get(100));

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));
        when(productClient.resolveByLabelBulk(anyList())).thenAnswer(invocation -> {
            List<String> chunk = invocation.getArgument(0);
            Map<String, ProductLabelMatch> matches = new LinkedHashMap<>();
            for (String label : chunk) {
                matches.put(label, ProductLabelMatch.matched(productIdsByLabel.get(label),
                        String.format("AJ%05d", labels.indexOf(label))));
            }
            return matches;
        });
        when(productClient.applicablePrices(anyList(), eq(DATE))).thenReturn(Map.of(
                secondChunkProductId,
                new ApplicablePrice(new BigDecimal("2000"), new BigDecimal("1100"), DATE)));
        when(productClient.fixedDiscountRates(anyList())).thenReturn(Map.of(
                secondChunkProductId, new BigDecimal("45.00")));

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> labelsCaptor = ArgumentCaptor.forClass(List.class);
        verify(productClient, times(2)).resolveByLabelBulk(labelsCaptor.capture());
        assertThat(labelsCaptor.getAllValues()).extracting(List::size).containsExactly(100, 1);

        DailyClosingDetailResponse.DailyProductLine secondChunkLine =
                findProductLine(resp, labels.get(100));
        assertThat(secondChunkLine.releasePrice()).isEqualByComparingTo("2000");
        assertThat(secondChunkLine.deliveryPrice()).isEqualByComparingTo("1100");

        // 첫 청크(100건) 병합 유실 회귀 가드(QA mutation B): 첫 청크 라벨이 매칭 상태로 병합돼야 한다.
        // putAll 대신 재대입으로 첫 청크가 유실되면 getOrDefault(NOT_FOUND) 로 떨어져 아래 단언이 실패한다.
        DailyClosingDetailResponse.DailyProductLine firstChunkLine =
                findProductLine(resp, labels.get(0));
        assertThat(firstChunkLine.revalidationStatus()).isNotEqualTo("NOT_FOUND");
    }

    @Test
    @DisplayName("일마감 상세 — 카테고리를 확인할 수 없으면 단가를 표시하지 않는다")
    void dailyDetailUnknownCategoryFailsClosed() {
        UUID matched = UUID.randomUUID();
        TaxInvoice ti = newIssued("TI-UNKNOWN-CATEGORY", "미분류거래처", DATE);
        addLine(ti, "미분류모델 [규격]", BigDecimal.ONE, new BigDecimal("50000"));
        recalcSnapshot(ti);

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));
        when(productClient.resolveByLabelBulk(anyList())).thenReturn(Map.of(
                "미분류모델 [규격]", ProductLabelMatch.matched(matched, "미분류모델")));
        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        DailyClosingDetailResponse.DailyProductLine line = findProductLine(resp, "미분류모델 [규격]");
        assertThat(line.releasePrice()).isNull();
        assertThat(line.deliveryPrice()).isNull();
        assertThat(line.verified()).isNull();
        assertThat(line.revalidationStatus()).isEqualTo("MISSING_REFERENT");
        verify(productClient, never()).applicablePrices(anyList(), eq(DATE));
        verify(productClient, never()).applicablePrices(anyList(), eq(BEFORE_INCREASE_DATE));
    }

    @Test
    @DisplayName("원천 카테고리 축 — 같은 모델의 카테고리별 집계와 UNKNOWN을 분리한다")
    void dailyDetailKeepsKnownCategoryAxesSeparateFromUnknown() {
        UUID matched = UUID.randomUUID();
        TaxInvoice ti = newIssued("TI-CATEGORY-AXIS", "축거래처", DATE);
        addLineWithAxis(ti, "AJ040RXH4BC1 [홈]", "AJ040RXH4BC1", "homemulti",
                BigDecimal.ONE, new BigDecimal("50000"));
        addLineWithAxis(ti, "AJ040RXH4BC1 [싱글]", "AJ040RXH4BC1", "singleSets",
                BigDecimal.ONE, new BigDecimal("60000"));
        addLine(ti, "카테고리 미상", BigDecimal.ONE, new BigDecimal("70000"));
        recalcSnapshot(ti);

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));
        when(productClient.resolveByLabelBulk(anyList())).thenReturn(Map.of(
                "AJ040RXH4BC1 [홈]", ProductLabelMatch.matched(matched, "AJ040RXH4BC1"),
                "AJ040RXH4BC1 [싱글]", ProductLabelMatch.matched(matched, "AJ040RXH4BC1"),
                "카테고리 미상", ProductLabelMatch.notFound()));

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        assertThat(resp.productSummaries()).extracting(
                DailyClosingDetailResponse.DailyProductLine::categoryKey)
                .containsExactly("homemulti", "singleSets", "UNKNOWN");
        assertThat(resp.productSummaries()).extracting(
                DailyClosingDetailResponse.DailyProductLine::modelName)
                .containsExactly("AJ040RXH4BC1", "AJ040RXH4BC1", null);
        assertThat(resp.productSummaries()).extracting(
                DailyClosingDetailResponse.DailyProductLine::supplyAmount)
                .containsExactly(new BigDecimal("50000.00"), new BigDecimal("60000.00"),
                        new BigDecimal("70000.00"));
    }

    @Test
    @DisplayName("일마감 detail — 라벨 벌크 해소가 INVALID_INPUT 이면 부분성공 없이 전체 배치가 실패한다")
    void taxInvoiceDetailPropagatesBulkInvalidInput() {
        TaxInvoice ti = newIssued("TI-BLANK", "블랭크거래처", DATE);
        addLine(ti, "[규격만]", BigDecimal.ONE, new BigDecimal("1000"));
        recalcSnapshot(ti);

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));
        // product-service 가 blank 토큰에서 batch-level INVALID_INPUT(400) 을 던지는 상황 모사.
        // 회계 소비 경로(resolveProductLabels→getDailyDetail)에 try/catch 가 없어 전체 실패로 전파돼야 한다 —
        // blank 라벨만 소프트 NOT_FOUND 로 삼키는 회귀(부분성공 완화)를 차단하는 blast-radius 가드.
        when(productClient.resolveByLabelBulk(anyList()))
                .thenThrow(new BusinessException(ErrorCode.INVALID_INPUT,
                        "라벨에서 모델코드를 추출할 수 없습니다: [규격만]"));

        assertThatThrownBy(() -> service.getDailyDetail(DATE))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("라벨에서 모델코드를 추출할 수 없습니다");
    }

    @Test
    @DisplayName("세금계산서 detail — 수량 0 그룹은 서비스 통합 경로에서도 NOT_MEASURABLE로 노출한다")
    void taxInvoiceDetailZeroQuantityIsNotMeasurable() {
        UUID matched = UUID.randomUUID();
        TaxInvoice ti = newIssued("TI-ZERO", "재검증거래처", DATE);
        addLineWithAxis(ti, "AJ080RXH8BC1 [8다배관]", "AJ080RXH8BC1", "homemulti",
                BigDecimal.ZERO, new BigDecimal("50000"));
        recalcSnapshot(ti);

        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, DATE, DATE))
                .thenReturn(List.of(ti));
        when(productClient.resolveByLabelBulk(anyList())).thenReturn(
                Map.of("AJ080RXH8BC1 [8다배관]", ProductLabelMatch.matched(matched, "AJ080RXH8BC1")));
        when(productClient.applicablePrices(anyList(), eq(DATE))).thenReturn(Map.of(
                matched, new ApplicablePrice(new BigDecimal("100000"), new BigDecimal("70000"), DATE)));
        when(productClient.fixedDiscountRates(anyList())).thenReturn(Map.of(
                matched, new BigDecimal("45.00")));

        DailyClosingDetailResponse resp = service.getDailyDetail(DATE);

        DailyClosingDetailResponse.DailyProductLine line = findProductLine(resp, "AJ080RXH8BC1 [8다배관]");
        assertThat(line.revalidationStatus()).isEqualTo("NOT_MEASURABLE");
        assertThat(line.expectedRate()).isEqualTo(45);
        assertThat(line.actualRate()).isNull();
        assertThat(line.verified()).isNull();
        assertThat(line.releasePrice()).isEqualByComparingTo("100000");
    }

    @Test
    @DisplayName("매출전표 detail — 전표 라인 VAT 포함 유효단가로 재검증 필드를 노출한다")
    void salesSlipDetailRevalidatesWithLineVatAmount() {
        UUID matched = UUID.randomUUID();
        SalesAccountingSlip slip = newPostedSalesSlip("SAS-RV-001", DATE, "AJ040RXH4BC1 [4멀티]",
                BigDecimal.ONE, new BigDecimal("50000"), new BigDecimal("5000"));
        when(salesAccountingSlipRepository.findBySlipDateAndStatusWithLines(DATE, SalesSlipStatus.POSTED))
                .thenReturn(List.of(slip));
        when(productClient.resolveByLabelBulk(anyList())).thenReturn(
                Map.of("AJ040RXH4BC1 [4멀티]", ProductLabelMatch.matched(matched, "AJ040RXH4BC1")));
        when(productClient.applicablePrices(anyList(), eq(DATE))).thenReturn(Map.of(
                matched, new ApplicablePrice(new BigDecimal("100000"), new BigDecimal("70000"), DATE)));
        when(productClient.fixedDiscountRates(anyList())).thenReturn(Map.of(
                matched, new BigDecimal("45.00")));

        DailyClosingDetailResponse resp = service.getDailyDetail(
                DATE, com.samhanair.logis.accounting.domain.DailyClosingKind.SALES,
                com.samhanair.logis.accounting.domain.DailyClosingSourceKind.SALES_SLIP);

        DailyClosingDetailResponse.DailyProductLine line = findProductLine(resp, "AJ040RXH4BC1 [4멀티]");
        assertThat(line.quantity()).isEqualByComparingTo("1");
        assertThat(line.supplyAmount()).isEqualByComparingTo("50000");
        assertThat(line.releasePrice()).isEqualByComparingTo("100000");
        assertThat(line.deliveryPrice()).isEqualByComparingTo("70000");
        assertThat(line.expectedRate()).isEqualTo(45);
        assertThat(line.actualRate()).isEqualTo(45);
        assertThat(line.verified()).isTrue();
        assertThat(line.revalidationStatus()).isEqualTo("VERIFIED");
        assertThat(resp.totalDiscount()).isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("B-04 rename 후 exact 조회 404 — 두 번째 축은 첫 상품 가격으로 fallback하지 않는다")
    void mixedSalesSlipAllocationDoesNotFallbackToFirstProductWhenRenamedModelIsGone() {
        UUID firstProduct = UUID.randomUUID();
        UUID secondProduct = UUID.randomUUID();
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft(
                "SAS-B04-MIXED", DATE, UUID.randomUUID(), "P-SALES", "혼합거래처",
                SalesTaxType.TAXABLE, "B-04");
        SalesAccountingSlipLine line = SalesAccountingSlipLine.create(
                slip, 1, "AR80F07D21WS", "첫 번째 상품", null, null,
                new BigDecimal("2"), new BigDecimal("300"), new BigDecimal("300"),
                new BigDecimal("30"), new BigDecimal("330"));
        line.getAllocations().add(SalesAccountingSlipAllocation.create(line,
                UUID.randomUUID(), "OUT-FIRST", UUID.randomUUID(), 1,
                BigDecimal.ONE, new BigDecimal("110"), "AR80F07D21WS", "singleSets"));
        line.getAllocations().add(SalesAccountingSlipAllocation.create(line,
                UUID.randomUUID(), "OUT-SECOND", UUID.randomUUID(), 1,
                BigDecimal.ONE, new BigDecimal("220"), "AM480AXVHJH1SY", "commercialMulti"));
        setField(slip, "lines", new ArrayList<>(List.of(line)));
        setField(slip, "status", SalesSlipStatus.POSTED);
        when(salesAccountingSlipRepository.findBySlipDateAndStatusWithLines(
                DATE, SalesSlipStatus.POSTED)).thenReturn(List.of(slip));
        when(productClient.resolveByLabelBulk(anyList())).thenReturn(Map.of(
                "첫 번째 상품", ProductLabelMatch.matched(firstProduct, "AR80F07D21WS")));
        when(productClient.lookupByModel("AR80F07D21WS"))
                .thenReturn(productSummary(firstProduct, "singleSets"));
        // 두 번째 원천 전표가 생성된 뒤 제품명이 변경되어 과거 snapshot 모델명이 404가 된 상태.
        when(productClient.lookupByModel("AM480AXVHJH1SY")).thenReturn(null);
        when(productClient.applicablePrices(anyList(), eq(DATE))).thenReturn(Map.of(
                firstProduct, new ApplicablePrice(new BigDecimal("1000"), new BigDecimal("800"), DATE),
                secondProduct, new ApplicablePrice(new BigDecimal("3000"), new BigDecimal("2500"), DATE)));
        when(productClient.fixedDiscountRates(anyList())).thenReturn(Map.of(
                firstProduct, new BigDecimal("45"), secondProduct, new BigDecimal("45")));

        DailyClosingDetailResponse response = service.getDailyDetail(
                DATE, com.samhanair.logis.accounting.domain.DailyClosingKind.SALES,
                com.samhanair.logis.accounting.domain.DailyClosingSourceKind.SALES_SLIP);

        assertThat(response.productSummaries())
                .filteredOn(lineView -> "commercialMulti".equals(lineView.categoryKey()))
                .singleElement()
                .extracting(DailyClosingDetailResponse.DailyProductLine::releasePrice,
                        DailyClosingDetailResponse.DailyProductLine::deliveryPrice,
                        DailyClosingDetailResponse.DailyProductLine::revalidationStatus)
                .containsExactly(null, null, "NOT_FOUND");
    }

    @Test
    @DisplayName("이름 변경 후 과거 토큰 재사용 — 현재 이름 exact 제품이 과거 label 판정을 덮지 않는다")
    void renamedModelTokenReusedByAnotherProductDoesNotOverrideHistoricalLabelMatch() {
        UUID originalProduct = UUID.randomUUID();
        UUID reusedNameProduct = UUID.randomUUID();
        SalesAccountingSlip slip = newPostedSalesSlip(
                "SAS-R7-REUSED-MODEL", DATE, "과거 제품 A", BigDecimal.ONE,
                new BigDecimal("110"), new BigDecimal("10"));
        String reusedModelName = "AROLD12345";
        setField(slip.getLines().get(0), "modelName", reusedModelName);
        setField(slip.getLines().get(0), "categoryKey", "singleSets");
        when(salesAccountingSlipRepository.findBySlipDateAndStatusWithLines(
                DATE, SalesSlipStatus.POSTED)).thenReturn(List.of(slip));

        // A: modelCode=AROLD12345, modelName=NEW. B: modelCode=B-CODE, modelName=AROLD12345.
        // 과거 label resolver는 불변 modelCode=AROLD12345인 A를 반환해야 한다.
        when(productClient.resolveByLabelBulk(anyList())).thenReturn(Map.of(
                "과거 제품 A", ProductLabelMatch.matched(originalProduct, reusedModelName)));
        when(productClient.lookupByModel(reusedModelName))
                .thenReturn(new ProductSummary(reusedNameProduct, "재사용 제품 B", reusedModelName, null,
                        null, "ACTIVE", "singleSets", "B-CODE"));
        when(productClient.applicablePrices(anyList(), eq(DATE))).thenReturn(Map.of(
                originalProduct, new ApplicablePrice(new BigDecimal("1000"), new BigDecimal("800"), DATE),
                reusedNameProduct, new ApplicablePrice(new BigDecimal("9000"), new BigDecimal("7000"), DATE)));
        when(productClient.fixedDiscountRates(anyList())).thenReturn(Map.of(
                originalProduct, new BigDecimal("45"), reusedNameProduct, new BigDecimal("10")));

        DailyClosingDetailResponse response = service.getDailyDetail(
                DATE, com.samhanair.logis.accounting.domain.DailyClosingKind.SALES,
                com.samhanair.logis.accounting.domain.DailyClosingSourceKind.SALES_SLIP);

        assertThat(findProductLine(response, "과거 제품 A"))
                .extracting(DailyClosingDetailResponse.DailyProductLine::releasePrice,
                        DailyClosingDetailResponse.DailyProductLine::deliveryPrice)
                .containsExactly(new BigDecimal("1000"), new BigDecimal("800"));
    }

    @Test
    @DisplayName("매입전표 detail — 전표 라인 VAT 포함 유효단가로 재검증 필드를 노출한다")
    void purchaseSlipDetailRevalidatesWithLineVatAmount() {
        UUID matched = UUID.randomUUID();
        PurchaseAccountingSlip slip = newPostedPurchaseSlip("PAS-RV-001", DATE, "AM160NXVHHH1 [AM상업멀티]",
                BigDecimal.ONE, new BigDecimal("50000"), new BigDecimal("5000"));
        when(purchaseAccountingSlipRepository.findBySlipDateAndStatusWithLines(DATE, PurchaseSlipStatus.POSTED))
                .thenReturn(List.of(slip));
        when(productClient.resolveByLabelBulk(anyList())).thenReturn(
                Map.of("AM160NXVHHH1 [AM상업멀티]", ProductLabelMatch.matched(matched, "AM160NXVHHH1")));
        when(productClient.applicablePrices(anyList(), eq(DATE))).thenReturn(Map.of(
                matched, new ApplicablePrice(new BigDecimal("100000"), new BigDecimal("70000"), DATE)));
        when(productClient.fixedDiscountRates(anyList())).thenReturn(Map.of(
                matched, new BigDecimal("45.00")));

        DailyClosingDetailResponse resp = service.getDailyDetail(
                DATE, com.samhanair.logis.accounting.domain.DailyClosingKind.PURCHASE,
                com.samhanair.logis.accounting.domain.DailyClosingSourceKind.PURCHASE_SLIP);

        DailyClosingDetailResponse.DailyProductLine line = findProductLine(resp, "AM160NXVHHH1 [AM상업멀티]");
        assertThat(line.quantity()).isEqualByComparingTo("1");
        assertThat(line.supplyAmount()).isEqualByComparingTo("50000");
        assertThat(line.releasePrice()).isEqualByComparingTo("100000");
        assertThat(line.deliveryPrice()).isEqualByComparingTo("70000");
        assertThat(line.expectedRate()).isEqualTo(45);
        assertThat(line.actualRate()).isEqualTo(45);
        assertThat(line.verified()).isTrue();
        assertThat(line.revalidationStatus()).isEqualTo("VERIFIED");
        assertThat(resp.totalDiscount()).isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("마감 lock 가드 — requireDateNotClosed 호출 시 CONFLICT (CLOSED 일자)")
    void closedLockGuard() {
        AccountingPeriod closed = AccountingPeriod.create(PeriodType.DAILY, DATE, "마감됨");
        // closed 상태로 reflection
        try {
            Field statusField = AccountingPeriod.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(closed, PeriodStatus.CLOSED);
            Field idField = AccountingPeriod.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(closed, UUID.randomUUID());
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
        lenient().when(periodRepository.findCoveringClosedPeriod(PeriodStatus.CLOSED,
                DATE, DATE.withDayOfMonth(1))).thenReturn(List.of(closed));

        assertThatThrownBy(() -> service.requireDateNotClosed(DATE))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("마감된 회계 기간");
    }

    private static TaxInvoice newIssued(String taxInvoiceNo, String partnerName,
                                         LocalDate supplyDate) {
        TaxInvoice ti = TaxInvoice.create(UUID.randomUUID(), "111-22-33333", partnerName,
                "주소", supplyDate, null);
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
            Field linesField = TaxInvoice.class.getDeclaredField("lines");
            linesField.setAccessible(true);
            linesField.set(ti, new ArrayList<TaxInvoiceLine>());
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
        return ti;
    }

    private static void addLine(TaxInvoice ti, String itemName,
                                 BigDecimal qty, BigDecimal unitPrice) {
        TaxInvoiceLine line = TaxInvoiceLine.create(ti, 1, itemName, null, qty, unitPrice, null);
        addLine(ti, line);
    }

    private static void addLineWithAxis(TaxInvoice ti, String itemName, String modelName,
                                        String categoryKey, BigDecimal qty, BigDecimal unitPrice) {
        TaxInvoiceLine line = TaxInvoiceLine.create(ti, 1, itemName, null, qty, unitPrice, null);
        setField(line, "modelName", modelName);
        setField(line, "categoryKey", categoryKey);
        addLine(ti, line);
    }

    private static void addLine(TaxInvoice ti, TaxInvoiceLine line) {
        try {
            Field linesField = TaxInvoice.class.getDeclaredField("lines");
            linesField.setAccessible(true);
            @SuppressWarnings("unchecked")
            List<TaxInvoiceLine> lines = (List<TaxInvoiceLine>) linesField.get(ti);
            lines.add(line);
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }

    private static void recalcSnapshot(TaxInvoice ti) {
        try {
            Field linesField = TaxInvoice.class.getDeclaredField("lines");
            linesField.setAccessible(true);
            @SuppressWarnings("unchecked")
            List<TaxInvoiceLine> lines = (List<TaxInvoiceLine>) linesField.get(ti);
            BigDecimal supplySum = lines.stream()
                    .map(TaxInvoiceLine::getSupplyAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal vatSum = lines.stream()
                    .map(TaxInvoiceLine::getVatAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            Field supplyField = TaxInvoice.class.getDeclaredField("supplyAmount");
            supplyField.setAccessible(true);
            supplyField.set(ti, supplySum);
            Field vatField = TaxInvoice.class.getDeclaredField("vatAmount");
            vatField.setAccessible(true);
            vatField.set(ti, vatSum);
            Field totalField = TaxInvoice.class.getDeclaredField("totalAmount");
            totalField.setAccessible(true);
            totalField.set(ti, supplySum.add(vatSum));
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }

    private static DailyClosingDetailResponse.DailyProductLine findProductLine(
            DailyClosingDetailResponse response,
            String productName) {
        return response.productSummaries().stream()
                .filter(line -> productName.equals(line.productName()))
                .findFirst()
                .orElseThrow();
    }

    private static ProductSummary productSummary(UUID id, String categoryKey) {
        return new ProductSummary(id, "테스트품목", "TEST-MODEL", null, null, "ACTIVE", categoryKey);
    }

    private static SalesAccountingSlip newPostedSalesSlip(String slipNo, LocalDate slipDate,
                                                           String productName,
                                                           BigDecimal qty,
                                                           BigDecimal supplyAmount,
                                                           BigDecimal vatAmount) {
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft(
                slipNo, slipDate, UUID.randomUUID(), "P-SALES", "매출거래처",
                SalesTaxType.TAXABLE, "재검증 테스트");
        SalesAccountingSlipLine line = SalesAccountingSlipLine.create(
                slip, 1, "MIG4", productName, ModelTokenExtractor.extractModelTokenOrNull(productName),
                "homemulti", qty, supplyAmount, supplyAmount, vatAmount,
                supplyAmount.add(vatAmount));
        setField(slip, "lines", new ArrayList<>(List.of(line)));
        setField(slip, "status", SalesSlipStatus.POSTED);
        setField(slip, "totalSupplyAmount", supplyAmount);
        setField(slip, "totalVatAmount", vatAmount);
        setField(slip, "totalAmount", supplyAmount.add(vatAmount));
        return slip;
    }

    private static PurchaseAccountingSlip newPostedPurchaseSlip(String slipNo, LocalDate slipDate,
                                                                 String productName,
                                                                 BigDecimal qty,
                                                                 BigDecimal supplyAmount,
                                                                 BigDecimal vatAmount) {
        PurchaseAccountingSlip slip = PurchaseAccountingSlip.createDraft(
                slipNo, slipDate, UUID.randomUUID(), "P-PURCHASE", "매입거래처",
                SalesTaxType.TAXABLE, "재검증 테스트");
        PurchaseAccountingSlipLine line = PurchaseAccountingSlipLine.create(
                slip, 1, "MIG4", productName, qty, supplyAmount, supplyAmount, vatAmount,
                supplyAmount.add(vatAmount));
        setField(slip, "lines", new ArrayList<>(List.of(line)));
        setField(slip, "status", PurchaseSlipStatus.POSTED);
        setField(slip, "totalSupplyAmount", supplyAmount);
        setField(slip, "totalVatAmount", vatAmount);
        setField(slip, "totalAmount", supplyAmount.add(vatAmount));
        return slip;
    }

    private static void setField(Object target, String fieldName, Object value) {
        try {
            Field field = target.getClass().getDeclaredField(fieldName);
            field.setAccessible(true);
            field.set(target, value);
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }
}
