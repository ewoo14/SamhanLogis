package com.samhanair.logis.slip.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** product-service price_history 적용 출고가 조회 client. */
@Component
@RequiredArgsConstructor
public class ProductPriceHistoryClient {
    private final @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder;
    private final InternalAuthProperties auth;
    private final ObjectMapper mapper;

    public Optional<ApplicablePrice> applicable(UUID productId, LocalDate asOf) {
        if (productId == null || asOf == null || auth.getToken() == null || auth.getToken().isBlank()) {
            return Optional.empty();
        }
        try {
            String body = builder.clone().baseUrl("http://product-service").build().get()
                    .uri(uri -> uri.path("/products/internal/price-history/applicable")
                            .queryParam("productId", productId)
                            .queryParam("asOf", asOf)
                            .build())
                    .header("X-Internal-Token", auth.getToken())
                    .retrieve().body(String.class);
            JsonNode data = mapper.readTree(body).path("data");
            if (!data.path("release").isNumber()) return Optional.empty();
            List<String> categories = new java.util.ArrayList<>();
            data.path("estimateCategories").forEach(node -> categories.add(node.asText()));
            return Optional.of(new ApplicablePrice(data.path("release").decimalValue(),
                    data.path("delivery").isNumber() ? data.path("delivery").decimalValue() : null,
                    categories));
        } catch (RuntimeException | java.io.IOException ex) {
            return Optional.empty();
        }
    }

    public record ApplicablePrice(BigDecimal release, BigDecimal delivery, List<String> estimateCategories) {}
}
