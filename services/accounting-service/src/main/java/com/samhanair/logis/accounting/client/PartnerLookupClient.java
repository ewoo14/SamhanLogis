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
import java.math.BigDecimal;
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

    /** 외부 거래처 조회 결과를 미존재와 일시 장애로 구분한다. */
    public enum LookupStatus { FOUND, NOT_FOUND, UNAVAILABLE }

    /** 조회 상태와 성공 시 거래처 요약을 함께 전달한다. */
    public record LookupResult(LookupStatus status, PartnerSummary partner) {
        public static LookupResult found(PartnerSummary partner) {
            return new LookupResult(LookupStatus.FOUND, partner);
        }

        public static LookupResult notFound() {
            return new LookupResult(LookupStatus.NOT_FOUND, null);
        }

        public static LookupResult unavailable() {
            return new LookupResult(LookupStatus.UNAVAILABLE, null);
        }

        public boolean isFound() { return status == LookupStatus.FOUND && partner != null; }
        public boolean isNotFound() { return status == LookupStatus.NOT_FOUND; }
        public boolean isUnavailable() { return status == LookupStatus.UNAVAILABLE; }
    }

    /**
     * partnerId batch 조회 결과 — 부분 성공과 전면 장애를 구분한다.
     *
     * <p>조회한 partnerId 중 일부가 결과에 없는 것(삭제/미존재 거래처 혼재)은 partner-service 가
     * 정상 응답했다는 뜻이므로 {@code FOUND}(부분 맵, 심지어 빈 맵)이다. 5xx/timeout/네트워크
     * 오류 및 구조적으로 손상된 응답만 {@code UNAVAILABLE} 로 승격해, 호출부가 "조용한 0건"과
     * "장애"를 구별할 수 있게 한다(#831 B군).
     */
    public record BatchLookupResult(LookupStatus status, Map<UUID, PartnerSummary> partners) {
        public BatchLookupResult {
            partners = partners == null ? Map.of() : Map.copyOf(partners);
        }

        public static BatchLookupResult found(Map<UUID, PartnerSummary> partners) {
            return new BatchLookupResult(LookupStatus.FOUND, partners);
        }

        public static BatchLookupResult unavailable() {
            return new BatchLookupResult(LookupStatus.UNAVAILABLE, Map.of());
        }

        public boolean isUnavailable() { return status == LookupStatus.UNAVAILABLE; }
    }

    /** directory 목록 조회 결과도 미존재와 partner-service 장애를 구분한다. */
    public record DirectoryLookupResult(LookupStatus status, List<PartnerSummary> partners) {
        public DirectoryLookupResult {
            partners = partners == null ? List.of() : List.copyOf(partners);
        }

        public static DirectoryLookupResult found(List<PartnerSummary> partners) {
            return new DirectoryLookupResult(LookupStatus.FOUND, partners);
        }

        public static DirectoryLookupResult notFound() {
            return new DirectoryLookupResult(LookupStatus.NOT_FOUND, List.of());
        }

        public static DirectoryLookupResult unavailable() {
            return new DirectoryLookupResult(LookupStatus.UNAVAILABLE, List.of());
        }

        public boolean isFound() { return status == LookupStatus.FOUND; }
        public boolean isNotFound() { return status == LookupStatus.NOT_FOUND; }
        public boolean isUnavailable() { return status == LookupStatus.UNAVAILABLE; }
    }

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
        LookupResult result = findByPartnerCodeResult(partnerCode);
        return result == null || !result.isFound() ? Optional.empty() : Optional.of(result.partner());
    }

    /** 거래처 코드 조회의 FOUND/NOT_FOUND/UNAVAILABLE 결과를 보존한다. */
    public LookupResult findByPartnerCodeResult(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) return LookupResult.notFound();
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) throw internalAuthMiss("partnerCode", partnerCode, 0);
        try {
            String body = restClient.get().uri("/internal/partners/{partnerCode}", partnerCode.trim())
                    .header(INTERNAL_TOKEN_HEADER, token).retrieve().body(String.class);
            return parseSummaryResult(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 404 || status == 409) return LookupResult.notFound();
            if (status == 401 || status == 403) throw internalAuthMiss("partnerCode", partnerCode, status);
            log.warn("PartnerLookupClient — partnerCode={} status={} (일시 장애)", partnerCode, status);
            return LookupResult.unavailable();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient 호출 실패 — partnerCode={}, msg={}", partnerCode, ex.getMessage());
            return LookupResult.unavailable();
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
        LookupResult result = findByPartnerIdResult(partnerId);
        return result == null || !result.isFound() ? Optional.empty() : Optional.of(result.partner());
    }

    /** 거래처 UUID 조회의 FOUND/NOT_FOUND/UNAVAILABLE 결과를 보존한다. */
    public LookupResult findByPartnerIdResult(UUID partnerId) {
        if (partnerId == null) return LookupResult.notFound();
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) throw internalAuthMiss("partnerId", partnerId, 0);
        try {
            String body = restClient.get().uri("/internal/partners/{partnerId}/summary", partnerId)
                    .header(INTERNAL_TOKEN_HEADER, token).retrieve().body(String.class);
            return parseSummaryResult(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 404 || status == 409) return LookupResult.notFound();
            if (status == 401 || status == 403) throw internalAuthMiss("partnerId", partnerId, status);
            log.warn("PartnerLookupClient — partnerId={} status={} (일시 장애)", partnerId, status);
            return LookupResult.unavailable();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient partnerId 호출 실패 — partnerId={}, msg={}", partnerId, ex.getMessage());
            return LookupResult.unavailable();
        }
    }

    /**
     * partnerId 목록 → PartnerSummary batch lookup. 401/403 은 fail-fast, 5xx/network 는 빈 Map 반환.
     *
     * <p>partner-service {@code POST /internal/partners/lookup-by-ids} 호출. 응답은
     * {@code data.partners[].id/partnerCode/name} 또는 wrapper 없는
     * {@code partners[].id/partnerCode/name} 을 모두 허용한다.
     *
     * @param partnerIds 조회할 거래처 UUID 목록
     * @return partnerId → PartnerSummary Map
     */
    public Map<UUID, PartnerSummary> findByPartnerIdsBatch(List<UUID> partnerIds) {
        return findByPartnerIdsBatchResult(partnerIds).partners();
    }

    /**
     * partnerId batch 조회의 FOUND(부분 성공 포함)/UNAVAILABLE 결과를 보존한다 (#831 B군).
     *
     * <p>요청한 id 중 일부가 매칭되지 않는 것은 partner-service 가 정상 응답한 것이므로
     * FOUND(부분 맵)이다. 5xx/timeout/네트워크 오류 및 구조 손상 응답만 UNAVAILABLE 로 승격한다.
     *
     * @param partnerIds 조회할 거래처 UUID 목록
     * @return FOUND(부분 성공 포함) 또는 UNAVAILABLE
     */
    public BatchLookupResult findByPartnerIdsBatchResult(List<UUID> partnerIds) {
        if (partnerIds == null || partnerIds.isEmpty()) {
            return BatchLookupResult.found(Map.of());
        }
        LinkedHashSet<UUID> distinct = new LinkedHashSet<>(partnerIds);
        distinct.removeIf(java.util.Objects::isNull);
        if (distinct.isEmpty()) {
            return BatchLookupResult.found(Map.of());
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
            return parsePartnerSummariesResult(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 401 || status == 403) {
                throw internalAuthMiss("partnerIds", distinct.size(), status);
            }
            log.warn("PartnerLookupClient batch — count={} status={} (일시 장애)",
                    distinct.size(), status);
            return BatchLookupResult.unavailable();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient batch 호출 실패 — count={}, msg={}",
                    distinct.size(), ex.getMessage());
            return BatchLookupResult.unavailable();
        }
    }

    /**
     * partnerCode/name/bizNo 부분일치 directory 조회.
     *
     * <p>partner-service {@code GET /internal/partners/list?q=&limit=&page=0} 호출.
     * G-1 받을어음 등록 화면의 bizNo 단독 resolve 에 사용한다. 응답에 포함된 partnerId 는
     * 회계 DB 저장용 내부 키이며 API 응답에는 노출하지 않는다.
     *
     * @param query partnerCode/name/bizNo 검색어
     * @param limit 최대 조회 건수
     * @return 매칭된 거래처 요약 목록. 실패 시 빈 목록
     */
    public List<PartnerSummary> searchDirectory(String query, int limit) {
        DirectoryLookupResult result = searchDirectoryResult(query, limit);
        return result.isFound() ? result.partners() : List.of();
    }

    /** directory 목록 조회의 FOUND/NOT_FOUND/UNAVAILABLE 결과를 보존한다. */
    public DirectoryLookupResult searchDirectoryResult(String query, int limit) {
        if (query == null || query.isBlank()) {
            return DirectoryLookupResult.notFound();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw internalAuthMiss("partnerDirectory", query, 0);
        }
        try {
            String body = restClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/internal/partners/list")
                            .queryParam("q", query.trim())
                            .queryParam("limit", Math.max(1, limit))
                            .queryParam("page", 0)
                            .build())
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseSummaryListResult(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 401 || status == 403) {
                throw internalAuthMiss("partnerDirectory", query, status);
            }
            if (status == 404 || status == 409) {
                return DirectoryLookupResult.notFound();
            }
            log.warn("PartnerLookupClient directory — q={} status={} (예외)", query, status);
            return DirectoryLookupResult.unavailable();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient directory 호출 실패 — q={}, msg={}", query, ex.getMessage());
            return DirectoryLookupResult.unavailable();
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
        LookupResult result = findByPartnerNameResult(partnerName);
        return result == null || !result.isFound() ? Optional.empty() : Optional.of(result.partner());
    }

    /** 거래처명 조회의 FOUND/NOT_FOUND/UNAVAILABLE 결과를 보존한다. */
    public LookupResult findByPartnerNameResult(String partnerName) {
        return findByPartnerNameResult(partnerName, false);
    }

    /**
     * MIG-3 import 전용 strict 거래처명 lookup.
     *
     * <p>partner-service 가 409 을 반환하면 운영자가 "미등록"이 아니라 "중복/모호"로 조치할 수 있도록
     * {@code MIG3_LOOKUP_AMBIGUOUS} 를 throw 한다. 401/403 은 fail-fast,
     * 404/네트워크 실패는 기존 fail-soft miss 로 둔다.
     */
    public Optional<PartnerSummary> findByPartnerNameStrict(String partnerName) {
        LookupResult result = findByPartnerNameResult(partnerName, true);
        return result == null || !result.isFound() ? Optional.empty() : Optional.of(result.partner());
    }

    private LookupResult findByPartnerNameResult(String partnerName, boolean strictAmbiguous) {
        if (partnerName == null || partnerName.isBlank()) {
            return LookupResult.notFound();
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
            return parseSummaryResult(body);
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
                return LookupResult.notFound();
            }
            log.warn("PartnerLookupClient — partnerName={} status={} (예외)", partnerName, status);
            return LookupResult.unavailable();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient partnerName 호출 실패 — partnerName={}, msg={}",
                    partnerName, ex.getMessage());
            return LookupResult.unavailable();
        }
    }

    /** ApiResponse wrapper 의 data 필드 → PartnerSummary 변환. */
    private Optional<PartnerSummary> parseSummary(String body) {
        LookupResult result = parseSummaryResult(body);
        return result == null || !result.isFound() ? Optional.empty() : Optional.of(result.partner());
    }

    private LookupResult parseSummaryResult(String body) {
        if (body == null || body.isBlank()) {
            return LookupResult.unavailable();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull() || !data.isObject()) {
                return LookupResult.unavailable();
            }
            UUID partnerId = parseUuid(data, "partnerId", "id");
            String partnerCode = textOrNull(data, "partnerCode");
            String name = textOrNull(data, "name", "partnerName", "businessName");
            String businessNo = textOrNull(data, "bizNo", "businessNo", "businessRegistrationNumber");
            String address = textOrNull(data, "address");
            BigDecimal creditLimit = decimalOrNull(data, "creditLimit");
            String status = textOrNull(data, "status");
            // #810 R3-CODEX (S1-M2): partnerId·partnerCode 는 둘 다 구조적 필수다.
            // 200 응답에 partnerId 가 누락/형식오류인데 partnerCode 만으로 FOUND 를 반환하면
            // 부분배포/응답손상 시 partnerId=null 요약이 매칭 경로로 흘러 오매칭을 유발한다.
            // 하나라도 결손이면 FOUND 가 아니라 UNAVAILABLE(재시도 대상)로 격리한다.
            if (partnerId == null || partnerCode == null || partnerCode.isBlank()) {
                log.warn("PartnerLookupClient response 구조 결손 — partnerId={} partnerCode={} (UNAVAILABLE 격리)",
                        partnerId == null ? "누락/형식오류" : "ok",
                        partnerCode == null || partnerCode.isBlank() ? "누락" : "ok");
                return LookupResult.unavailable();
            }
            return LookupResult.found(new PartnerSummary(partnerId, partnerCode, name, businessNo, address,
                    creditLimit, status));
        } catch (Exception ex) {
            log.warn("PartnerLookupClient response 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            return LookupResult.unavailable();
        }
    }

    /** ApiResponse wrapper 의 data.partners 또는 root.partners → partnerId/summary Map 변환. */
    private BatchLookupResult parsePartnerSummariesResult(String body) {
        if (body == null || body.isBlank()) {
            // 200 인데 body 가 비었다는 것은 구조적으로 손상된 응답 — 장애로 승격한다.
            return BatchLookupResult.unavailable();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            JsonNode partners = data == null ? null : data.get("partners");
            if (partners == null || !partners.isArray()) {
                // partners 필드 자체가 없는 것(빈 배열과 다름)은 응답 계약 위반 — 장애로 승격한다.
                return BatchLookupResult.unavailable();
            }
            Map<UUID, PartnerSummary> result = new LinkedHashMap<>();
            for (JsonNode partner : partners) {
                UUID id = parseUuid(partner, "id", "partnerId");
                String partnerCode = textOrNull(partner, "partnerCode");
                String name = textOrNull(partner, "name", "partnerName", "businessName");
                String businessNo = textOrNull(partner, "bizNo", "businessNo", "businessRegistrationNumber");
                String address = textOrNull(partner, "address");
                BigDecimal creditLimit = decimalOrNull(partner, "creditLimit");
                String status = textOrNull(partner, "status");
                if (id != null && (partnerCode != null || name != null)) {
                    result.put(id, new PartnerSummary(id, partnerCode, name, businessNo, address,
                            creditLimit, status));
                }
            }
            // partners 가 빈 배열([])인 것은 요청한 id 가 하나도 매칭되지 않은 정상 응답이다
            // (삭제/미존재 거래처 혼재) — UNAVAILABLE 이 아니라 FOUND(부분/빈 맵)로 유지한다.
            return BatchLookupResult.found(result);
        } catch (Exception ex) {
            log.warn("PartnerLookupClient batch response 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            return BatchLookupResult.unavailable();
        }
    }

    /** ApiResponse wrapper 의 data 배열 → PartnerSummary 목록 변환. */
    private List<PartnerSummary> parseSummaryList(String body) {
        DirectoryLookupResult result = parseSummaryListResult(body);
        return result.isFound() ? result.partners() : List.of();
    }

    private DirectoryLookupResult parseSummaryListResult(String body) {
        if (body == null || body.isBlank()) {
            return DirectoryLookupResult.unavailable();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || !data.isArray()) {
                return DirectoryLookupResult.unavailable();
            }
            java.util.ArrayList<PartnerSummary> result = new java.util.ArrayList<>();
            for (JsonNode partner : data) {
                UUID id = parseUuid(partner, "partnerId", "id");
                String partnerCode = textOrNull(partner, "partnerCode");
                String name = textOrNull(partner, "name", "partnerName", "businessName");
                String businessNo = textOrNull(partner, "bizNo", "businessNo", "businessRegistrationNumber");
                String address = textOrNull(partner, "address");
                BigDecimal creditLimit = decimalOrNull(partner, "creditLimit");
                String status = textOrNull(partner, "status");
                if (id != null && partnerCode != null && !partnerCode.isBlank()) {
                    result.add(new PartnerSummary(id, partnerCode, name, businessNo, address,
                            creditLimit, status));
                }
            }
            return result.isEmpty()
                    ? DirectoryLookupResult.notFound()
                    : DirectoryLookupResult.found(result);
        } catch (Exception ex) {
            log.warn("PartnerLookupClient directory response 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            return DirectoryLookupResult.unavailable();
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

    private static BigDecimal decimalOrNull(JsonNode node, String... keys) {
        for (String k : keys) {
            JsonNode n = node.get(k);
            if (n != null && !n.isNull() && !n.asText().isBlank()) {
                try {
                    return n.isNumber() ? n.decimalValue() : new BigDecimal(n.asText());
                } catch (NumberFormatException ignore) {
                    return null;
                }
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
