package com.samhanair.logis.slip.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * partner-service 호출 client — Phase 10 W10-4 종합 TM (BE-1 채택) 신규.
 *
 * <p>arologis-service 가 slip-service 의 by-partner-code endpoint 를 호출하면 slip-service 는 본
 * client 로 partner-service {@code GET /internal/partners/{partnerCode}} 를 호출하여 partnerId UUID
 * 를 resolve 후 자체 SlipRepository 로 활성 슬립을 lookup 한다.
 *
 * <p>endpoint 1종:
 * <ul>
 *   <li>{@code GET /internal/partners/{partnerCode}} → PartnerInternalResponse (partnerId UUID 포함).
 *       PartnerInternalResponse 는 partner-service 만 알고 있으므로 본 client 는 raw JsonNode 에서
 *       partnerId 만 추출 (의존성 최소화).</li>
 * </ul>
 *
 * <p>인증 = X-Internal-Token (partner-service 의 InternalTokenFilter 가 ROLE_MASTER 부여).
 *
 * <p>오류 처리 (graceful fallback):
 * <ul>
 *   <li>4xx (404 = 미존재) → empty Optional. 호출자(slip-service)가 NOT_FOUND 매핑.</li>
 *   <li>5xx / 연결 실패 → empty Optional + warn log. arologis 자체 INSERT 만 유지 운영 영향 0.</li>
 *   <li>internal token 미설정 → empty Optional + warn log.</li>
 * </ul>
 *
 * <p>timeout 설정 (DV-1 채택 일관) — connect 2s / read 3s. partner-service hang 시 slip-service
 * by-partner-code endpoint 가 driver-app 응답을 차단하지 않도록.
 */
@Component
public class PartnerInternalClient {

    private static final Logger log = LoggerFactory.getLogger(PartnerInternalClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String PARTNER_SERVICE_BASE = "http://partner-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    /** partnerCode 기준 거래처 대표 이메일 조회 — 홈택스 sales-query용. */
    public Optional<String> resolveEmailByPartnerCode(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) return Optional.empty();
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) return Optional.empty();
        try {
            String body = restClient.get()
                    .uri("/internal/partners/{partnerCode}", partnerCode)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve().body(String.class);
            JsonNode root = objectMapper.readTree(body == null ? "{}" : body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            JsonNode email = data == null ? null : data.get("email");
            return email == null || email.isNull() || email.asText().isBlank()
                    ? Optional.empty() : Optional.of(email.asText());
        } catch (Exception ex) {
            log.warn("PartnerInternalClient.resolveEmailByPartnerCode 실패 — partnerCode={}", partnerCode);
            return Optional.empty();
        }
    }

    public PartnerInternalClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                                 InternalAuthProperties internalAuthProperties,
                                 ObjectMapper objectMapper) {
        // DV-1 채택 일관 — connect 2s / read 3s (partner-service hang SLA 가드).
        // Spring Boot 3.3 + JDK SimpleClientHttpRequestFactory 표준 setter 사용
        // (Spring Boot 3.4 의 ClientHttpRequestFactories 표준 키는 미지원 단계).
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        rf.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        this.restClient = builder
                .baseUrl(PARTNER_SERVICE_BASE)
                .requestFactory(rf)
                .build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * partnerCode → partnerId UUID resolve.
     *
     * @param partnerCode 사용자 노출 식별자 (카톡 파싱 결과 또는 dispatch stop.parsedPartnerCode)
     * @return partnerId UUID Optional. 미존재 / 5xx / 연결 실패 / 토큰 미설정 시 empty.
     */
    public Optional<UUID> resolvePartnerId(String partnerCode) {
        return verifyPartnerCode(partnerCode).partnerId();
    }

    /**
     * partnerId → businessRegistrationNo (사업자등록번호) resolve.
     *
     * <p>전표 생성/수정 시 partner-service {@code GET /internal/partners/{id}/business-number}
     * 를 호출하여 사업자등록번호 snapshot 을 채운다.
     *
     * <p>오류 처리 (graceful fallback):
     * <ul>
     *   <li>토큰 미설정 → empty Optional + warn log.</li>
     *   <li>404 (미존재) → empty Optional.</li>
     *   <li>5xx / 연결 실패 → empty Optional + warn log (legacy 호환, businessNumber NULL 유지).</li>
     * </ul>
     *
     * @param partnerId 거래처 UUID (Slip.partnerId)
     * @return 사업자등록번호 문자열 Optional. 실패 시 empty.
     */
    public Optional<String> resolveBusinessNumber(UUID partnerId) {
        if (partnerId == null) {
            return Optional.empty();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("PartnerInternalClient.resolveBusinessNumber — internal.token 미설정, skipped (partnerId={})",
                    partnerId);
            return Optional.empty();
        }
        try {
            String body = restClient.get()
                    .uri("/internal/partners/{id}/business-number", partnerId)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            if (body == null || body.isBlank()) {
                return Optional.empty();
            }
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull()) {
                return Optional.empty();
            }
            JsonNode bizNoNode = data.get("businessRegistrationNo");
            if (bizNoNode == null || bizNoNode.isNull() || bizNoNode.asText().isBlank()) {
                return Optional.empty();
            }
            return Optional.of(bizNoNode.asText());
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().is5xxServerError()) {
                log.warn("PartnerInternalClient.resolveBusinessNumber 5xx — partnerId={}, status={}",
                        partnerId, ex.getStatusCode());
            } else {
                log.debug("PartnerInternalClient.resolveBusinessNumber 4xx — partnerId={}, status={}",
                        partnerId, ex.getStatusCode());
            }
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("PartnerInternalClient.resolveBusinessNumber 호출 실패 — partnerId={}, msg={}",
                    partnerId, ex.getMessage());
            return Optional.empty();
        }
    }

    /**
     * partnerId → partnerCode resolve — 거래명세서 공급받는자(사업자주소/대표번호) 배선 (2026-06-10).
     *
     * <p>Slip.partnerCode (V15 컬럼) 의 "실 채움 후속 슬라이스" 를 본 메서드로 이행한다.
     * partner-service {@code GET /internal/partners/{id}/summary} (SP-08-FU2 P2-3 기존 endpoint,
     * PartnerInternalResponse 에 partnerCode 포함) 호출 후 partnerCode 만 추출.
     *
     * <p>오류 처리 — {@link #resolveBusinessNumber} 와 동일한 graceful fallback:
     * 4xx/5xx/연결 실패/토큰 미설정 → empty Optional (slip.partnerCode NULL 유지, 운영 영향 0).
     *
     * @param partnerId 거래처 UUID (Slip.partnerId)
     * @return partnerCode 문자열 Optional. 실패 시 empty.
     */
    public Optional<String> resolvePartnerCode(UUID partnerId) {
        if (partnerId == null) {
            return Optional.empty();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("PartnerInternalClient.resolvePartnerCode — internal.token 미설정, skipped (partnerId={})",
                    partnerId);
            return Optional.empty();
        }
        try {
            String body = restClient.get()
                    .uri("/internal/partners/{id}/summary", partnerId)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            if (body == null || body.isBlank()) {
                return Optional.empty();
            }
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull()) {
                return Optional.empty();
            }
            JsonNode codeNode = data.get("partnerCode");
            if (codeNode == null || codeNode.isNull() || codeNode.asText().isBlank()) {
                return Optional.empty();
            }
            return Optional.of(codeNode.asText());
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().is5xxServerError()) {
                log.warn("PartnerInternalClient.resolvePartnerCode 5xx — partnerId={}, status={}",
                        partnerId, ex.getStatusCode());
            } else {
                log.debug("PartnerInternalClient.resolvePartnerCode 4xx — partnerId={}, status={}",
                        partnerId, ex.getStatusCode());
            }
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("PartnerInternalClient.resolvePartnerCode 호출 실패 — partnerId={}, msg={}",
                    partnerId, ex.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Phase 10 PR-G1 backlog #1 — partnerCode strict 검증 + 결과 분류.
     *
     * <p>{@link #resolvePartnerId} 와 달리 호출 결과를 4가지로 분류하여 호출자
     * (SlipPublishService) 가 strict on/off 정책에 맞춰 분기할 수 있게 한다.
     *
     * @param partnerCode 사용자 노출 거래처 코드
     * @return {@link PartnerVerifyResult} (FOUND / NOT_FOUND / SERVER_ERROR / SKIPPED)
     */
    public PartnerVerifyResult verifyPartnerCode(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            return PartnerVerifyResult.skipped(Optional.empty());
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("PartnerInternalClient.verifyPartnerCode — app.security.internal.token 미설정, skipped 반환 (partnerCode={})",
                    partnerCode);
            return PartnerVerifyResult.skipped(Optional.empty());
        }
        try {
            String body = restClient.get()
                    .uri("/internal/partners/{partnerCode}", partnerCode)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            if (body == null || body.isBlank()) {
                return PartnerVerifyResult.notFound();
            }
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull()) {
                return PartnerVerifyResult.notFound();
            }
            JsonNode partnerIdNode = data.get("partnerId");
            if (partnerIdNode == null || partnerIdNode.isNull()) {
                return PartnerVerifyResult.found(Optional.empty());
            }
            return PartnerVerifyResult.found(Optional.of(UUID.fromString(partnerIdNode.asText())));
        } catch (RestClientResponseException ex) {
            // 404 = 미등록 partnerCode (strict 모드 reject 대상) — 진짜 "존재하지 않음" 만 여기로.
            // 5xx = partner-service 장애 (strict 모드 fail-open).
            // 404만 미존재로 분류한다. 401/403은 토큰 문제이고 408/429를 포함한 나머지
            // 4xx도 partner-service가 거래처 존재 여부를 판정한 응답으로 볼 수 없으므로
            // 검증 불가(serverError)로 보수 분류해 outbox 영구실패 세탁을 막는다.
            int status = ex.getStatusCode().value();
            if (status == 404) {
                return PartnerVerifyResult.notFound();
            }
            if (ex.getStatusCode().is5xxServerError()) {
                log.warn("PartnerInternalClient.verifyPartnerCode 5xx — partnerCode={}, status={}",
                        partnerCode, ex.getStatusCode());
                return PartnerVerifyResult.serverError();
            }
            log.debug("PartnerInternalClient.verifyPartnerCode 4xx (404 외 검증 불가) — partnerCode={}, status={}",
                    partnerCode, ex.getStatusCode());
            return PartnerVerifyResult.serverError();
        } catch (Exception ex) {
            log.warn("PartnerInternalClient.verifyPartnerCode 호출 실패 — partnerCode={}, msg={}",
                    partnerCode, ex.getMessage());
            return PartnerVerifyResult.serverError();
        }
    }

    /**
     * Phase 10 PR-G1 backlog #1 — partner verify 결과 4분류.
     *
     * <ul>
     *   <li>{@link Status#FOUND} — 200, 거래처 존재. partnerId 가 응답에 있으면 함께 반환.</li>
     *   <li>{@link Status#NOT_FOUND} — 404, 거래처 미등록. strict 모드 reject 대상.</li>
     *   <li>{@link Status#SERVER_ERROR} — 5xx / 404 외 4xx(401/403/408/429 등 검증 불가) / 연결 실패.
     *       strict 모드 fail-open (raw 저장 + warning).</li>
     *   <li>{@link Status#SKIPPED} — partnerCode null/blank 또는 internal token 미설정. lookup 자체 skip.</li>
     * </ul>
     */
    public record PartnerVerifyResult(Status status, Optional<UUID> partnerId) {

        public enum Status { FOUND, NOT_FOUND, SERVER_ERROR, SKIPPED }

        public static PartnerVerifyResult found(Optional<UUID> partnerId) {
            return new PartnerVerifyResult(Status.FOUND, partnerId);
        }

        public static PartnerVerifyResult notFound() {
            return new PartnerVerifyResult(Status.NOT_FOUND, Optional.empty());
        }

        public static PartnerVerifyResult serverError() {
            return new PartnerVerifyResult(Status.SERVER_ERROR, Optional.empty());
        }

        public static PartnerVerifyResult skipped(Optional<UUID> partnerId) {
            return new PartnerVerifyResult(Status.SKIPPED, partnerId);
        }

        public boolean isFound() {
            return status == Status.FOUND;
        }

        public boolean isNotFound() {
            return status == Status.NOT_FOUND;
        }
    }
}
