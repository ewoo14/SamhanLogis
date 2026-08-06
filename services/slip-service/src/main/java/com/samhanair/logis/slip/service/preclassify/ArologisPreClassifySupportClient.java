package com.samhanair.logis.slip.service.preclassify;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** 아로로지스의 원천 마스터/기존 배차 partnerCode만 읽는다. 분류 계산은 수행하지 않는다. */
@Component
public class ArologisPreClassifySupportClient implements PreClassifySupportClient {
    private final RestClient client;
    private final InternalAuthProperties auth;
    private final ObjectMapper mapper;
    public ArologisPreClassifySupportClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                                            InternalAuthProperties auth, ObjectMapper mapper) {
        this.client = builder.baseUrl("http://arologis-service").requestFactory(requestFactory()).build();
        this.auth = auth;
        this.mapper = mapper;
    }
    @Override
    public PreClassifySupport getSupport(List<String> partnerCodes) {
        try {
            String body = client.get().uri(uri -> uri.path("/internal/arologis/preclassify-support")
                            .queryParam("partnerCodes", String.join(",", partnerCodes)).build())
                    .header("X-Internal-Token", auth.getToken()).retrieve().body(String.class);
            JsonNode data = mapper.readTree(body).get("data");
            var ruleType = mapper.getTypeFactory().constructCollectionType(List.class, RegionRule.class);
            var stringType = mapper.getTypeFactory().constructCollectionType(List.class, String.class);
            return new PreClassifySupport(mapper.convertValue(data.get("regionRules"), ruleType),
                    mapper.convertValue(data.get("plannedPartnerCodes"), stringType));
        } catch (Exception ex) {
            throw new IllegalStateException("아로로지스 가배차 원천 조회 실패", ex);
        }
    }
    private static org.springframework.http.client.SimpleClientHttpRequestFactory requestFactory() {
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        return factory;
    }
}
