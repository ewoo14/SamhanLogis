package com.samhanair.logis.slip.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** 전표 라인별 DC 단가를 계산하고, 계산 누락 라인은 입력 정가를 보존한다. */
public class SlipDiscountCalculator {
    private final DiscountPriceClient client;

    public SlipDiscountCalculator(DiscountPriceClient client) {
        this.client = client;
    }

    public List<BigDecimal> calculate(String partnerCode, List<Line> lines) {
        Map<String, BigDecimal> calculated = client.calculatePrices(partnerCode, lines);
        return lines.stream().map(line -> calculated.getOrDefault(line.lineId(), line.listPrice())).toList();
    }

    public record Line(String lineId, String category, BigDecimal listPrice,
                       BigDecimal fixedDiscountRate, int quantity) {
        public String modelCode() {
            return lineId;
        }
    }
}
