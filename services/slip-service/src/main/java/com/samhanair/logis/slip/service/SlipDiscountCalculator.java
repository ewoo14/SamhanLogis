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

    public Calculation calculateDetailed(String partnerCode, List<Line> lines) {
        DiscountPriceClient.CalculationResult result = client.calculateDetailed(partnerCode, lines);
        String info;
        if (!result.available()) {
            info = "DC 미적용: 가격계산 조회 실패, 입력 단가로 저장";
        } else if (result.appliedRates().isEmpty()) {
            info = "DC 없음: 정가 저장";
        } else {
            info = result.appliedRates().entrySet().stream()
                    .map(entry -> {
                        Line line = lines.stream().filter(candidate -> candidate.lineId().equals(entry.getKey()))
                                .findFirst().orElse(null);
                        String source = line != null && line.fixedDiscountRate() != null ? "고정DC" : "전역DC";
                        return source + " " + entry.getValue().stripTrailingZeros().toPlainString() + "%";
                    })
                    .distinct()
                    .collect(java.util.stream.Collectors.joining(", ", "DC 적용: ", ""));
        }
        return new Calculation(lines.stream()
                .map(line -> result.prices().getOrDefault(line.lineId(), line.listPrice()))
                .toList(), info);
    }

    public record Line(String lineId, String category, BigDecimal listPrice,
                       BigDecimal fixedDiscountRate, int quantity) {
        public boolean hasVariableDiscount() {
            return fixedDiscountRate == null;
        }

        public String modelCode() {
            return lineId;
        }
    }

    public record Calculation(List<BigDecimal> prices, String discountInfo) {
    }
}
