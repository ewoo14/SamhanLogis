package com.samhanair.logis.accounting.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
public class ProductAliasClient {

    private static final Logger log = LoggerFactory.getLogger(ProductAliasClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final int RESOLVE_CHUNK_SIZE = 200;

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;
    private final ThreadLocal<LinkedHashSet<UUID>> activeReservations =
            ThreadLocal.withInitial(LinkedHashSet::new);

    public ProductAliasClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                              InternalAuthProperties internalAuthProperties,
                              ObjectMapper objectMapper,
                              @Value("${app.services.product-service.base-url:http://product-service}")
                              String productServiceBaseUrl) {
        this.restClient = builder.baseUrl(productServiceBaseUrl).build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    public Map<String, UUID> resolveAliases(List<String> aliasCodes) {
        UUID reservationToken = UUID.randomUUID();
        activeReservations.get().add(reservationToken);
        return resolveAliases(aliasCodes, reservationToken);
    }

    private Map<String, UUID> resolveAliases(List<String> aliasCodes, UUID reservationToken) {
        LinkedHashSet<String> distinct = normalize(aliasCodes);
        if (distinct.isEmpty()) {
            return Map.of();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw internalAuthMiss(distinct.size(), 0);
        }
        Map<String, UUID> resolved = new LinkedHashMap<>();
        List<String> aliases = new ArrayList<>(distinct);
        for (int start = 0; start < aliases.size(); start += RESOLVE_CHUNK_SIZE) {
            int end = Math.min(start + RESOLVE_CHUNK_SIZE, aliases.size());
            resolved.putAll(resolveChunk(aliases.subList(start, end), token, reservationToken));
        }
        return resolved;
    }

    private Map<String, UUID> resolveChunk(List<String> aliasCodes, String token, UUID reservationToken) {
        try {
            Map<String, Object> request = new LinkedHashMap<>();
            request.put("aliasCodes", aliasCodes);
            if (reservationToken != null) {
                request.put("reservationToken", reservationToken);
            }
            String body = restClient.post()
                    .uri("/products/internal/resolve-ecount-aliases")
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(String.class);
            return parseResolved(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 401 || status == 403) {
                throw internalAuthMiss(aliasCodes.size(), status);
            }
            log.warn("ProductAliasClient resolve failed - aliasCount={}, status={}",
                    aliasCodes.size(), status);
            throw resolverUnavailable(aliasCodes.size(), "status=" + status);
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("ProductAliasClient resolve failed - aliasCount={}, msg={}",
                    aliasCodes.size(), ex.getMessage());
            throw resolverUnavailable(aliasCodes.size(), ex.getMessage());
        }
    }

    /** MIG-8 변환 종료 후 product-service 에 등록한 reservation 을 해제한다. */
    public void releaseReservations() {
        LinkedHashSet<UUID> tokens = activeReservations.get();
        activeReservations.remove();
        for (UUID token : tokens) {
            try {
                restClient.post()
                        .uri("/products/internal/release-ecount-alias-reservations")
                        .header(INTERNAL_TOKEN_HEADER, internalAuthProperties.getToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("reservationToken", token))
                        .retrieve()
                        .toBodilessEntity();
            } catch (Exception ex) {
                // reservation 은 product-service 의 만료시간으로도 정리된다.
                log.warn("ProductAliasClient reservation release failed - token={}, msg={}",
                        token, ex.getMessage());
            }
        }
    }

    private Map<String, UUID> parseResolved(String body) throws java.io.IOException {
        if (body == null || body.isBlank()) {
            return Map.of();
        }
        JsonNode root = objectMapper.readTree(body);
        JsonNode data = root.has("data") ? root.get("data") : root;
        JsonNode resolved = data == null ? null : data.get("resolved");
        if (resolved == null || !resolved.isObject()) {
            return Map.of();
        }
        Map<String, UUID> result = new LinkedHashMap<>();
        resolved.fields().forEachRemaining(entry -> {
            if (entry.getValue() != null && !entry.getValue().isNull()) {
                try {
                    result.put(entry.getKey(), UUID.fromString(entry.getValue().asText()));
                } catch (IllegalArgumentException ex) {
                    log.warn("ProductAliasClient ignored invalid UUID for aliasCode={}", entry.getKey());
                }
            }
        });
        return result;
    }

    private static LinkedHashSet<String> normalize(List<String> aliasCodes) {
        LinkedHashSet<String> distinct = new LinkedHashSet<>();
        if (aliasCodes == null) {
            return distinct;
        }
        for (String aliasCode : aliasCodes) {
            if (aliasCode != null && !aliasCode.isBlank()) {
                distinct.add(aliasCode.trim());
            }
        }
        return distinct;
    }

    private BusinessException internalAuthMiss(int aliasCount, int status) {
        if (status == 0) {
            log.error("ProductAliasClient — X-Internal-Token 미설정 (aliasCount={})", aliasCount);
            return new BusinessException(ErrorCode.MIG12_INTERNAL_AUTH_MISS,
                    "ProductAliasClient 내부 인증 토큰 미설정");
        }
        log.error("ProductAliasClient — aliasCount={} status={} (내부 인증 실패)", aliasCount, status);
        return new BusinessException(ErrorCode.MIG12_INTERNAL_AUTH_MISS,
                "ProductAliasClient 내부 인증 실패: status=" + status);
    }

    private BusinessException resolverUnavailable(int aliasCount, String detail) {
        return new BusinessException(ErrorCode.MIG20_REIMPORT_FAILED,
                "MIG-8 product alias resolver 일시 장애: aliasCount=" + aliasCount + ", " + detail);
    }
}
