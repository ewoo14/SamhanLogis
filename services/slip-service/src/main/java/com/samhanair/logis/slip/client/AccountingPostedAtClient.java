package com.samhanair.logis.slip.client;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** accounting allocation을 통해 원천 출고전표의 posted_at을 읽는 client. */
@Component
@RequiredArgsConstructor
public class AccountingPostedAtClient {
    private final @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder;
    private final InternalAuthProperties auth;
    private final ObjectMapper mapper;

    public LocalDateTime find(String slipNo) {
        if (slipNo == null || slipNo.isBlank() || auth.getToken() == null || auth.getToken().isBlank()) return null;
        try {
            String body = builder.clone().baseUrl("http://accounting-service").build().get()
                    .uri(uri -> uri.path("/internal/sales-accounting-slips/posted-at")
                            .queryParam("sourceSlipNo", slipNo).build())
                    .header("X-Internal-Token", auth.getToken())
                    .retrieve().body(String.class);
            Map<String, String> data = mapper.readValue(mapper.readTree(body).path("data").toString(),
                    new TypeReference<>() {});
            String value = data.get(slipNo);
            return value == null ? null : LocalDateTime.parse(value);
        } catch (RuntimeException | java.io.IOException ex) {
            return null;
        }
    }
}
