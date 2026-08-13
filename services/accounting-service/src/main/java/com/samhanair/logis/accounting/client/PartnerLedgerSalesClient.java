package com.samhanair.logis.accounting.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** slip-service의 거래처별 원장 판매전표 read 계약 소비자. */
@Component
public class PartnerLedgerSalesClient {
    private final RestClient restClient;
    private final InternalAuthProperties auth;

    public PartnerLedgerSalesClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                                    InternalAuthProperties auth,
                                    @Value("${app.services.slip-service.base-url:http://slip-service}")
                                    String slipServiceBaseUrl) {
        RestClient.Builder resolvedBuilder = slipServiceBaseUrl.startsWith("http://localhost:")
                || slipServiceBaseUrl.startsWith("http://127.0.0.1:")
                ? RestClient.builder()
                : builder;
        this.restClient = resolvedBuilder.baseUrl(slipServiceBaseUrl).build();
        this.auth = auth;
    }

    public List<Sale> find(LocalDate from, LocalDate to, String partnerCode, UUID partnerId) {
        try {
            return restClient.get()
                    .uri(uri -> uri.path("/internal/slips/partner-ledger-sales")
                            .queryParam("from", from).queryParam("to", to)
                            .queryParamIfPresent("partnerCode", java.util.Optional.ofNullable(partnerCode))
                            .queryParamIfPresent("partnerId", java.util.Optional.ofNullable(partnerId))
                            .build())
                    .header("X-Internal-Token", auth.getToken())
                    .retrieve()
                    .body(new ParameterizedTypeReference<ApiResponse<List<Sale>>>() {})
                    .data();
        } catch (RuntimeException ex) {
            throw new BusinessException(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE,
                    "판매전표 원장 조회에 실패했습니다", ex);
        }
    }

    /** 저장 직후 판매전표를 상태와 무관하게 원장 대상 projection으로 조회한다. */
    public Sale findBySlipNo(String slipNo) {
        try {
            return restClient.get()
                    .uri(uri -> uri.path("/internal/slips/partner-ledger-sales/by-slip-no")
                            .queryParam("slipNo", slipNo)
                            .build())
                    .header("X-Internal-Token", auth.getToken())
                    .retrieve()
                    .body(new ParameterizedTypeReference<ApiResponse<Sale>>() {})
                    .data();
        } catch (RuntimeException ex) {
            throw new BusinessException(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE,
                    "저장 대상 판매전표 원장 조회에 실패했습니다", ex);
        }
    }

    public record ApiResponse<T>(boolean success, T data) { }
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Sale(String slipNo, LocalDate slipDate, String status, String partnerCode,
                       UUID partnerId, String partnerName, String businessNumber,
                       String deliveryAddress, List<Line> lines) {
        public Sale(String slipNo, LocalDate slipDate, String status, String partnerCode,
                    String partnerName, String businessNumber, String deliveryAddress, List<Line> lines) {
            this(slipNo, slipDate, status, partnerCode, null, partnerName, businessNumber,
                    deliveryAddress, lines);
        }

        public Sale(String slipNo, LocalDate slipDate, String status, String partnerCode,
                    String partnerName, String deliveryAddress, List<Line> lines) {
            this(slipNo, slipDate, status, partnerCode, null, partnerName, null, deliveryAddress, lines);
        }
    }
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Line(String productName, String modelName, int quantity,
                       BigDecimal unitPriceWithVat, BigDecimal lineAmount) { }
}
