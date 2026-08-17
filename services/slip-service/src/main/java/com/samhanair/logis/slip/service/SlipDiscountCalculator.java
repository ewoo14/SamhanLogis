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

    /** 서버 DC 계산 결과와 클라이언트 제출 단가를 비교한다. */
    public void verifyClientPrices(String partnerCode, List<Line> lines,
                                   Map<String, BigDecimal> clientPrices) {
        DiscountPriceClient.CalculationResult result = client.calculateDetailed(partnerCode, lines);
        if (!result.available()) {
            throw new IllegalStateException("DC 서버 계산 결과를 확인할 수 없습니다.");
        }
        for (Line line : lines) {
            BigDecimal serverPrice = result.prices().get(line.lineId());
            BigDecimal clientPrice = clientPrices == null ? null : clientPrices.get(line.lineId());
            if (serverPrice == null || clientPrice == null || serverPrice.compareTo(clientPrice) != 0) {
                throw new IllegalArgumentException("서버 DC 단가와 클라이언트 단가가 다릅니다: " + line.lineId());
            }
        }
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
