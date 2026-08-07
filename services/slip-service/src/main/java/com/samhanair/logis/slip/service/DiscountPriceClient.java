package com.samhanair.logis.slip.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.discount.LegacyModelFlags;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** 전표 저장용 dc-config-service 가격계산 RPC. 실패 시 빈 결과로 저장을 계속한다. */
@Component
@Slf4j
public class DiscountPriceClient {
    private static final String TOKEN_HEADER = "X-Internal-Token";
    private final RestClient restClient;
    private final InternalAuthProperties authProperties;

    public DiscountPriceClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                               InternalAuthProperties authProperties) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        this.restClient = builder.clone().baseUrl("http://dc-config-service")
                .requestFactory(factory).build();
        this.authProperties = authProperties;
    }

    /** lineId → DC 적용 단가. 미설정/장애/응답 결측은 빈 Map으로 반환한다. */
    public Map<String, BigDecimal> calculatePrices(String partnerCode,
                                                    List<SlipDiscountCalculator.Line> lines) {
        return calculateDetailed(partnerCode, lines).prices();
    }

    /** 계산 단가와 적용율을 함께 반환한다. UUID/내부 식별자는 설명에 포함하지 않는다. */
    public CalculationResult calculateDetailed(String partnerCode,
                                               List<SlipDiscountCalculator.Line> lines) {
        if (partnerCode == null || partnerCode.isBlank() || lines == null || lines.isEmpty()) {
            return new CalculationResult(Map.of(), Map.of(), false);
        }
        String token = authProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("전표 DC 계산 생략: internal token 미설정 (partnerCode={})", partnerCode);
            return new CalculationResult(Map.of(), Map.of(), false);
        }
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("partnerCode", partnerCode);
            body.put("callerService", "slip-service");
            body.put("lines", lines.stream().map(DiscountPriceClient::toRequestLine).toList());
            ApiResponse<PriceResult> response = restClient.post()
                    .uri("/internal/price-calculations")
                    .header(TOKEN_HEADER, token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(new ParameterizedTypeReference<ApiResponse<PriceResult>>() {});
            if (response == null || !response.isSuccess() || response.getData() == null
                    || response.getData().lines() == null) {
                return new CalculationResult(Map.of(), Map.of(), false);
            }
            Map<String, BigDecimal> prices = new HashMap<>();
            Map<String, BigDecimal> rates = new HashMap<>();
            for (PriceResult.Line line : response.getData().lines()) {
                if (line.lineId() != null && line.finalPrice() != null) {
                    prices.put(line.lineId(), line.finalPrice());
                    if (line.appliedRate() != null) rates.put(line.lineId(), line.appliedRate());
                }
            }
            return new CalculationResult(prices, rates, true);
        } catch (RuntimeException ex) {
            log.warn("전표 DC 계산 실패 — 정가 저장으로 계속합니다 (partnerCode={}, reason={})",
                    partnerCode, ex.getMessage());
            return new CalculationResult(Map.of(), Map.of(), false);
        }
    }

    static Map<String, Object> toRequestLine(SlipDiscountCalculator.Line line) {
        Map<String, Object> item = new HashMap<>();
        item.put("lineId", line.lineId());
        item.put("modelCode", line.modelCode());
        item.put("listPrice", line.listPrice());
        item.put("category", line.category());
        item.put("quantity", line.quantity());
        item.put("fixedDiscountRate", line.fixedDiscountRate());
        // 수기 출고전표의 고정DC 미설정 품목은 거래처 전역DC 적용 대상이다.
        item.put("hasVariableDiscount", line.hasVariableDiscount());
        LegacyModelFlags flags = LegacyModelFlags.from(line.modelCode());
        item.put("is360", flags.is360());
        item.put("is4Way", flags.is4Way());
        item.put("is1Way", flags.is1Way());
        item.put("isStand", flags.isStand());
        item.put("isDeluxe", flags.isDeluxe());
        item.put("isFirstGrade", flags.isFirstGrade());
        return item;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record PriceResult(List<Line> lines) {
        @JsonIgnoreProperties(ignoreUnknown = true)
        record Line(String lineId, BigDecimal finalPrice, BigDecimal appliedRate) {}
    }

    public record CalculationResult(Map<String, BigDecimal> prices,
                                    Map<String, BigDecimal> appliedRates,
                                    boolean available) {}
}
