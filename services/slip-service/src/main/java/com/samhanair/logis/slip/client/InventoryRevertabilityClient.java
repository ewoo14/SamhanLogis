package com.samhanair.logis.slip.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** inventory 연결 증거만 읽는 preflight client. mutation endpoint를 호출하지 않는다. */
@Component
public class InventoryRevertabilityClient {
    private static final String TOKEN = "X-Internal-Token";
    private final RestClient restClient;
    private final InternalAuthProperties auth;
    private final ObjectMapper objectMapper;

    public InventoryRevertabilityClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                                        InternalAuthProperties auth, ObjectMapper objectMapper) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        this.restClient = builder.baseUrl("http://inventory-service").requestFactory(factory).build();
        this.auth = auth;
        this.objectMapper = objectMapper;
    }

    public Evidence read(UUID slipId, String slipNo) {
        String body = restClient.get().uri(uri -> uri.path("/internal/inventory/revertability")
                        .queryParam("slipId", slipId).queryParam("slipNo", slipNo).build())
                .header(TOKEN, auth.getToken()).retrieve().body(String.class);
        try {
            JsonNode data = objectMapper.readTree(body).path("data");
            return new Evidence(data.path("inventoryResultCount").asLong(), data.path("sourceJournalCount").asLong());
        } catch (Exception ex) {
            throw new IllegalStateException("재고 되돌림 판정 증거 응답을 해석할 수 없습니다.", ex);
        }
    }

    public record Evidence(long inventoryResultCount, long sourceJournalCount) { }
}
