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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
        Map<UUID, ProductSummary> products = lookupProducts(slips);
        Map<UUID, MutableRow> rows = new LinkedHashMap<>();
        for (Slip slip : slips) {
            if (!isConfirmed(slip)) continue;
            for (SlipLine line : slip.getLines()) {
                MutableRow row = rows.computeIfAbsent(line.getProductId(), id ->
                        new MutableRow(line.getModelName(), line.getProductName(), products.get(id)));
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
            }
        }
        return rows.values().stream().map(MutableRow::toResponse).toList();
    }

    private Map<UUID, ProductSummary> lookupProducts(List<Slip> slips) {
        List<UUID> ids = slips.stream().flatMap(s -> s.getLines().stream())
                .map(SlipLine::getProductId).distinct().toList();
        Map<UUID, ProductSummary> result = new HashMap<>();
        if (ids.isEmpty()) {
            return result;
        }
        for (int start = 0; start < ids.size(); start += 100) {
            List<UUID> chunk = ids.subList(start, Math.min(start + 100, ids.size()));
            productClient.lookup(chunk).forEach(p -> result.put(p.id(), p));
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
        private final ProductSummary product;
        private int inboundQuantity;
        private int outboundQuantity;
        private BigDecimal purchaseAmount;
        private BigDecimal salesAmount = BigDecimal.ZERO;

        private MutableRow(String lineModelCode, String productName, ProductSummary product) {
            this.lineModelCode = lineModelCode;
            this.productName = productName;
            this.product = product;
        }

        private InOutAnalysisResponse toResponse() {
            BigDecimal profit = purchaseAmount == null ? null : salesAmount.subtract(purchaseAmount);
            BigDecimal rate = purchaseAmount == null || purchaseAmount.signum() == 0 ? null
                    : profit.multiply(BigDecimal.valueOf(100)).divide(purchaseAmount, 2, RoundingMode.HALF_UP);
            String code = product != null && product.modelCode() != null ? product.modelCode() : lineModelCode;
            String name = product != null && product.name() != null ? product.name() : productName;
            return new InOutAnalysisResponse(code, name, product == null ? null : product.categoryKey(),
                    inboundQuantity, outboundQuantity, purchaseAmount, salesAmount, profit, rate);
        }
    }
}
