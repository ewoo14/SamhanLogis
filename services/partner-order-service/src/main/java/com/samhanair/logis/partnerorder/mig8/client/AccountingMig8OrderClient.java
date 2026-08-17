package com.samhanair.logis.partnerorder.mig8.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.partnerorder.client.OpaqueUuidDecoder;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/** accounting-service {@code GET /internal/accounting/mig8-orders} client. */
@Component
public class AccountingMig8OrderClient {

    private static final Logger log = LoggerFactory.getLogger(AccountingMig8OrderClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String ACCOUNTING_SERVICE_BASE = "http://accounting-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public AccountingMig8OrderClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                                     InternalAuthProperties internalAuthProperties,
                                     ObjectMapper objectMapper) {
        this.restClient = builder.baseUrl(ACCOUNTING_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    public Mig8OrderPage fetchMig8Orders(int page, int size) {
        try {
            String body = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/internal/accounting/mig8-orders")
                            .queryParam("page", Math.max(page, 0))
                            .queryParam("size", Math.max(size, 1))
                            .build())
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .retrieve()
                    .body(String.class);
            return parsePage(body);
        } catch (BusinessException ex) {
            throw ex;
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 401) {
                throw new BusinessException(ErrorCode.UNAUTHORIZED,
                        "accounting-service MIG-8 export 내부 인증 실패", ex);
            }
            if (status == 403) {
                throw new BusinessException(ErrorCode.FORBIDDEN,
                        "accounting-service MIG-8 export 내부 권한 거부", ex);
            }
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "accounting-service MIG-8 export 응답 오류: " + status, ex);
        } catch (RuntimeException ex) {
            log.warn("AccountingMig8OrderClient network fail-fast — page={} size={} msg={}",
                    page, size, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "accounting-service MIG-8 export 호출 실패", ex);
        }
    }

    private Mig8OrderPage parsePage(String body) {
        if (body == null || body.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "accounting-service MIG-8 export 응답이 비어 있습니다");
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            JsonNode content = data.path("content");
            if (!content.isArray()) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "accounting-service MIG-8 export 응답 형식 오류 (content)");
            }
            List<Mig8OrderExport> orders = new ArrayList<>();
            for (JsonNode node : content) {
                orders.add(parseOrder(node));
            }
            boolean last = data.path("last").asBoolean(orders.isEmpty());
            return new Mig8OrderPage(orders, last);
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException | java.io.IOException ex) {
            log.warn("AccountingMig8OrderClient response parse fail-fast — msg={}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "accounting-service MIG-8 export 응답 파싱 실패", ex);
        }
    }

    private Mig8OrderExport parseOrder(JsonNode node) {
        return new Mig8OrderExport(
                text(node, "orderNo"),
                uuid(node, "partnerId"),
                text(node, "partnerName"),
                text(node, "managerName"),
                text(node, "progressStatus"),
                date(node, "validUntil"),
                text(node, "paymentTerms"),
                text(node, "reference"),
                decimal(node, "totalSupplyAmount"),
                decimal(node, "totalVatAmount"),
                text(node, "linkedSlipNo"),
                text(node, "externalRef"),
                parseLines(node.path("lines")));
    }

    private List<Mig8OrderLineExport> parseLines(JsonNode lines) {
        if (!lines.isArray()) {
            return List.of();
        }
        List<Mig8OrderLineExport> result = new ArrayList<>();
        for (JsonNode line : lines) {
            result.add(new Mig8OrderLineExport(
                    line.path("lineNo").asInt(),
                    uuid(line, "productId"),
                    text(line, "itemName"),
                    decimal(line, "quantity"),
                    decimal(line, "unitPrice"),
                    decimal(line, "supplyAmount"),
                    decimal(line, "vatAmount"),
                    date(line, "itemDueDate")));
        }
        return result;
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "samhan.internal-token 미설정");
        }
        return token;
    }

    private static String text(JsonNode node, String key) {
        JsonNode value = node.get(key);
        return value == null || value.isNull() || value.asText().isBlank() ? null : value.asText();
    }

    private static UUID uuid(JsonNode node, String key) {
        String value = text(node, key);
        return value == null ? null : OpaqueUuidDecoder.decode(value);
    }

    private static LocalDate date(JsonNode node, String key) {
        String value = text(node, key);
        return value == null ? null : LocalDate.parse(value);
    }

    private static BigDecimal decimal(JsonNode node, String key) {
        JsonNode value = node.get(key);
        if (value == null || value.isNull() || value.asText().isBlank()) {
            return BigDecimal.ZERO;
        }
        return new BigDecimal(value.asText());
    }
}
