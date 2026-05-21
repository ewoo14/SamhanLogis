package com.samhanair.logis.accounting.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * partner-service internal endpoint 호출 client (PR-E2 BE-A8/A9/A10 의존).
 *
 * <p>{@code GET /internal/partners/{partnerCode}} 호출 → PartnerSummary 반환.
 * notification-service 의 {@code RestClientPartnerLookupClient} 를 답습하되,
 * V32(MIG-12) 이후 401/403 응답은 fail-fast ({@code MIG12_INTERNAL_AUTH_MISS})로 격상한다.
 * 404 / 5xx / 네트워크 오류는 empty 반환 (caller 가 fallback 처리).
 *
 * <p>인증 = X-Internal-Token (env {@code SAMHAN_INTERNAL_TOKEN}).
 *
 * <p>본 client 는 IT 에서 {@code @MockBean} 격리 의무 (memory feedback_it_mockbean_external_clients).
 */
@Component
public class PartnerLookupClient {

    private static final Logger log = LoggerFactory.getLogger(PartnerLookupClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String PARTNER_SERVICE_BASE = "http://partner-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public PartnerLookupClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                               InternalAuthProperties internalAuthProperties,
                               ObjectMapper objectMapper) {
        this.restClient = builder.baseUrl(PARTNER_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * partnerCode 로 거래처 단건 조회. 401/403 은 fail-fast, 404/5xx 는 empty 반환.
     *
     * @param partnerCode 거래처코드 (필수, 사용자 노출 식별자)
     * @return PartnerSummary (성공) 또는 empty (실패)
     */
    public Optional<PartnerSummary> findByPartnerCode(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            return Optional.empty();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw internalAuthMiss("partnerCode", partnerCode, 0);
        }
        try {
            String body = restClient.get()
                    .uri("/internal/partners/{partnerCode}", partnerCode.trim())
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseSummary(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 404) {
                log.debug("PartnerLookupClient — partnerCode={} 404 (정상 미존재)", partnerCode);
                return Optional.empty();
            }
            if (status == 401 || status == 403) {
                throw internalAuthMiss("partnerCode", partnerCode, status);
            }
            log.warn("PartnerLookupClient — partnerCode={} status={} (예외)", partnerCode, status);
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient 호출 실패 — partnerCode={}, msg={}",
                    partnerCode, ex.getMessage());
            return Optional.empty();
        }
    }

    /**
     * partnerId(UUID) → PartnerSummary fail-soft — SP-08-FU2 P2-3 실 구현.
     *
     * <p>partner-service {@code GET /internal/partners/{id}/summary} 호출.
     * 성공 시 PartnerSummary (partnerCode + name 포함) 반환.
     * 401/403 은 fail-fast, 404 / 5xx / 네트워크 오류는 empty 반환 (caller 가 fallback 처리).
     *
     * <p>인증 = X-Internal-Token (env {@code SAMHAN_INTERNAL_TOKEN}).
     *
     * @param partnerId 거래처 UUID (필수)
     * @return PartnerSummary (성공) 또는 empty (실패)
     */
    public Optional<PartnerSummary> findByPartnerId(UUID partnerId) {
        if (partnerId == null) {
            return Optional.empty();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw internalAuthMiss("partnerId", partnerId, 0);
        }
        try {
            String body = restClient.get()
                    .uri("/internal/partners/{partnerId}/summary", partnerId)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseSummary(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 404) {
                log.debug("PartnerLookupClient — partnerId={} 404 (정상 미존재)", partnerId);
                return Optional.empty();
            }
            if (status == 401 || status == 403) {
                throw internalAuthMiss("partnerId", partnerId, status);
            }
            log.warn("PartnerLookupClient — partnerId={} status={} (예외)", partnerId, status);
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient partnerId 호출 실패 — partnerId={}, msg={}",
                    partnerId, ex.getMessage());
            return Optional.empty();
        }
    }

    /**
     * partnerId 목록 → 거래처명 batch lookup. 401/403 은 fail-fast, 5xx/network 는 빈 Map 반환.
     *
     * <p>partner-service {@code POST /internal/partners/lookup-by-ids} 호출. 응답은
     * {@code data.partners[].id/name} 또는 wrapper 없는 {@code partners[].id/name} 을 모두 허용한다.
     *
     * @param partnerIds 조회할 거래처 UUID 목록
     * @return partnerId → 거래처명 Map
     */
    public Map<UUID, String> findByPartnerIdsBatch(List<UUID> partnerIds) {
        if (partnerIds == null || partnerIds.isEmpty()) {
            return Map.of();
        }
        LinkedHashSet<UUID> distinct = new LinkedHashSet<>(partnerIds);
        distinct.removeIf(java.util.Objects::isNull);
        if (distinct.isEmpty()) {
            return Map.of();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw internalAuthMiss("partnerIds", distinct.size(), 0);
        }
        try {
            String body = restClient.post()
                    .uri("/internal/partners/lookup-by-ids")
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .body(Map.of("ids", distinct))
                    .retrieve()
                    .body(String.class);
            return parsePartnerNames(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 401 || status == 403) {
                throw internalAuthMiss("partnerIds", distinct.size(), status);
            }
            log.warn("PartnerLookupClient batch — count={} status={} (예외)",
                    distinct.size(), status);
            return Map.of();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient batch 호출 실패 — count={}, msg={}",
                    distinct.size(), ex.getMessage());
            return Map.of();
        }
    }

    /**
     * 거래처명 → PartnerSummary fail-soft — MIG-3 이카운트 전표 import 의 거래처명 lookup.
     *
     * <p>partner-service {@code GET /internal/partners/by-name?name=} 호출.
     * 401/403 은 fail-fast, 404/409/5xx/network 는 empty 로 반환하고,
     * importer 가 {@code MIG3_LOOKUP_MISS} reject 로 명시 보고한다.
     *
     * @param partnerName 이카운트 raw 거래처명
     * @return PartnerSummary (성공) 또는 empty (실패)
     */
    public Optional<PartnerSummary> findByPartnerName(String partnerName) {
        return findByPartnerName(partnerName, false);
    }

    /**
     * MIG-3 import 전용 strict 거래처명 lookup.
     *
     * <p>partner-service 가 409 을 반환하면 운영자가 "미등록"이 아니라 "중복/모호"로 조치할 수 있도록
     * {@code MIG3_LOOKUP_AMBIGUOUS} 를 throw 한다. 401/403 은 fail-fast,
     * 404/네트워크 실패는 기존 fail-soft miss 로 둔다.
     */
    public Optional<PartnerSummary> findByPartnerNameStrict(String partnerName) {
        return findByPartnerName(partnerName, true);
    }

    private Optional<PartnerSummary> findByPartnerName(String partnerName, boolean strictAmbiguous) {
        if (partnerName == null || partnerName.isBlank()) {
            return Optional.empty();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw internalAuthMiss("partnerName", partnerName, 0);
        }
        try {
            String body = restClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/internal/partners/by-name")
                            .queryParam("name", partnerName.trim())
                            .build())
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseSummary(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 409 && strictAmbiguous) {
                throw new BusinessException(ErrorCode.MIG3_LOOKUP_AMBIGUOUS,
                        "거래처명 lookup ambiguous: " + partnerName);
            }
            if (status == 401 || status == 403) {
                throw internalAuthMiss("partnerName", partnerName, status);
            }
            if (status == 404 || status == 409) {
                log.debug("PartnerLookupClient — partnerName={} status={} (lookup miss/ambiguous)",
                        partnerName, status);
                return Optional.empty();
            }
            log.warn("PartnerLookupClient — partnerName={} status={} (예외)", partnerName, status);
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient partnerName 호출 실패 — partnerName={}, msg={}",
                    partnerName, ex.getMessage());
            return Optional.empty();
        }
    }

    /** ApiResponse wrapper 의 data 필드 → PartnerSummary 변환. */
    private Optional<PartnerSummary> parseSummary(String body) {
        if (body == null || body.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull() || !data.isObject()) {
                return Optional.empty();
            }
            UUID partnerId = parseUuid(data, "partnerId", "id");
            String partnerCode = textOrNull(data, "partnerCode");
            String name = textOrNull(data, "name", "partnerName", "businessName");
            String businessNo = textOrNull(data, "businessNo", "businessRegistrationNumber");
            String address = textOrNull(data, "address");
            if (partnerCode == null || partnerCode.isBlank()) {
                return Optional.empty();
            }
            return Optional.of(new PartnerSummary(partnerId, partnerCode, name, businessNo, address));
        } catch (Exception ex) {
            log.warn("PartnerLookupClient response 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            return Optional.empty();
        }
    }

    /** ApiResponse wrapper 의 data.partners 또는 root.partners → partnerId/name Map 변환. */
    private Map<UUID, String> parsePartnerNames(String body) {
        if (body == null || body.isBlank()) {
            return Map.of();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            JsonNode partners = data == null ? null : data.get("partners");
            if (partners == null || !partners.isArray()) {
                return Map.of();
            }
            Map<UUID, String> result = new LinkedHashMap<>();
            for (JsonNode partner : partners) {
                UUID id = parseUuid(partner, "id", "partnerId");
                String name = textOrNull(partner, "name", "partnerName", "businessName");
                if (id != null && name != null) {
                    result.put(id, name);
                }
            }
            return result;
        } catch (Exception ex) {
            log.warn("PartnerLookupClient batch response 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            return Map.of();
        }
    }

    private static String textOrNull(JsonNode node, String... keys) {
        for (String k : keys) {
            JsonNode n = node.get(k);
            if (n != null && !n.isNull() && !n.asText().isBlank()) {
                return n.asText();
            }
        }
        return null;
    }

    private static UUID parseUuid(JsonNode node, String... keys) {
        for (String k : keys) {
            JsonNode n = node.get(k);
            if (n != null && !n.isNull() && !n.asText().isBlank()) {
                try {
                    return UUID.fromString(n.asText());
                } catch (IllegalArgumentException ignore) {
                    return null;
                }
            }
        }
        return null;
    }

    private BusinessException internalAuthMiss(String key, Object value, int status) {
        if (status == 0) {
            log.error("PartnerLookupClient — X-Internal-Token 미설정 ({}={})", key, value);
            return new BusinessException(ErrorCode.MIG12_INTERNAL_AUTH_MISS,
                    "PartnerLookupClient 내부 인증 토큰 미설정");
        }
        log.error("PartnerLookupClient — {}={} status={} (내부 인증 실패)", key, value, status);
        return new BusinessException(ErrorCode.MIG12_INTERNAL_AUTH_MISS,
                "PartnerLookupClient 내부 인증 실패: status=" + status);
    }
}
