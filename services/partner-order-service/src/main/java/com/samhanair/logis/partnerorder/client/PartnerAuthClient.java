package com.samhanair.logis.partnerorder.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * M2 partner-auth-service (8091) RPC client — JWT 검증 + tutorial state proxy.
 *
 * <p>거래처 JWT 는 gateway 가 1차 검증 후 X-User-Id 헤더 주입. 본 client 는 추가로:
 * <ul>
 *   <li>{@code GET /api/v1/auth/partner-status?bizNo=...} — 잠금 상태 확인 (운영용)</li>
 *   <li>{@code PATCH /api/v1/auth/partner-tutorial} — tutorial state proxy (M2 가 권위, 본 서비스 mirror)</li>
 * </ul>
 *
 * <p>회로 차단기 인스턴스: {@code partnerAuthClient}.
 */
@Component
public class PartnerAuthClient {

    private static final Logger log = LoggerFactory.getLogger(PartnerAuthClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String PARTNER_AUTH_BASE = "http://partner-auth-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    @Autowired
    public PartnerAuthClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                             InternalAuthProperties internalAuthProperties) {
        this.restClient = builder.baseUrl(PARTNER_AUTH_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
    }

    PartnerAuthClient(RestClient restClient, InternalAuthProperties internalAuthProperties) {
        this.restClient = restClient;
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * 거래처 잠금 상태 검증 — confirm 흐름 진입 직전에 호출 (선택). 200 정상,
     * 423 LOCKED 또는 404 NOT_FOUND 시 BusinessException 으로 변환.
     *
     * @param partnerCode 거래처 코드
     * @return partner-auth 응답 Map (status 등)
     */
    public Map<String, Object> verifyPartner(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "partnerCode 필수");
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> body = restClient.get()
                    .uri("/api/v1/auth/partner-status?partnerCode={p}", partnerCode)
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.FORBIDDEN,
                                "거래처 인증 실패: " + res.getStatusCode());
                    })
                    .body(Map.class);
            return body == null ? Map.of() : body;
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("PartnerAuthClient verify failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "partner-auth-service 호출 실패", ex);
        }
    }

    /**
     * tutorial state PATCH proxy — M2 가 권위, 본 서비스는 mirror 만 보관.
     *
     * @param partnerCode 거래처 코드
     * @param completed true 시 endTut 처리
     */
    public void patchTutorialState(String partnerCode, boolean completed) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "partnerCode 필수");
        }
        Map<String, Object> body = Map.of(
                "partnerCode", partnerCode,
                "completed", completed);
        try {
            restClient.patch()
                    .uri("/api/v1/auth/partner-tutorial")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RuntimeException ex) {
            log.warn("PartnerAuthClient tutorial PATCH fail-soft: {}", ex.getMessage());
            // fail-soft — local mirror 는 별도로 갱신
        }
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "samhan.internal-token 미설정");
        }
        return token;
    }
}
