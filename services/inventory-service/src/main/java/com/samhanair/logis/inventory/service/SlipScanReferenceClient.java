package com.samhanair.logis.inventory.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

/** slip-service의 내부 QR 전표 참조 계약을 호출하는 inventory-side resolver. */
@Slf4j
@Component
public class SlipScanReferenceClient implements SlipScanReferenceResolver {

    private final RestClient restClient;
    private final InternalAuthProperties authProperties;
    private final ObjectMapper objectMapper;
    private final ProductClient productClient;

    public SlipScanReferenceClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                                   InternalAuthProperties authProperties, ObjectMapper objectMapper,
                                   ProductClient productClient) {
        this.restClient = builder.baseUrl("http://slip-service").build();
        this.authProperties = authProperties;
        this.objectMapper = objectMapper;
        this.productClient = productClient;
    }

    /** slipNo를 내부 전표 참조로 해석하고 product id를 품목코드로 변환한다. */
    /** 방향을 포함해 slip-service 참조를 해석한다. */
    @Override
    public SlipScanReference resolve(String slipNo, StockScanDirection direction) {
        Map<String, Object> envelope;
        String uri = UriComponentsBuilder.fromPath("/internal/slips/scan-reference")
                .queryParam("slipNo", slipNo)
                .queryParam("direction", direction.name())
                .build().toUriString();
        try {
            envelope = restClient.get().uri(uri)
                    .header("X-Internal-Token", requireToken())
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다: " + slipNo);
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR, "전표 서비스 호출에 실패했습니다");
                    })
                    .body(new ParameterizedTypeReference<>() {});
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("QR scan slip reference lookup failed: slipNo={}", slipNo, ex);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "전표 서비스 호출에 실패했습니다", ex);
        }
        try {
            Object data = envelope == null ? null : envelope.get("data");
            Map<String, Object> row = objectMapper.convertValue(data, new com.fasterxml.jackson.core.type.TypeReference<>() {});
            UUID slipId = UUID.fromString(String.valueOf(row.get("slipId")));
            String actualSlipNo = String.valueOf(row.get("slipNo"));
            String partnerCode = row.get("partnerCode") == null ? null : String.valueOf(row.get("partnerCode"));
            List<?> rawIds = objectMapper.convertValue(row.get("productIds"), List.class);
            List<String> productCodes = rawIds.stream().map(String::valueOf)
                    .map(UUID::fromString).map(productClient::requireExists)
                    .map(ProductSummary::productCode).toList();
            return new SlipScanReference(slipId, actualSlipNo, direction, partnerCode,
                    java.util.Set.copyOf(productCodes));
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "전표 참조 응답이 올바르지 않습니다", ex);
        }
    }

    private String requireToken() {
        String token = authProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "app.security.internal.token 미설정");
        }
        return token;
    }
}
