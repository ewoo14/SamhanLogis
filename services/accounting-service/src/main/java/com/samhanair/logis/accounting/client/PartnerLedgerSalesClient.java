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
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** slip-service의 거래처별 원장 판매전표 read 계약 소비자. */
@Component
public class PartnerLedgerSalesClient {
    private final RestClient restClient;
    private final InternalAuthProperties auth;

    public PartnerLedgerSalesClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                                    InternalAuthProperties auth) {
        this.restClient = builder.baseUrl("http://slip-service").build();
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

    public record ApiResponse<T>(boolean success, T data) { }
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Sale(String slipNo, LocalDate slipDate, String status, String partnerCode,
                       String partnerName, String deliveryAddress, List<Line> lines) { }
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Line(String productName, String modelName, int quantity,
                       BigDecimal unitPriceWithVat, BigDecimal lineAmount) { }
}
