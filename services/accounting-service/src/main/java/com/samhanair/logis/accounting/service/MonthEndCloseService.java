package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ApplicablePrice;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.ProductLabelMatch;
import com.samhanair.logis.accounting.client.ProductSummary;
import com.samhanair.logis.accounting.client.EstimateComponent;
import com.samhanair.logis.accounting.client.PartnerDcConfigClient;
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
import java.util.Set;
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
    private final PartnerDcConfigClient partnerDcConfigClient;
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

        // 판매 라인의 보존 모델/카테고리 축별 누적 — productId가 분개에 직접 보존되지 않아 label도 함께 유지
        Map<AxisKey, ModelAccumulator> byModel = new LinkedHashMap<>();

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
                accumulateProduct(byModel, ti.getPartnerCode(), line.getItemName(), line.getModelName(),
                        line.getCategoryKey(), line.getQuantity(), line.getSupplyAmount(),
                        line.getVatAmount());
            }
        }

        List<DailyProductLine> products = revalidateProductLines(byModel, date, false);

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
        Map<AxisKey, ModelAccumulator> byModel = new LinkedHashMap<>();

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
                accumulateSalesLine(byModel, slip.getPartnerCode(), line);
            }
        }
        return new DailyClosingDetailResponse(date, slips.size(), totalSupply, totalVat, totalAmount,
                BigDecimal.ZERO, rows, revalidateProductLines(byModel, date, false));
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
        Map<AxisKey, ModelAccumulator> byModel = new LinkedHashMap<>();

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
                accumulateProduct(byModel, slip.getPartnerCode(), line.getProductName(), null, null, line.getQty(),
                        line.getSupplyAmount(), line.getVatAmount());
            }
        }
        return new DailyClosingDetailResponse(date, slips.size(), totalSupply, totalVat, totalAmount,
                BigDecimal.ZERO, rows, revalidateProductLines(byModel, date, true));
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

    private static void accumulateProduct(Map<AxisKey, ModelAccumulator> byModel,
                                          String partnerCode, String productName, String modelName, String categoryKey,
                                          BigDecimal quantity,
                                          BigDecimal supplyAmount,
                                          BigDecimal vatAmount) {
        BigDecimal actualUnitPrice = actualUnitPrice(quantity, supplyAmount, vatAmount);
        AxisKey key = axisKey(partnerCode, productName, modelName, categoryKey, actualUnitPrice);
        ModelAccumulator acc = byModel.computeIfAbsent(key,
                k -> new ModelAccumulator(actualUnitPrice));
        acc.quantity = acc.quantity.add(nullToZero(quantity));
        acc.supplyAmount = acc.supplyAmount.add(nullToZero(supplyAmount));
        acc.vatAmount = acc.vatAmount.add(nullToZero(vatAmount));
    }

    private static void accumulateSalesLine(Map<AxisKey, ModelAccumulator> byModel,
                                            String partnerCode, SalesAccountingSlipLine line) {
        if (line.getCategoryKey() != null || line.getModelName() != null
                || line.getAllocations().isEmpty()) {
            accumulateProduct(byModel, partnerCode, line.getProductName(), line.getModelName(),
                    line.getCategoryKey(), line.getQty(), line.getSupplyAmount(), line.getVatAmount());
            return;
        }
        for (SalesAccountingSlipAllocation allocation : line.getAllocations()) {
            BigDecimal ratio = line.getLineTotal() == null
                    || line.getLineTotal().compareTo(BigDecimal.ZERO) == 0
                    ? BigDecimal.ZERO
                    : allocation.getAllocatedAmount().divide(line.getLineTotal(), 10, RoundingMode.HALF_UP);
            accumulateProduct(byModel, partnerCode, line.getProductName(), allocation.getModelName(),
                    allocation.getCategoryKey(), allocation.getAllocatedQty(),
                    line.getSupplyAmount().multiply(ratio), line.getVatAmount().multiply(ratio));
        }
    }

    /** 한 원천 라인의 공급가액·부가세·수량에서 실제 VAT 포함 단가를 구한다. */
    private static BigDecimal actualUnitPrice(BigDecimal quantity,
                                              BigDecimal supplyAmount,
                                              BigDecimal vatAmount) {
        BigDecimal safeQuantity = nullToZero(quantity);
        if (safeQuantity.compareTo(BigDecimal.ZERO) == 0) {
            return null;
        }
        return nullToZero(supplyAmount).add(nullToZero(vatAmount))
                .divide(safeQuantity, 10, RoundingMode.HALF_UP);
    }

    private static AxisKey axisKey(String partnerCode, String productName, String modelName, String categoryKey,
                                   BigDecimal actualUnitPrice) {
        String label = productName == null || productName.isBlank() ? "-" : productName;
        String modelToken = ModelTokenExtractor.extractModelTokenOrNull(modelName);
        GasCategoryAxis axis = modelToken == null
                ? GasCategoryAxis.UNKNOWN
                : GasCategoryAxis.fromScheduleKey(categoryKey);
        return new AxisKey(partnerCode, label, modelToken, axis, actualUnitPrice);
    }

    private List<DailyProductLine> revalidateProductLines(Map<AxisKey, ModelAccumulator> byModel,
                                                          LocalDate asOf,
                                                          boolean preservePurchasePriceLookup) {
        List<String> labels = byModel.keySet().stream().map(AxisKey::label).distinct().toList();
        Map<String, ProductLabelMatch> labelMatches = resolveProductLabels(labels);
        Map<String, ProductSummary> modelSummaries = resolveProductSummaries(byModel.keySet());
        Map<String, ProductLabelMatch> modelMatches = modelSummaries.entrySet().stream()
                .collect(java.util.stream.Collectors.toMap(
                        Map.Entry::getKey,
                        e -> ProductLabelMatch.matched(e.getValue().id(), e.getValue().modelCode()),
                        (left, right) -> left,
                        LinkedHashMap::new));
        List<UUID> matchedProductIds = byModel.keySet().stream()
                .map(axis -> effectiveProductMatch(axis, labelMatches, modelMatches))
                .filter(ProductLabelMatch::isMatched)
                .map(ProductLabelMatch::productId)
                .filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new))
                .stream()
                .toList();
        Map<String, Boolean> defaultVariants = matchedProductIds.isEmpty()
                ? Map.of()
                : productClient.priceChangeDefaultVariants();
        Map<UUID, GasCategoryAxis> legacyPriceAxes = preservePurchasePriceLookup
                ? loadProductSummaries(matchedProductIds).values().stream()
                        .filter(summary -> summary.id() != null)
                        .collect(java.util.stream.Collectors.toMap(
                                ProductSummary::id,
                                summary -> GasCategoryAxis.fromScheduleKey(summary.categoryKey()),
                                (left, right) -> left,
                                LinkedHashMap::new))
                : Map.of();
        Map<PriceLookupKey, ApplicablePrice> pricesByAxis = loadApplicablePrices(
                byModel.keySet(), labelMatches, modelMatches, asOf, defaultVariants, legacyPriceAxes);
        Map<UUID, BigDecimal> fixedRatesByProductId = loadFixedDiscountRates(matchedProductIds);
        Map<String, DiscountRevalidator.GlobalDiscount> globalDiscountsByPartnerCode = new LinkedHashMap<>();
        for (String partnerCode : byModel.keySet().stream().map(AxisKey::partnerCode).distinct().toList()) {
            try {
                PartnerDcConfigClient.LookupResult result = partnerDcConfigClient.findByPartnerCode(partnerCode);
                globalDiscountsByPartnerCode.put(partnerCode, result.found()
                        ? DiscountRevalidator.GlobalDiscount.found(result.homeRate(), result.commercialRate(),
                                result.discount360Amount(), result.discount4WayAmount(), result.discount1WayAmount(),
                                result.discountStandAmount(), result.discountDeluxeAmount(), result.discountFirstGradeAmount())
                        : DiscountRevalidator.GlobalDiscount.unavailable());
            } catch (RuntimeException ex) {
                // 전역DC는 상세 판정의 참고값이다. 외부 장애를 상세 전체 실패로 전파하지 않고,
                // 엔진이 MISSING_GLOBAL_DISCOUNT를 반환하도록 상태를 보존한다.
                globalDiscountsByPartnerCode.put(partnerCode, DiscountRevalidator.GlobalDiscount.unavailable());
            }
        }
        Map<ParentModelKey, String> parentSetNames = resolveMatchedSetNames(byModel, globalDiscountsByPartnerCode);

        List<DailyProductLine> products = new ArrayList<>(byModel.size());
        for (Map.Entry<AxisKey, ModelAccumulator> e : byModel.entrySet()) {
            AxisKey axisKey = e.getKey();
            ProductLabelMatch labelMatch = effectiveProductMatch(axisKey, labelMatches, modelMatches);
            UUID productId = labelMatch.productId();
            GasCategoryAxis priceAxis = axisKey.axis().isKnown()
                    ? axisKey.axis()
                    : productId == null
                            ? GasCategoryAxis.UNKNOWN
                            : legacyPriceAxes.getOrDefault(productId, GasCategoryAxis.UNKNOWN);
            LocalDate priceDate = priceHistoryDate(priceAxis, defaultVariants, asOf);
            ApplicablePrice price = labelMatch.isMatched() && priceDate != null
                    ? pricesByAxis.get(new PriceLookupKey(productId, priceDate)) : null;
            // 재검증 분기용 토큰(미매치 시 정규화 품명 fallback 포함).
            String modelToken = axisKey.modelToken() == null
                    ? ModelTokenExtractor.extractModelToken(axisKey.label()) : axisKey.modelToken();
            // 레거시 GAS 는 완성 세트에 매칭된 부모 세트명으로 옵션 정액 종류를 선택한다.
            // 부모 세트가 해소되지 않는 일반/미매칭 행은 기존 modelToken fallback을 보존한다.
            String optionToken = parentSetNames.getOrDefault(
                    new ParentModelKey(axisKey.partnerCode(), modelToken), modelToken);
            // 고정DC가 없으면 거래처 전역DC 조회 결과를 엔진에 넘긴다. 전역DC 조회 실패도
            // 45%로 숨기지 않고 MISSING_GLOBAL_DISCOUNT 상태로 보존한다. price key 누락도 엔진에 넘겨
            // 일반 품목은 MISSING_REFERENT, 운임/절삭은 레거시처럼 referent 무관 VERIFIED 로 판정한다.
            DiscountRevalidator.Revalidation revalidation = discountRevalidator.revalidate(
                    axisKey.label(),
                    optionToken,
                    e.getValue().effectiveUnitPrice(),
                    price == null ? null : price.release(),
                    price == null ? null : price.delivery(),
                    labelMatch.isMatched() ? fixedRatesByProductId.get(productId) : null,
                    globalDiscountsByPartnerCode.getOrDefault(axisKey.partnerCode(),
                            DiscountRevalidator.GlobalDiscount.unavailable()),
                    labelMatch.status());
            products.add(new DailyProductLine(
                    axisKey.label(),
                    // 표시 전용: 실 모델코드만(운임·서비스 등 미매치는 null→FE '—', 품명 중복 방지).
                    axisKey.modelToken(),
                    axisKey.axis().isKnown() ? axisKey.axis().scheduleKey() : "UNKNOWN",
                    e.getValue().quantity,
                    e.getValue().supplyAmount,
                    e.getValue().effectiveUnitPrice(),
                    revalidation.releasePrice(),
                    revalidation.deliveryPrice(),
                    revalidation.expectedRate(),
                    revalidation.actualRate(),
                    revalidation.discountAmount(),
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

    /** exact snapshot 모델이 있으면 품명 LIKE 결과보다 우선한다. */
    private Map<String, ProductSummary> resolveProductSummaries(java.util.Set<AxisKey> axes) {
        Map<String, ProductSummary> result = new LinkedHashMap<>();
        axes.stream().map(AxisKey::modelToken).filter(java.util.Objects::nonNull).distinct()
                .forEach(model -> {
                    ProductSummary summary = productClient.lookupByModel(model);
                    if (summary != null) {
                        result.put(model, summary);
                    }
                });
        return result;
    }

    /**
     * 레거시 Code.js:590-652와 동일하게 일마감 pool 전체를 세트 후보와 대조한다.
     * 구성품 단건 parentSetModelCode는 후보가 완성되지 않은 경우 사용하지 않는다.
     */
    private Map<ParentModelKey, String> resolveMatchedSetNames(
            Map<AxisKey, ModelAccumulator> byModel,
            Map<String, DiscountRevalidator.GlobalDiscount> globalDiscountsByPartnerCode) {
        List<EstimateComponent> catalog = new ArrayList<>();
        catalog.addAll(productClient.estimateComponents("SINGLE_SET"));
        catalog.addAll(productClient.estimateComponents("COMMERCIAL_MULTI"));
        if (catalog.isEmpty()) {
            return Map.of();
        }
        Map<String, List<EstimateComponent>> grouped = catalog.stream()
                .filter(c -> c.setModelCode() != null && c.componentModelCode() != null)
                .collect(java.util.stream.Collectors.groupingBy(
                        EstimateComponent::setModelCode, LinkedHashMap::new, java.util.stream.Collectors.toList()));
        List<LegacySetMatcher.SetCandidate> candidates = grouped.entrySet().stream()
                .map(e -> new LegacySetMatcher.SetCandidate(e.getKey(), e.getValue().stream()
                        // Code.js pCols[1] = 납품가를 세트 합계의 원천으로 사용한다.
                        .map(c -> new LegacySetMatcher.Component(c.componentModelCode(), c.kind(),
                                c.deliveryPrice() != null ? c.deliveryPrice() : BigDecimal.ZERO))
                        .toList()))
                .toList();
        List<LegacySetMatcher.InvoiceLine> pool = byModel.entrySet().stream()
                .flatMap(e -> expandPool(e.getKey(), e.getValue(), catalog).stream())
                .toList();
        List<LegacySetMatcher.Match> matches = new LegacySetMatcher().findMatches(
                pool, candidates, globalDiscountsByPartnerCode);
        Map<ParentModelKey, String> result = new LinkedHashMap<>();
        for (LegacySetMatcher.Match match : matches) {
            for (Integer index : match.poolIndexes()) {
                LegacySetMatcher.InvoiceLine line = pool.get(index);
                result.putIfAbsent(new ParentModelKey(line.partnerCode(), line.modelToken()), match.setName());
            }
        }
        return result;
    }

    private static List<LegacySetMatcher.InvoiceLine> expandPool(
            AxisKey axis, ModelAccumulator accumulator, List<EstimateComponent> catalog) {
        if (axis.modelToken() == null) {
            return List.of();
        }
        int quantity = accumulator.quantity.signum() == 0
                ? 1 : Math.abs(accumulator.quantity.intValueExact());
        String kind = kindFor(axis.modelToken(), catalog);
        List<LegacySetMatcher.InvoiceLine> expanded = new ArrayList<>(quantity);
        for (int i = 0; i < quantity; i++) {
            expanded.add(new LegacySetMatcher.InvoiceLine(axis.modelToken(), kind,
                    accumulator.effectiveUnitPrice(), axis.partnerCode()));
        }
        return expanded;
    }

    private static String kindFor(String modelToken, List<EstimateComponent> catalog) {
        return catalog.stream().filter(c -> modelToken.equals(c.componentModelCode()))
                .map(EstimateComponent::kind).findFirst().orElse("ACCESSORY");
    }

    private record ParentModelKey(String partnerCode, String modelToken) {}

    private static ProductLabelMatch effectiveProductMatch(
            AxisKey axis, Map<String, ProductLabelMatch> labelMatches,
            Map<String, ProductLabelMatch> modelMatches) {
        ProductLabelMatch byLabel = labelMatches.getOrDefault(axis.label(),
                ProductLabelMatch.notFound());
        if (axis.modelToken() == null) {
            // 비교할 불변 모델 토큰이 없는 legacy snapshot은 기존 라벨 판정을 유지한다.
            // modelCode가 null인 정상 레거시 제품까지 NOT_FOUND로 강등하지 않는다.
            return byLabel;
        }
        ProductLabelMatch byModel = modelMatches.get(axis.modelToken());
        if (byModel != null && byModel.isMatched()
                && axis.modelToken().equals(byModel.modelCode())) {
            return byModel;
        }
        if (byModel != null && byModel.isMatched()) {
            // exact 결과는 존재하지만 불변 modelCode로 snapshot을 증명하지 못한다.
            // 이 경우에는 기존 label 결과(AMBIGUOUS 포함)를 그대로 유지한다.
            return byLabel;
        }
        // 과거 snapshot의 modelName은 변경·재사용될 수 있다. exact 결과에
        // snapshot과 일치하는 불변 modelCode가 없으면 기존 label 해소 결과를 보존한다.
        if (!byLabel.isMatched()) {
            return byLabel;
        }
        return axis.modelToken().equals(byLabel.modelCode()) || byLabel.modelCode() == null
                ? byLabel
                : ProductLabelMatch.notFound();
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

    private Map<PriceLookupKey, ApplicablePrice> loadApplicablePrices(
            java.util.Set<AxisKey> axes,
            Map<String, ProductLabelMatch> labelMatches,
            Map<String, ProductLabelMatch> modelMatches,
            LocalDate asOf,
            Map<String, Boolean> defaultVariants,
            Map<UUID, GasCategoryAxis> legacyPriceAxes) {
        if (axes.isEmpty()) {
            return Map.of();
        }
        Map<LocalDate, LinkedHashSet<UUID>> idsByPriceDate = new LinkedHashMap<>();
        Map<PriceLookupKey, Boolean> requested = new LinkedHashMap<>();
        for (AxisKey axis : axes) {
            ProductLabelMatch match = effectiveProductMatch(axis, labelMatches, modelMatches);
            if (match == null || !match.isMatched()) {
                continue;
            }
            GasCategoryAxis priceAxis = axis.axis().isKnown()
                    ? axis.axis()
                    : legacyPriceAxes.getOrDefault(match.productId(), GasCategoryAxis.UNKNOWN);
            LocalDate priceDate = priceHistoryDate(priceAxis, defaultVariants, asOf);
            // 카테고리/설정이 확인되지 않은 품목은 가격을 조회하지 않는다. null 가격은
            // DiscountRevalidator 가 MISSING_REFERENT 로 표시하여 틀린 단가를 숨긴다.
            if (priceDate != null) {
                PriceLookupKey key = new PriceLookupKey(match.productId(), priceDate);
                requested.put(key, Boolean.TRUE);
                idsByPriceDate.computeIfAbsent(priceDate, ignored -> new LinkedHashSet<>())
                        .add(match.productId());
            }
        }
        Map<PriceLookupKey, ApplicablePrice> result = new LinkedHashMap<>();
        for (Map.Entry<LocalDate, LinkedHashSet<UUID>> entry : idsByPriceDate.entrySet()) {
            for (List<UUID> chunk : chunks(new ArrayList<>(entry.getValue()))) {
                Map<UUID, ApplicablePrice> prices = productClient.applicablePrices(chunk, entry.getKey());
                (prices == null ? Map.<UUID, ApplicablePrice>of() : prices).forEach((productId, price) -> {
                    PriceLookupKey key = new PriceLookupKey(productId, entry.getKey());
                    if (requested.containsKey(key)) {
                        result.put(key, price);
                    }
                });
            }
        }
        return result;
    }

    private static LocalDate priceHistoryDate(GasCategoryAxis axis,
                                               Map<String, Boolean> defaultVariants,
                                               LocalDate asOf) {
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
        private final BigDecimal actualUnitPrice;
        BigDecimal quantity = BigDecimal.ZERO;
        BigDecimal supplyAmount = BigDecimal.ZERO;
        BigDecimal vatAmount = BigDecimal.ZERO;

        private ModelAccumulator(BigDecimal actualUnitPrice) {
            this.actualUnitPrice = actualUnitPrice;
        }

        /**
         * 원천 한 라인에서 보존한 VAT 포함 실제 단가를 반환한다.
         * 동일 축의 서로 다른 실제 단가는 AxisKey 로 분리되므로 합계÷합계수량의 가중평균을
         * 전표 단가로 다시 만들지 않는다.
         */
        BigDecimal effectiveUnitPrice() {
            return actualUnitPrice;
        }
    }

    /** 일마감 집계의 정본 key — 품목명 하나로 다른 판매 카테고리를 합치지 않는다. */
    private record AxisKey(String partnerCode, String label, String modelToken, GasCategoryAxis axis,
                           BigDecimal actualUnitPrice) {
        private AxisKey {
            actualUnitPrice = actualUnitPrice == null
                    ? null : actualUnitPrice.stripTrailingZeros();
        }
    }

    /** 같은 제품이라도 카테고리별 기준일이 다를 수 있어 productId만으로 가격을 캐시하지 않는다. */
    private record PriceLookupKey(UUID productId, LocalDate priceDate) {
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
