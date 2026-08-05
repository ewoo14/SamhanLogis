package com.samhanair.logis.notification.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** partner-service의 활성 BLOCK 행을 조회하는 운영용 blocked guard. */
@Component
@Profile("!test")
public class RestClientBlockedPartnerLookupClient implements BlockedPartnerLookupClient {

    private static final Logger log = LoggerFactory.getLogger(RestClientBlockedPartnerLookupClient.class);

    private final RestClient.Builder builder;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String internalToken;

    public RestClientBlockedPartnerLookupClient(
            RestClient.Builder builder,
            ObjectMapper objectMapper,
            @Value("${samhan.partner-service.url:http://localhost:8095}") String baseUrl,
            @Value("${app.security.internal.token:}") String internalToken) {
        this.builder = builder;
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl;
        this.internalToken = internalToken;
    }

    @Override
    public boolean isBlocked(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            return false;
        }
        if (internalToken == null || internalToken.isBlank()) {
            throw new IllegalStateException("X-Internal-Token is not configured");
        }
        try {
            String body = builder.baseUrl(baseUrl).build().get()
                    .uri(uriBuilder -> uriBuilder.path("/internal/partners/admin/blocks")
                            .queryParam("page", 0).queryParam("size", 5000).build())
                    .header("X-Internal-Token", internalToken)
                    .retrieve().body(String.class);
            return parseCodes(body).contains(partnerCode);
        } catch (Exception ex) {
            log.warn("blocked partner 조회 실패 partnerCode={}, msg={}", partnerCode, ex.getMessage());
            throw new IllegalStateException("blocked partner lookup failed", ex);
        }
    }

    private Set<String> parseCodes(String body) {
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            JsonNode content = data != null && data.has("content") ? data.get("content") : data;
            Set<String> codes = new HashSet<>();
            if (content != null && content.isArray()) {
                for (JsonNode row : content) {
                    JsonNode code = row.get("partnerCode");
                    if (code != null && !code.isNull() && !code.asText().isBlank()) {
                        codes.add(code.asText());
                    }
                }
            }
            return codes;
        } catch (Exception ex) {
            throw new IllegalStateException("invalid blocked partner response", ex);
        }
    }
}
