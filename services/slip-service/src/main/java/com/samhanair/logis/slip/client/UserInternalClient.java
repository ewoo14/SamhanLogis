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
 * user-service 내부 호출 client — SP-08-5-5 (매입 인쇄 양식) ownerFullName 조회용 신규.
 *
 * <p>slip-service 가 전표 단건 상세를 반환할 때 {@code createdBy} (user UUID) 로
 * user-service {@code GET /internal/users/{userId}} 를 호출하여 담당자 성명을 조회한다.
 * 인쇄 양식의 담당자 영역({@code slip.ownerFullName}) 자동 표시가 목적.
 *
 * <p>endpoint:
 * <ul>
 *   <li>{@code GET /internal/users/{userId}} → InternalUserResponse (fullName 포함)</li>
 * </ul>
 *
 * <p>인증 = X-Internal-Token (user-service 의 InternalTokenFilter 가 ROLE_MASTER 부여).
 *
 * <p>오류 처리 (graceful fallback):
 * <ul>
 *   <li>404 (미존재) → empty Optional. 담당자명 표시 생략.
 *   <li>5xx / 연결 실패 → empty Optional + warn log. slip 조회 자체는 정상 반환.
 *   <li>internal token 미설정 → empty Optional + warn log.
 * </ul>
 *
 * <p>timeout: connect 2s / read 3s (PartnerInternalClient 와 동일 정책).
 */
@Component
public class UserInternalClient {

    private static final Logger log = LoggerFactory.getLogger(UserInternalClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String USER_SERVICE_BASE = "http://user-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public UserInternalClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
            InternalAuthProperties internalAuthProperties,
            ObjectMapper objectMapper) {
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        rf.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        this.restClient = builder
                .baseUrl(USER_SERVICE_BASE)
                .requestFactory(rf)
                .build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * userId UUID → 직원 성명(fullName) resolve.
     *
     * <p>user-service {@code GET /internal/users/{userId}} 를 호출하여
     * InternalUserResponse.fullName 을 추출한다.
     *
     * @param userId 직원 UUID (Slip.createdBy 에서 파싱)
     * @return fullName Optional. 미존재 / 5xx / 연결 실패 / 토큰 미설정 시 empty.
     */
    public Optional<String> resolveFullName(UUID userId) {
        if (userId == null) {
            return Optional.empty();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("UserInternalClient.resolveFullName — internal.token 미설정, skipped (userId={})", userId);
            return Optional.empty();
        }
        try {
            String body = restClient.get()
                    .uri("/internal/users/{userId}", userId)
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
            JsonNode fullNameNode = data.get("fullName");
            if (fullNameNode == null || fullNameNode.isNull() || fullNameNode.asText().isBlank()) {
                return Optional.empty();
            }
            return Optional.of(fullNameNode.asText());
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().is5xxServerError()) {
                log.warn("UserInternalClient.resolveFullName 5xx — userId={}, status={}",
                        userId, ex.getStatusCode());
            } else {
                log.debug("UserInternalClient.resolveFullName 4xx (미존재 등) — userId={}, status={}",
                        userId, ex.getStatusCode());
            }
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("UserInternalClient.resolveFullName 호출 실패 — userId={}, msg={}",
                    userId, ex.getMessage());
            return Optional.empty();
        }
    }
}
