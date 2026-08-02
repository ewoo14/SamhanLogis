package com.samhanair.logis.notification.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** slip-service의 실 출고전표 endpoint를 호출하는 운영용 client. */
@Component
@Profile("!test")
public class RestClientSlipServiceClient implements SlipServiceClient {

    private static final Logger log = LoggerFactory.getLogger(RestClientSlipServiceClient.class);

    private final RestClient.Builder builder;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String internalToken;

    public RestClientSlipServiceClient(
            RestClient.Builder builder,
            ObjectMapper objectMapper,
            @Value("${samhan.slip-service.url:http://localhost:8084}") String baseUrl,
            @Value("${app.security.internal.token:}") String internalToken) {
        this.builder = builder;
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl;
        this.internalToken = internalToken;
    }

    @Override
    public List<OutboundSlipDto> getOutboundSlips(LocalDate from, LocalDate to) {
        if (internalToken == null || internalToken.isBlank()) {
            throw new IllegalStateException("X-Internal-Token is not configured");
        }
        try {
            String body = builder.baseUrl(baseUrl).build().get()
                    .uri(uriBuilder -> uriBuilder.path("/internal/slips/outbound")
                            .queryParam("from", from)
                            .queryParam("to", to)
                            .build())
                    .header("X-Internal-Token", internalToken)
                    .retrieve()
                    .body(String.class);
            return parse(body);
        } catch (Exception ex) {
            log.warn("slip-service outbound 조회 실패 from={}, to={}, msg={}", from, to, ex.getMessage());
            throw new IllegalStateException("/internal/slips/outbound lookup failed", ex);
        }
    }

    private List<OutboundSlipDto> parse(String body) {
        if (body == null || body.isBlank()) {
            return Collections.emptyList();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || !data.isArray()) {
                throw new IllegalStateException("invalid outbound slip response data");
            }
            List<OutboundSlipDto> result = new ArrayList<>(data.size());
            for (JsonNode node : data) {
                List<OutboundSlipDto.OutboundSlipLineDto> lines = new ArrayList<>();
                JsonNode lineNodes = node.path("lines");
                if (lineNodes.isArray()) {
                    for (JsonNode line : lineNodes) {
                        lines.add(new OutboundSlipDto.OutboundSlipLineDto(
                                text(line, "productName"), line.path("quantity").asInt()));
                    }
                }
                result.add(new OutboundSlipDto(
                        text(node, "slipNo"), text(node, "partnerCode"), text(node, "partnerName"),
                        date(node, "slipDate"), dateTime(node, "scheduledAt"),
                        text(node, "deliveryAddress"), lines, text(node, "recipientPhone")));
            }
            return result;
        } catch (IllegalStateException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException("invalid outbound slip response", ex);
        }
    }

    private String text(JsonNode node, String name) {
        JsonNode value = node.get(name);
        return value == null || value.isNull() ? null : value.asText();
    }

    private LocalDate date(JsonNode node, String name) {
        String value = text(node, name);
        return value == null ? null : LocalDate.parse(value);
    }

    private LocalDateTime dateTime(JsonNode node, String name) {
        String value = text(node, name);
        return value == null ? null : LocalDateTime.parse(value);
    }
}
