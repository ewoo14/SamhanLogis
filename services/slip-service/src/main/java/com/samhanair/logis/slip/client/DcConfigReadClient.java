package com.samhanair.logis.slip.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** dc-config 정본을 읽어 레거시 DC조건 설명 문자열로 만드는 client. */
@Component
@RequiredArgsConstructor
public class DcConfigReadClient {
    private final @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder;
    private final InternalAuthProperties auth;
    private final ObjectMapper mapper;

    public Optional<String> condition(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank() || auth.getToken() == null || auth.getToken().isBlank()) {
            return Optional.empty();
        }
        try {
            String body = builder.clone().baseUrl("http://dc-config-service").build().get()
                    .uri("/internal/partner-dc-configs/{partnerCode}", partnerCode)
                    .header("X-Internal-Token", auth.getToken())
                    .retrieve().body(String.class);
            return Optional.ofNullable(format(mapper.readTree(body).path("data")));
        } catch (RuntimeException | java.io.IOException ex) {
            return Optional.empty();
        }
    }

    private static String format(JsonNode data) {
        if (data == null || data.isMissingNode() || data.isNull()) return null;
        List<String> parts = new ArrayList<>();
        percent(parts, "홈", data.path("homeDiscountRate"));
        percent(parts, "상업", data.path("commercialDiscountRate"));
        if (data.path("showIHose").asBoolean(false)) parts.add("유연호스 I형");
        amount(parts, "360", data.path("discount360Amount"));
        amount(parts, "4way", data.path("discount4WayAmount"));
        amount(parts, "1way", data.path("discount1WayAmount"));
        amount(parts, "스탠드", data.path("discountStandAmount"));
        amount(parts, "디럭스", data.path("discountDeluxeAmount"));
        amount(parts, "1등급", data.path("discountFirstGradeAmount"));
        if (data.path("unitProcessingEnabled").asBoolean(false)) parts.add("단위처리");
        if (data.path("note").isTextual() && !data.path("note").asText().isBlank()) {
            parts.add(data.path("note").asText());
        }
        return parts.isEmpty() ? null : String.join(" / ", parts);
    }

    private static void percent(List<String> parts, String label, JsonNode value) {
        if (value != null && value.isNumber()) {
            parts.add(label + value.decimalValue().multiply(BigDecimal.valueOf(100)).stripTrailingZeros().toPlainString() + "%");
        }
    }

    private static void amount(List<String> parts, String label, JsonNode value) {
        if (value != null && value.isNumber() && value.decimalValue().signum() != 0) {
            parts.add(label + " -" + value.decimalValue().stripTrailingZeros().toPlainString());
        }
    }
}
