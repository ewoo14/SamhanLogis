package com.samhanair.logis.notification.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * partner-service 호출 실 구현체 — Phase 10 PR-E 진입 전 선행 BE-E.
 *
 * <p>{@link NoopPartnerLookupClient} 의 placeholder 를 production 환경에서 대체.
 * partner-service 의 internal endpoint 에 RestClient 로 직접 접근:
 * <ul>
 *   <li>{@code GET /internal/partners/by-name?name={name}} — {@link #findPartnerCodeByName(String)}</li>
 *   <li>{@code GET /internal/partners/{partnerCode}} — {@link #verifyPartnerCode(String)}</li>
 * </ul>
 *
 * <p>인증 = {@code X-Internal-Token} 헤더 (env var {@code SAMHAN_INTERNAL_TOKEN} → application.yml
 * {@code app.security.internal.token} 매핑). partner-service 측 {@code InternalTokenFilter} 가 토큰
 * 검증 후 ROLE_MASTER 부여 → controller {@code @PreAuthorize("hasRole('MASTER')")} 통과.
 *
 * <h2>활성 가드 — production 우선 / test 격리</h2>
 * <ul>
 *   <li>{@link Profile @Profile("!test")} — test profile 에서 비활성 (기존 IT 의 {@code @MockBean
 *       PartnerLookupClient} 격리 패턴 보존; memory feedback_it_mockbean_external_clients).</li>
 *   <li>{@link ConditionalOnProperty} — {@code samhan.notification.partner-lookup.enabled=true}
 *       (default true) 토글로 단순 환경에서 외부 호출 회피 가능.</li>
 *   <li>본 빈이 등록되면 {@link NoopPartnerLookupClient} 의 {@code @ConditionalOnMissingBean} 으로
 *       Noop 자동 비활성화 — production 에서는 본 RestClient 가 단일 활성 구현체.</li>
 * </ul>
 *
 * <h2>응답 schema</h2>
 * <p>partner-service 의 ApiResponse wrapper:
 * <pre>{@code
 * { "success": true, "data": { "partnerId":"<uuid>","partnerCode":"P-2026-0001","name":"...", ... } }
 * }</pre>
 *
 * <p>404 (미존재) / 409 (모호한 다중 매칭) / 401 (토큰 불일치) / 5xx → fail-soft empty 반환.
 * 호출 측 (ChatRoomImportService 등) 이 row 단위 reject 누적으로 운영자에게 노출.
 */
@Component
@Profile("!test")
@ConditionalOnProperty(prefix = "samhan.notification.partner-lookup", name = "enabled",
        havingValue = "true", matchIfMissing = true)
public class RestClientPartnerLookupClient implements PartnerLookupClient {

    private static final Logger log = LoggerFactory.getLogger(RestClientPartnerLookupClient.class);

    private final RestClient.Builder builder;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String internalToken;

    public RestClientPartnerLookupClient(
            RestClient.Builder builder,
            ObjectMapper objectMapper,
            @Value("${samhan.partner-service.url:http://localhost:8095}") String baseUrl,
            @Value("${app.security.internal.token:}") String internalToken) {
        this.builder = builder;
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl;
        this.internalToken = internalToken;
    }

    /**
     * 사업자명 → partnerCode 조회 — fallback 경로 (CSV 의 거래처코드 컬럼 미공급 시).
     *
     * <p>partner-service 측 {@code GET /internal/partners/by-name?name=<사업자명>} 호출.
     * 정확 일치 → 200, 다중 LIKE 매칭 → 409 (empty 반환), 미매칭 → 404 (empty 반환).
     */
    @Override
    public Optional<String> findPartnerCodeByName(String businessName) {
        if (businessName == null || businessName.isBlank()) {
            return Optional.empty();
        }
        if (internalToken == null || internalToken.isBlank()) {
            log.warn("RestClientPartnerLookupClient — X-Internal-Token 미설정 (app.security.internal.token), lookup 건너뜀");
            return Optional.empty();
        }
        try {
            RestClient client = builder.baseUrl(baseUrl).build();
            String body = client.get()
                    .uri(uriBuilder -> uriBuilder.path("/internal/partners/by-name")
                            .queryParam("name", businessName.trim())
                            .build())
                    .header("X-Internal-Token", internalToken)
                    .retrieve()
                    .body(String.class);
            return parsePartnerCode(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 404 || status == 409) {
                log.debug("PartnerLookupClient.findPartnerCodeByName — name={}, status={} (정상 미매칭)",
                        businessName, status);
                return Optional.empty();
            }
            log.warn("PartnerLookupClient.findPartnerCodeByName — name={}, status={} (예외)",
                    businessName, status);
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient.findPartnerCodeByName 호출 실패 — name={}, msg={}",
                    businessName, ex.getMessage());
            return Optional.empty();
        }
    }

    /**
     * partnerCode 직접 검증 — CSV 거래처코드 컬럼 우선 경로.
     *
     * <p>partner-service 측 {@code GET /internal/partners/{partnerCode}} 호출. 활성 partner 존재 시
     * 동일 코드 반환, 미존재 (404) 시 empty.
     */
    @Override
    public Optional<String> verifyPartnerCode(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            return Optional.empty();
        }
        if (internalToken == null || internalToken.isBlank()) {
            log.warn("RestClientPartnerLookupClient — X-Internal-Token 미설정, verifyPartnerCode 건너뜀");
            return Optional.empty();
        }
        try {
            RestClient client = builder.baseUrl(baseUrl).build();
            String body = client.get()
                    .uri("/internal/partners/{partnerCode}", partnerCode.trim())
                    .header("X-Internal-Token", internalToken)
                    .retrieve()
                    .body(String.class);
            return parsePartnerCode(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 404) {
                log.debug("PartnerLookupClient.verifyPartnerCode — partnerCode={}, 404 (정상 미존재)", partnerCode);
                return Optional.empty();
            }
            log.warn("PartnerLookupClient.verifyPartnerCode — partnerCode={}, status={} (예외)",
                    partnerCode, status);
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient.verifyPartnerCode 호출 실패 — partnerCode={}, msg={}",
                    partnerCode, ex.getMessage());
            return Optional.empty();
        }
    }

    /**
     * partner-service ApiResponse wrapper 의 {@code data.partnerCode} 추출.
     *
     * @return partnerCode (String) — 미수록 / 파싱 실패 시 empty
     */
    private Optional<String> parsePartnerCode(String body) {
        if (body == null || body.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull() || !data.isObject()) {
                return Optional.empty();
            }
            JsonNode codeNode = data.get("partnerCode");
            if (codeNode == null || codeNode.isNull() || codeNode.asText().isBlank()) {
                return Optional.empty();
            }
            return Optional.of(codeNode.asText());
        } catch (Exception ex) {
            log.warn("PartnerLookupClient response 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            return Optional.empty();
        }
    }
}
