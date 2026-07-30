package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ApplicablePrice;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.ProductLabelMatch;
import com.samhanair.logis.accounting.client.ProductSummary;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.AccountingPeriod;
import com.samhanair.logis.accounting.domain.DailyClosingKind;
import com.samhanair.logis.accounting.domain.DailyClosingSourceKind;
import com.samhanair.logis.accounting.domain.PeriodStatus;
import com.samhanair.logis.accounting.domain.PeriodType;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipLine;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipLine;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceLine;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import com.samhanair.logis.accounting.repository.AccountingPeriodRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.AccountTotal;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.AccountingPeriodResponse;
import com.samhanair.logis.accounting.web.dto.CreateClosingRequest;
import com.samhanair.logis.accounting.web.dto.DailyClosingDetailResponse;
import com.samhanair.logis.accounting.web.dto.DailyClosingDetailResponse.DailyProductLine;
import com.samhanair.logis.accounting.web.dto.DailyClosingDetailResponse.DailyTaxInvoice;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매출 마감 service (Phase 10 Step 8 — P2-4).
 *
 * <p>매뉴얼 출처: {@code docs/manual/02-창고/04-매출-마감.md} §3-1.
 *
 * <p>라이프사이클 표 (Layer 4 의무):
 *
 * <pre>
 *   close (DAILY|MONTHLY) : OPEN → CLOSED
 *                            (1) period_date normalize (월별 = 1일)
 *                            (2) slip-service.lock-by-period 호출 → CONFIRMED 슬립 lock_flag=true
 *                            (3) POSTED+REVERSED(보상쌍 상쇄) 분개 합계 집계 (REVENUE/COST_OF_SALES/SGA) stamp
 *                            (4) AccountingPeriod CLOSED + closed_at/by 기록
 *   reverse               : CLOSED → OPEN (MASTER 만 — controller 가드)
 *   list                  : period_type / year 필터
 * </pre>
 *
 * <p>마감된 기간에 속한 분개 입력은 {@code AccountingPeriodGuard} 가 차단.
 *
 * <p>본 service 는 {@link SlipServiceClient} 외부 client 의존 — IT 에서 {@code @MockBean} 격리 의무
 * (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class MonthEndCloseService {

    /** ProductSheetSyncService 가 적재하는 인상 전 기준일(실제 baseline price_history row). */
    private static final LocalDate BEFORE_INCREASE_PRICE_HISTORY_DATE = LocalDate.of(2000, 1, 1);

    private final AccountingPeriodRepository periodRepository;
    private final JournalLineRepository journalLineRepository;
    private final SlipServiceClient slipServiceClient;
    private final TaxInvoiceRepository taxInvoiceRepository;
    private final ProductClient productClient;
    private final DiscountRevalidator discountRevalidator;
    private final PartnerLookupClient partnerLookupClient;
    private final SalesAccountingSlipRepository salesAccountingSlipRepository;
    private final PurchaseAccountingSlipRepository purchaseAccountingSlipRepository;

    /**
     * 마감 실행 — 일별 또는 월별. 동일 (type, period_date) row 가 OPEN 이면 재사용
     * (역마감 후 재마감 use-case), CLOSED 면 CONFLICT.
     */
    public AccountingPeriodResponse close(CreateClosingRequest request, String actorUserId) {
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 는 필수입니다");
        }
        LocalDate normalized = normalize(request.periodType(), request.periodDate());
        AccountingPeriod period = periodRepository
                .findByPeriodTypeAndPeriodDate(request.periodType(), normalized)
                .orElseGet(() -> periodRepository.save(
                        AccountingPeriod.create(request.periodType(), normalized,
                                request.description())));

        if (period.getStatus() == PeriodStatus.CLOSED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 마감된 기간입니다: " + period.getPeriodType() + " " + period.getPeriodDate());
        }

        // (1) slip-service 잠금 호출.
        LocalDate from = periodFrom(request.periodType(), normalized);
        LocalDate to = periodTo(request.periodType(), normalized);
        int lockedCount = slipServiceClient.lockByPeriod(from, to);

        // (2) 회계 합계 집계 (POSTED+REVERSED(보상쌍 상쇄)).
        List<AccountTotal> totals = journalLineRepository.aggregatePostedByAccount(from, to);
        BigDecimal totalSales = sumByPrefix(totals, "4");
        BigDecimal totalPurchase = sumByPrefix(totals, "5");
        BigDecimal totalExpense = sumByPrefix(totals, "8");

        // (3) close 트랜지션.
        period.close(actorUserId, totalSales, totalPurchase, totalExpense, lockedCount);
        return AccountingPeriodResponse.of(period);
    }

    /**
     * 역마감 — CLOSED → OPEN. controller 가 MASTER 권한 가드 (PreAuthorize).
     */
    public AccountingPeriodResponse reverse(UUID id, String actorUserId) {
        AccountingPeriod period = periodRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "존재하지 않는 마감입니다: " + id));
        period.reverse(actorUserId);
        return AccountingPeriodResponse.of(period);
    }

    /** 필터 조회 — period_type / year (year null 이면 전체). */
    @Transactional(readOnly = true)
    public List<AccountingPeriodResponse> list(PeriodType periodType, Integer year) {
        List<AccountingPeriod> periods;
        if (year == null && periodType == null) {
            periods = periodRepository.findAllByOrderByPeriodDateDescPeriodTypeAsc();
        } else if (year == null) {
            periods = periodRepository.findByPeriodTypeOrderByPeriodDateDescPeriodTypeAsc(periodType);
        } else {
            LocalDate from = LocalDate.of(year, 1, 1);
            LocalDate to = LocalDate.of(year, 12, 31);
            periods = periodType == null
                    ? periodRepository.findByPeriodDateBetweenOrderByPeriodDateDescPeriodTypeAsc(from, to)
                    : periodRepository.findByPeriodTypeAndPeriodDateBetweenOrderByPeriodDateDescPeriodTypeAsc(
                            periodType, from, to);
        }
        return periods.stream()
                .map(AccountingPeriodResponse::of)
                .toList();
    }

    /**
     * 일별 세금계산서 마감 detail (PR-E2 BE-A12).
     *
     * <p>legacy GAS 12번 "일마감 프로그램" — 일별 매출/세금계산서/할인 detail. 마감 row OPEN/CLOSED
     * 와 무관하게 read-only 조회 가능 (마감 화면 진입 전 미리보기 + 마감 후 audit 조회 모두 사용).
     *
     * <p>모델별 매출 합계는 product-service ProductClient lookup 으로 모델/할인/세트 마스터를
     * 갱신 — partner_id / spec / itemName 등 만 보여주는 단계.
     *
     * @param date 대상 일자 (필수)
     * @return 세금계산서 list + 모델별 합계 + 총합
     */
    @Transactional(readOnly = true)
    public DailyClosingDetailResponse getDailyDetail(LocalDate date) {
        return getDailyDetail(date, DailyClosingKind.SALES, DailyClosingSourceKind.TAX_INVOICE);
    }

    /**
     * SP-SAS-5 일별 마감 detail — sourceKind 별 read-only 미리보기.
     *
     * <p>기본값은 기존 SP-08-6-5 와 동일한 SALES + TAX_INVOICE 이다.
     */
    @Transactional(readOnly = true)
    public DailyClosingDetailResponse getDailyDetail(LocalDate date,
                                                     DailyClosingKind closingKind,
                                                     DailyClosingSourceKind sourceKind) {
        if (date == null) {
            throw new IllegalArgumentException("date 는 필수입니다");
        }
        DailyClosingKind kind = DailyClosingService.resolveClosingKind(closingKind);
        DailyClosingSourceKind source = DailyClosingService.resolveSourceKind(sourceKind);
        DailyClosingService.validateKindSourceMatch(kind, source);

        return switch (source) {
            case TAX_INVOICE -> getTaxInvoiceDailyDetail(date, kind);
            case SALES_SLIP -> getSalesSlipDailyDetail(date);
            case PURCHASE_SLIP -> getPurchaseSlipDailyDetail(date);
        };
    }

    private DailyClosingDetailResponse getTaxInvoiceDailyDetail(LocalDate date,
                                                               DailyClosingKind closingKind) {
        List<TaxInvoice> issued = taxInvoiceRepository
                .findIssuedInRange(TaxInvoiceStatus.ISSUED, date, date).stream()
                .filter(ti -> matchesInvoiceType(ti, closingKind))
                .toList();

        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;
        BigDecimal totalAmount = BigDecimal.ZERO;
        List<DailyTaxInvoice> taxInvoices = new ArrayList<>(issued.size());
        Map<UUID, PartnerSummary> partners = resolvePartners(issued.stream()
                .map(TaxInvoice::getPartnerId)
                .toList());

        // 모델별 누적 (productName 기준 — productId 가 분개에 직접 보존되지 않으므로 itemName 키)
        Map<String, ModelAccumulator> byModel = new LinkedHashMap<>();

        for (TaxInvoice ti : issued) {
            totalSupply = totalSupply.add(ti.getSupplyAmount());
            totalVat = totalVat.add(ti.getVatAmount());
            totalAmount = totalAmount.add(ti.getTotalAmount());
            taxInvoices.add(new DailyTaxInvoice(
                    ti.getTaxInvoiceNo(),
                    null,
                    null,
                    partnerBizNoDigits(ti.getPartnerId(), partners),
                    ti.getPartnerName(),
                    ti.getSupplyAmount(),
                    ti.getVatAmount(),
                    ti.getTotalAmount()));
            for (TaxInvoiceLine line : ti.getLines()) {
                String key = line.getItemName() == null ? "-" : line.getItemName();
                ModelAccumulator acc = byModel.computeIfAbsent(key, k -> new ModelAccumulator());
                acc.quantity = acc.quantity.add(line.getQuantity());
                acc.supplyAmount = acc.supplyAmount.add(line.getSupplyAmount());
                acc.vatAmount = acc.vatAmount.add(line.getVatAmount());
            }
        }

        List<DailyProductLine> products = revalidateProductLines(byModel, date);

        return new DailyClosingDetailResponse(
                date,
                issued.size(),
                totalSupply,
                totalVat,
                totalAmount,
                BigDecimal.ZERO,
                taxInvoices,
                products);
    }

    private DailyClosingDetailResponse getSalesSlipDailyDetail(LocalDate date) {
        List<SalesAccountingSlip> slips = salesAccountingSlipRepository
                .findBySlipDateAndStatusWithLines(date, SalesSlipStatus.POSTED);
        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;
        BigDecimal totalAmount = BigDecimal.ZERO;
        List<DailyTaxInvoice> rows = new ArrayList<>(slips.size());
        Map<UUID, PartnerSummary> partners = resolvePartners(slips.stream()
                .map(SalesAccountingSlip::getPartnerId)
                .toList());
        Map<String, ModelAccumulator> byModel = new LinkedHashMap<>();

        for (SalesAccountingSlip slip : slips) {
            totalSupply = totalSupply.add(slip.getTotalSupplyAmount());
            totalVat = totalVat.add(slip.getTotalVatAmount());
            totalAmount = totalAmount.add(slip.getTotalAmount());
            rows.add(new DailyTaxInvoice(
                    null,
                    slip.getSlipNo(),
                    firstSalesSourceSlipNo(slip),
                    partnerBizNoDigits(slip.getPartnerId(), partners),
                    slip.getPartnerName(),
                    slip.getTotalSupplyAmount(),
                    slip.getTotalVatAmount(),
                    slip.getTotalAmount()));
            for (SalesAccountingSlipLine line : slip.getLines()) {
                accumulateProduct(byModel, line.getProductName(), line.getQty(),
                        line.getSupplyAmount(), line.getVatAmount());
            }
        }
        return new DailyClosingDetailResponse(date, slips.size(), totalSupply, totalVat, totalAmount,
                BigDecimal.ZERO, rows, revalidateProductLines(byModel, date));
    }

    private DailyClosingDetailResponse getPurchaseSlipDailyDetail(LocalDate date) {
        List<PurchaseAccountingSlip> slips = purchaseAccountingSlipRepository
                .findBySlipDateAndStatusWithLines(date, PurchaseSlipStatus.POSTED);
        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;
        BigDecimal totalAmount = BigDecimal.ZERO;
        List<DailyTaxInvoice> rows = new ArrayList<>(slips.size());
        Map<UUID, PartnerSummary> partners = resolvePartners(slips.stream()
                .map(PurchaseAccountingSlip::getPartnerId)
                .toList());
        Map<String, ModelAccumulator> byModel = new LinkedHashMap<>();

        for (PurchaseAccountingSlip slip : slips) {
            totalSupply = totalSupply.add(slip.getTotalSupplyAmount());
            totalVat = totalVat.add(slip.getTotalVatAmount());
            totalAmount = totalAmount.add(slip.getTotalAmount());
            rows.add(new DailyTaxInvoice(
                    null,
                    slip.getSlipNo(),
                    firstPurchaseSourceSlipNo(slip),
                    partnerBizNoDigits(slip.getPartnerId(), partners),
                    slip.getPartnerName(),
                    slip.getTotalSupplyAmount(),
                    slip.getTotalVatAmount(),
                    slip.getTotalAmount()));
            for (PurchaseAccountingSlipLine line : slip.getLines()) {
                accumulateProduct(byModel, line.getProductName(), line.getQty(),
                        line.getSupplyAmount(), line.getVatAmount());
            }
        }
        return new DailyClosingDetailResponse(date, slips.size(), totalSupply, totalVat, totalAmount,
                BigDecimal.ZERO, rows, revalidateProductLines(byModel, date));
    }

    private static boolean matchesInvoiceType(TaxInvoice invoice, DailyClosingKind closingKind) {
        TaxInvoiceType invoiceType = invoice.getInvoiceType();
        if (closingKind == DailyClosingKind.SALES) {
            return invoiceType == null || invoiceType == TaxInvoiceType.SALES;
        }
        return invoiceType == TaxInvoiceType.PURCHASE;
    }

    private static String firstSalesSourceSlipNo(SalesAccountingSlip slip) {
        return slip.getLines().stream()
                .flatMap(line -> line.getAllocations().stream())
                .map(SalesAccountingSlipAllocation::getSourceSlipNo)
                .filter(s -> s != null && !s.isBlank())
                .findFirst()
                .orElse(null);
    }

    private static String firstPurchaseSourceSlipNo(PurchaseAccountingSlip slip) {
        return slip.getLines().stream()
                .flatMap(line -> line.getAllocations().stream())
                .map(PurchaseAccountingSlipAllocation::getSourceSlipNo)
                .filter(s -> s != null && !s.isBlank())
                .findFirst()
                .orElse(null);
    }

    private static void accumulateProduct(Map<String, ModelAccumulator> byModel,
                                          String productName,
                                          BigDecimal quantity,
                                          BigDecimal supplyAmount,
                                          BigDecimal vatAmount) {
        String key = productName == null || productName.isBlank() ? "-" : productName;
        ModelAccumulator acc = byModel.computeIfAbsent(key, k -> new ModelAccumulator());
        acc.quantity = acc.quantity.add(nullToZero(quantity));
        acc.supplyAmount = acc.supplyAmount.add(nullToZero(supplyAmount));
        acc.vatAmount = acc.vatAmount.add(nullToZero(vatAmount));
    }

    private List<DailyProductLine> revalidateProductLines(Map<String, ModelAccumulator> byModel,
                                                          LocalDate asOf) {
        Map<String, ProductLabelMatch> labelMatches = resolveProductLabels(byModel.keySet().stream().toList());
        List<UUID> matchedProductIds = labelMatches.values().stream()
                .filter(ProductLabelMatch::isMatched)
                .map(ProductLabelMatch::productId)
                .filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new))
                .stream()
                .toList();
        Map<UUID, ProductSummary> productSummaries = loadProductSummaries(matchedProductIds);
        Map<String, Boolean> defaultVariants = matchedProductIds.isEmpty()
                ? Map.of()
                : productClient.priceChangeDefaultVariants();
        Map<UUID, ApplicablePrice> pricesByProductId = loadApplicablePrices(
                matchedProductIds, asOf, productSummaries, defaultVariants);
        Map<UUID, BigDecimal> fixedRatesByProductId = loadFixedDiscountRates(matchedProductIds);

        List<DailyProductLine> products = new ArrayList<>(byModel.size());
        for (Map.Entry<String, ModelAccumulator> e : byModel.entrySet()) {
            ProductLabelMatch labelMatch = labelMatches.getOrDefault(e.getKey(), ProductLabelMatch.notFound());
            UUID productId = labelMatch.productId();
            ApplicablePrice price = labelMatch.isMatched() ? pricesByProductId.get(productId) : null;
            // 재검증 분기용 토큰(미매치 시 정규화 품명 fallback 포함).
            String modelToken = ModelTokenExtractor.extractModelToken(e.getKey());
            // fixedDc key 누락은 미설정(멀티 45 폴백)으로 처리한다. price key 누락도 엔진에 넘겨
            // 일반 품목은 MISSING_REFERENT, 운임/절삭은 레거시처럼 referent 무관 VERIFIED 로 판정한다.
            DiscountRevalidator.Revalidation revalidation = discountRevalidator.revalidate(
                    e.getKey(),
                    modelToken,
                    e.getValue().effectiveUnitPrice(),
                    price == null ? null : price.release(),
                    price == null ? null : price.delivery(),
                    labelMatch.isMatched() ? fixedRatesByProductId.get(productId) : null,
                    labelMatch.status());
            products.add(new DailyProductLine(
                    e.getKey(),
                    // 표시 전용: 실 모델코드만(운임·서비스 등 미매치는 null→FE '—', 품명 중복 방지).
                    ModelTokenExtractor.extractModelTokenOrNull(e.getKey()),
                    e.getValue().quantity,
                    e.getValue().supplyAmount,
                    revalidation.releasePrice(),
                    revalidation.deliveryPrice(),
                    revalidation.expectedRate(),
                    revalidation.actualRate(),
                    revalidation.verified(),
                    revalidation.status().name()));
        }
        return products;
    }

    /**
     * 회계 라벨 목록을 product-service 벌크 endpoint 로 해소한다 (#773 후속 — N+1 HTTP 제거).
     *
     * <p>라벨 수만큼 {@code resolveByLabel} 을 순차 호출하던 이전 구현을 {@link ProductClient#resolveByLabelBulk(List)}
     * 1회 호출로 대체한다. 하루치 배치가 {@link ProductClient#LABEL_BATCH_MAX} 를 넘는 드문 경우에도
     * (일마감 라벨은 통상 그 이하) 무제한 라벨 수를 계속 지원하도록 {@link #labelChunks(List)} 로 청킹해
     * 여러 번 호출한다 — {@link #loadApplicablePrices}/{@link #loadFixedDiscountRates} 의 기존 청킹
     * 관례와 동일한 패턴이다. 반환 Map 은 소비측({@link #revalidateProductLines})이 {@code getOrDefault}
     * 로 결측 라벨을 방어하므로 판정/동작은 이전과 동일하다(순수 배치화, 결과 무변경).
     *
     * @param labels 해소할 라벨 목록(중복 없음 — {@code byModel.keySet()} 유래)
     * @return 라벨 → 매칭 result Map
     */
    private Map<String, ProductLabelMatch> resolveProductLabels(List<String> labels) {
        if (labels.isEmpty()) {
            return Map.of();
        }
        Map<String, ProductLabelMatch> matches = new LinkedHashMap<>();
        for (List<String> chunk : labelChunks(labels)) {
            matches.putAll(productClient.resolveByLabelBulk(chunk));
        }
        return matches;
    }

    /** {@link ProductClient#LABEL_BATCH_MAX} 단위로 라벨 목록을 청크로 분할한다. */
    private static List<List<String>> labelChunks(List<String> labels) {
        List<List<String>> chunks = new ArrayList<>();
        for (int start = 0; start < labels.size(); start += ProductClient.LABEL_BATCH_MAX) {
            int end = Math.min(start + ProductClient.LABEL_BATCH_MAX, labels.size());
            chunks.add(labels.subList(start, end));
        }
        return chunks;
    }

    private Map<UUID, ProductSummary> loadProductSummaries(List<UUID> productIds) {
        if (productIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, ProductSummary> result = new LinkedHashMap<>();
        for (List<UUID> chunk : productIdChunks(productIds, ProductClient.LOOKUP_BATCH_MAX)) {
            for (ProductSummary summary : productClient.lookup(chunk)) {
                if (summary != null && summary.id() != null) {
                    result.put(summary.id(), summary);
                }
            }
        }
        return result;
    }

    private Map<UUID, ApplicablePrice> loadApplicablePrices(
            List<UUID> productIds,
            LocalDate asOf,
            Map<UUID, ProductSummary> productSummaries,
            Map<String, Boolean> defaultVariants) {
        if (productIds.isEmpty()) {
            return Map.of();
        }
        Map<LocalDate, List<UUID>> idsByPriceDate = new LinkedHashMap<>();
        for (UUID productId : productIds) {
            LocalDate priceDate = priceHistoryDate(
                    productSummaries.get(productId), defaultVariants, asOf);
            // 카테고리/설정이 확인되지 않은 품목은 가격을 조회하지 않는다. null 가격은
            // DiscountRevalidator 가 MISSING_REFERENT 로 표시하여 틀린 단가를 숨긴다.
            if (priceDate != null) {
                idsByPriceDate.computeIfAbsent(priceDate, ignored -> new ArrayList<>()).add(productId);
            }
        }
        Map<UUID, ApplicablePrice> result = new LinkedHashMap<>();
        for (Map.Entry<LocalDate, List<UUID>> entry : idsByPriceDate.entrySet()) {
            for (List<UUID> chunk : chunks(entry.getValue())) {
                result.putAll(productClient.applicablePrices(chunk, entry.getKey()));
            }
        }
        return result;
    }

    private static LocalDate priceHistoryDate(ProductSummary summary,
                                               Map<String, Boolean> defaultVariants,
                                               LocalDate asOf) {
        GasCategoryAxis axis = summary == null
                ? GasCategoryAxis.UNKNOWN
                : GasCategoryAxis.fromScheduleKey(summary.categoryKey());
        if (!axis.isKnown()) {
            return null;
        }
        Boolean defaultPreChange = defaultVariants.get(axis.scheduleKey());
        if (defaultPreChange == null) {
            return null;
        }
        return defaultPreChange ? BEFORE_INCREASE_PRICE_HISTORY_DATE : asOf;
    }

    private Map<UUID, BigDecimal> loadFixedDiscountRates(List<UUID> productIds) {
        if (productIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, BigDecimal> result = new LinkedHashMap<>();
        for (List<UUID> chunk : chunks(productIds)) {
            result.putAll(productClient.fixedDiscountRates(chunk));
        }
        return result;
    }

    private static List<List<UUID>> chunks(List<UUID> productIds) {
        return productIdChunks(productIds, ProductClient.REFERENT_BATCH_MAX);
    }

    private static List<List<UUID>> productIdChunks(List<UUID> productIds, int batchMax) {
        List<List<UUID>> chunks = new ArrayList<>();
        for (int start = 0; start < productIds.size(); start += batchMax) {
            int end = Math.min(start + batchMax, productIds.size());
            chunks.add(productIds.subList(start, end));
        }
        return chunks;
    }

    private Map<UUID, PartnerSummary> resolvePartners(List<UUID> partnerIds) {
        LinkedHashSet<UUID> ids = partnerIds.stream()
                .filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, PartnerSummary> resolved = partnerLookupClient.findByPartnerIdsBatch(new ArrayList<>(ids));
        return resolved == null ? Map.of() : resolved;
    }

    private String partnerBizNoDigits(UUID partnerId, Map<UUID, PartnerSummary> partners) {
        if (partnerId == null) {
            return "";
        }
        PartnerSummary summary = partners.get(partnerId);
        String bizNo = summary == null ? null : summary.bizNo();
        return bizNo == null ? "" : bizNo.replaceAll("[^0-9]", "");
    }

    /**
     * 마감 lock 가드 헬퍼 — 일자 가 마감된 기간에 속하면 CONFLICT 던짐.
     * GET /accounting/closings/daily 자체는 read-only 라 가드 미적용 — 추후 일별 마감 lock 후
     * detail 조회 차단 use-case 가 발생하면 본 메서드로 옵션 enable.
     */
    @Transactional(readOnly = true)
    public void requireDateNotClosed(LocalDate date) {
        findClosedPeriodCovering(date).ifPresent(p -> {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "마감된 회계 기간입니다 — 해당 일자(" + date + ")는 detail 조회/변경할 수 없습니다");
        });
    }

    /** 모델별 누적 헬퍼. */
    private static final class ModelAccumulator {
        BigDecimal quantity = BigDecimal.ZERO;
        BigDecimal supplyAmount = BigDecimal.ZERO;
        BigDecimal vatAmount = BigDecimal.ZERO;

        /**
         * VAT 포함 유효단가 = (공급가액 + 세액) / 수량. 레거시 확인 산식의 단가(VAT포함)와 동일 기준
         * (재검증 엔진의 출고가 대비 할인율이 레거시와 파리티를 유지하도록 VAT 포함으로 산출).
         * 수량 0 이면 null(판정 불가).
         */
        BigDecimal effectiveUnitPrice() {
            if (quantity == null || quantity.compareTo(BigDecimal.ZERO) == 0) {
                return null;
            }
            return supplyAmount.add(vatAmount).divide(quantity, 10, RoundingMode.HALF_UP);
        }
    }

    /**
     * Guard 헬퍼 — 주어진 일자가 마감된 기간에 속하는지 (DAILY 동일 일자 또는 MONTHLY 동일 월) 검사.
     * 1건이라도 발견되면 첫 row 반환. AccountingPeriodGuard interceptor 사용.
     */
    @Transactional(readOnly = true)
    public Optional<AccountingPeriod> findClosedPeriodCovering(LocalDate journalDate) {
        if (journalDate == null) {
            return Optional.empty();
        }
        LocalDate monthFirst = journalDate.withDayOfMonth(1);
        return periodRepository.findCoveringClosedPeriod(PeriodStatus.CLOSED, journalDate, monthFirst)
                .stream().findFirst();
    }

    private static LocalDate normalize(PeriodType type, LocalDate date) {
        return switch (type) {
            case DAILY -> date;
            case MONTHLY -> date.withDayOfMonth(1);
        };
    }

    private static LocalDate periodFrom(PeriodType type, LocalDate normalized) {
        return switch (type) {
            case DAILY -> normalized;
            case MONTHLY -> normalized.withDayOfMonth(1);
        };
    }

    private static LocalDate periodTo(PeriodType type, LocalDate normalized) {
        return switch (type) {
            case DAILY -> normalized;
            case MONTHLY -> normalized.withDayOfMonth(normalized.lengthOfMonth());
        };
    }

    /**
     * 매출/매입/판관비 합계 산출 — accountCode prefix 가 일치하는 row 의 (credit-debit) 또는
     * (debit-credit) 누적. REVENUE(4): credit-debit (대변잔액). COST_OF_SALES(5)/SGA(8):
     * debit-credit (차변잔액).
     */
    private static BigDecimal sumByPrefix(List<AccountTotal> totals, String prefix) {
        BigDecimal sum = BigDecimal.ZERO;
        boolean creditNormal = "4".equals(prefix);
        for (AccountTotal t : totals) {
            if (t.getAccountCode() != null && t.getAccountCode().startsWith(prefix)) {
                BigDecimal d = nullToZero(t.getDebitTotal());
                BigDecimal c = nullToZero(t.getCreditTotal());
                BigDecimal delta = creditNormal ? c.subtract(d) : d.subtract(c);
                sum = sum.add(delta);
            }
        }
        return sum;
    }

    private static BigDecimal nullToZero(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
