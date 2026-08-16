package com.samhanair.logis.partnerorder.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * auth-service 내부 계정 조회 client.
 *
 * <p>주문 협업 알림 수신자 목록에는 과거 데이터의 loginId(username) 와 UUID 문자열이 섞일 수 있다.
 * UUID 가 아닌 식별자는 본 client 가 {@code GET /auth/internal/accounts/by-login} 을 호출해
 * push 수신자로 사용할 accountId(UUID) 로 변환한다.
 */
@Component
public class AuthAccountLookupClient {

    private static final Logger log = LoggerFactory.getLogger(AuthAccountLookupClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String AUTH_SERVICE_BASE = "http://auth-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    @Autowired
    public AuthAccountLookupClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
            InternalAuthProperties internalAuthProperties,
            ObjectMapper objectMapper) {
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        rf.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        this.restClient = builder
                .baseUrl(AUTH_SERVICE_BASE)
                .requestFactory(rf)
                .build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    AuthAccountLookupClient(RestClient restClient,
                            InternalAuthProperties internalAuthProperties,
                            ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * loginId 로 accountId 를 조회한다.
     *
     * @param loginId 로그인 아이디
     * @return accountId Optional
     */
    public Optional<UUID> findAccountIdByLoginId(String loginId) {
        if (loginId == null || loginId.isBlank()) {
            return Optional.empty();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("AuthAccountLookupClient.findAccountIdByLoginId — internal.token 미설정, skipped");
            return Optional.empty();
        }
        try {
            String body = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/auth/internal/accounts/by-login")
                            .queryParam("loginId", loginId)
                            .build())
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseAccountId(body);
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().is5xxServerError()) {
                log.warn("AuthAccountLookupClient.findAccountIdByLoginId 5xx — loginId={}, status={}",
                        loginId, ex.getStatusCode());
            } else {
                log.debug("AuthAccountLookupClient.findAccountIdByLoginId 4xx — loginId={}, status={}",
                        loginId, ex.getStatusCode());
            }
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("AuthAccountLookupClient.findAccountIdByLoginId 호출 실패 — loginId={}, msg={}",
                    loginId, ex.getMessage());
            return Optional.empty();
        }
    }

    private Optional<UUID> parseAccountId(String body) {
        if (body == null || body.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull()) {
                return Optional.empty();
            }
            JsonNode accountId = data.get("accountId");
            if (accountId == null || accountId.isNull() || accountId.asText().isBlank()) {
                return Optional.empty();
            }
            return Optional.of(OpaqueUuidDecoder.decode(accountId.asText()));
        } catch (Exception ex) {
            log.warn("AuthAccountLookupClient.findAccountIdByLoginId 응답 파싱 실패 — msg={}", ex.getMessage());
            return Optional.empty();
        }
    }
}
