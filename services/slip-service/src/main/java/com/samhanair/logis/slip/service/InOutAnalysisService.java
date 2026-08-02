package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.InOutAnalysisResponse;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.TreeMap;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 확정 입출고 전표를 모델코드별로 집계하고 매입·판매 차액 이익률을 계산한다. */
@Service
@RequiredArgsConstructor
public class InOutAnalysisService {
    private final SlipRepository slipRepository;
    private final ProductClient productClient;

    /** 기간 내 확정 입출고를 조회한다. 원가 없는 판매 품목도 결과에서 제외하지 않는다. */
    @Transactional(readOnly = true)
    public List<InOutAnalysisResponse> list(LocalDate from, LocalDate to) {
        List<Slip> slips = new ArrayList<>();
        slips.addAll(slipRepository.findByPeriodWithLines(SlipType.INBOUND, from, to, null));
        slips.addAll(slipRepository.findByPeriodWithLines(SlipType.OUTBOUND, from, to, null));
        Map<String, ProductSummary> products = lookupProducts(slips);
        Map<String, MutableRow> rows = new LinkedHashMap<>();
        for (Slip slip : slips) {
            if (!isConfirmed(slip)) continue;
            for (SlipLine line : slip.getLines()) {
                String modelCode = line.getModelName();
                MutableRow row = rows.computeIfAbsent(modelCode, id ->
                        new MutableRow(modelCode, line.getProductName(), line.getCategoryKey(), products.get(id)));
                BigDecimal amount = line.getSupplyAmount() != null
                        ? line.getSupplyAmount()
                        : line.getUnitPrice().multiply(BigDecimal.valueOf(line.getQuantity()));
                if (slip.getSlipType() == SlipType.INBOUND) {
                    row.inboundQuantity += line.getQuantity();
                    row.purchaseAmount = add(row.purchaseAmount, amount);
                } else {
                    row.outboundQuantity += line.getQuantity();
                    row.salesAmount = add(row.salesAmount, amount);
                }
                row.addMonthly(slip.getSlipDate(), slip.getSlipType() == SlipType.INBOUND, line.getQuantity());
            }
        }
        return rows.values().stream().map(MutableRow::toResponse).toList();
    }

    private Map<String, ProductSummary> lookupProducts(List<Slip> slips) {
        List<String> modelNames = slips.stream().flatMap(s -> s.getLines().stream())
                .map(SlipLine::getModelName)
                .filter(name -> name != null && !name.isBlank())
                .map(String::trim).distinct().toList();
        Map<String, ProductSummary> result = new HashMap<>();
        if (modelNames.isEmpty()) {
            return result;
        }
        for (int start = 0; start < modelNames.size(); start += 100) {
            List<String> chunk = modelNames.subList(start, Math.min(start + 100, modelNames.size()));
            productClient.lookupByModelNames(chunk).forEach(p -> result.put(p.modelName(), p));
        }
        return result;
    }

    private static boolean isConfirmed(Slip slip) {
        return slip.getStatus() == SlipStatus.CONFIRMED
                || slip.getStatus() == SlipStatus.DELIVERED
                || slip.getStatus() == SlipStatus.COMPLETED;
    }

    private static BigDecimal add(BigDecimal a, BigDecimal b) {
        return (a == null ? BigDecimal.ZERO : a).add(b);
    }

    private static final class MutableRow {
        private final String lineModelCode;
        private final String productName;
        private final String lineCategoryKey;
        private final ProductSummary product;
        private int inboundQuantity;
        private int outboundQuantity;
        private BigDecimal purchaseAmount;
        private BigDecimal salesAmount = BigDecimal.ZERO;
        private final Map<YearMonth, MonthlyMutable> monthly = new TreeMap<>();

        private MutableRow(String lineModelCode, String productName, String lineCategoryKey, ProductSummary product) {
            this.lineModelCode = lineModelCode;
            this.productName = productName;
            this.lineCategoryKey = lineCategoryKey;
            this.product = product;
        }

        private InOutAnalysisResponse toResponse() {
            BigDecimal purchaseUnit = purchaseAmount == null || inboundQuantity == 0 ? null
                    : purchaseAmount.divide(BigDecimal.valueOf(inboundQuantity), 2, RoundingMode.HALF_UP);
            BigDecimal salesUnit = outboundQuantity == 0 ? null
                    : salesAmount.divide(BigDecimal.valueOf(outboundQuantity), 2, RoundingMode.HALF_UP);
            BigDecimal unitProfit = purchaseUnit == null || salesUnit == null ? null : salesUnit.subtract(purchaseUnit);
            BigDecimal profit = unitProfit == null ? null : unitProfit.multiply(BigDecimal.valueOf(outboundQuantity));
            BigDecimal rate = purchaseUnit == null || purchaseUnit.signum() == 0 || salesUnit == null ? null
                    : unitProfit.multiply(BigDecimal.valueOf(100)).divide(purchaseUnit, 2, RoundingMode.HALF_UP);
            String code = product != null && product.modelCode() != null ? product.modelCode() : lineModelCode;
            String name = product != null && product.name() != null ? product.name() : productName;
            String categoryKey = product != null && product.categoryKey() != null
                    ? product.categoryKey() : lineCategoryKey;
            return new InOutAnalysisResponse(code, name, categoryKey,
                    inboundQuantity, outboundQuantity, purchaseAmount, salesAmount, profit, rate,
                    monthly.entrySet().stream()
                            .map(entry -> new InOutAnalysisResponse.MonthlyPoint(
                                    entry.getKey().getYear(), entry.getKey().getMonthValue(),
                                    entry.getValue().inboundQuantity, entry.getValue().outboundQuantity))
                            .toList());
        }

        private void addMonthly(LocalDate date, boolean inbound, int quantity) {
            MonthlyMutable point = monthly.computeIfAbsent(YearMonth.from(date), ignored -> new MonthlyMutable());
            if (inbound) point.inboundQuantity += quantity;
            else point.outboundQuantity += quantity;
        }

        private static final class MonthlyMutable {
            private int inboundQuantity;
            private int outboundQuantity;
        }
    }
}
