package com.samhanair.logis.partnerauth.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.samhanair.logis.partnerauth.config.PartnerActivityClientProperties;
import com.samhanair.logis.partnerauth.service.PartnerActivity;
import com.samhanair.logis.partnerauth.service.PartnerActivityReader;
import java.time.LocalDateTime;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** 주문·출고 소유 서비스에서 장기미발주 판정용 시각만 읽는 내부 클라이언트. */
@Component
public class PartnerActivityClient implements PartnerActivityReader {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private final RestClient orderClient;
    private final RestClient slipClient;
    private final PartnerActivityClientProperties properties;

    public PartnerActivityClient(PartnerActivityClientProperties properties) {
        this.properties = properties;
        this.orderClient = RestClient.builder().baseUrl(properties.getOrderUrl()).build();
        this.slipClient = RestClient.builder().baseUrl(properties.getSlipUrl()).build();
    }

    /** 주문 확정 시각과 출고 일자를 모두 읽어 하나의 활동 snapshot으로 합친다. */
    @Override
    public PartnerActivity read(String partnerCode) {
        return read(partnerCode, null);
    }

    /** 사업자번호 조회 후 legacy partner_code fallback을 각 소유 서비스에 전달한다. */
    @Override
    public PartnerActivity read(String businessNumber, String legacyPartnerCode) {
        LookupResult order = get(orderClient, businessNumber, legacyPartnerCode);
        LookupResult shipment = get(slipClient, businessNumber, legacyPartnerCode);
        return new PartnerActivity(
                order.data() == null ? null : order.data().lastActivityAt(),
                shipment.data() == null ? null : shipment.data().lastActivityAt(),
                order.succeeded(),
                shipment.succeeded());
    }

    private LookupResult get(RestClient client, String businessNumber, String legacyPartnerCode) {
        try {
            ActivityEnvelope response = client.get()
                    .uri(uriBuilder -> {
                        var builder = uriBuilder.path("/internal/partner-activity/{businessNumber}");
                        if (legacyPartnerCode != null && !legacyPartnerCode.isBlank()
                                && !legacyPartnerCode.equals(businessNumber)) {
                            builder.queryParam("legacyPartnerCode", legacyPartnerCode);
                        }
                        return builder.build(businessNumber);
                    })
                    .header(INTERNAL_TOKEN_HEADER, properties.getInternalToken() == null ? "" : properties.getInternalToken())
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {});
            return response == null
                    ? new LookupResult(new ActivityEnvelope(null), false)
                    : new LookupResult(response, true);
        } catch (RestClientException ex) {
            return new LookupResult(new ActivityEnvelope(null), false);
        }
    }

    private record LookupResult(ActivityEnvelope envelope, boolean succeeded) {
        ActivityData data() {
            return envelope.data();
        }
    }

    /** 내부 활동 endpoint 응답 봉투. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ActivityEnvelope(ActivityData data) {}

    /** 주문 또는 출고 서비스가 반환하는 마지막 업무 시각. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ActivityData(LocalDateTime lastActivityAt) {}
}
