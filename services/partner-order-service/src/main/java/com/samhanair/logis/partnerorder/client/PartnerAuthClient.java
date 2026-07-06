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
 *   <li>{@code GET /api/v1/auth/partner-status?bizNo=...} — 잠금 상태 확인 (운영용). 수신측
 *       {@code PartnerAuthController.partnerStatus(@RequestParam bizNo)} 계약과 정합 — 거래처
 *       코드(partnerCode) 가 아닌 사업자등록번호(bizNo) 로 조회한다.</li>
 *   <li>{@code PATCH /api/v1/auth/partner-tutorial} — tutorial state proxy (M2 가 권위, 본 서비스
 *       mirror). 수신측 {@code TutorialUpdateRequest(bizNo, platform, done)} 계약과 정합.</li>
 * </ul>
 *
 * <p>PR #746(#22) 라운드1 fix — 두 메서드 모두 이전에는 partnerCode/completed 를 전송해 수신측
 * 계약(bizNo 쿼리, {bizNo,platform,done} 바디)과 불일치했다. 호출측 {@code TutorialStateService}
 * 가 partnerCode → bizNo 를 해소해 전달한다.
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
     * <p>수신측 {@code PartnerAuthController.partnerStatus} 는 {@code bizNo}(사업자등록번호)
     * 쿼리 파라미터를 요구한다 — partnerCode 가 아니다.
     *
     * @param bizNo 사업자등록번호
     * @return partner-auth 응답 Map (status 등)
     */
    public Map<String, Object> verifyPartner(String bizNo) {
        if (bizNo == null || bizNo.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "bizNo 필수");
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> body = restClient.get()
                    .uri("/api/v1/auth/partner-status?bizNo={b}", bizNo)
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
     * <p>수신측 {@code TutorialUpdateRequest} 계약: {@code bizNo}(NotBlank) /
     * {@code platform}("PC"|"MOBILE") / {@code done}(NotNull). partnerCode 가 아닌 bizNo 를 전송한다.
     *
     * @param bizNo 사업자등록번호
     * @param platform "PC" 또는 "MOBILE"
     * @param done true 시 endTut 처리
     */
    public void patchTutorialState(String bizNo, String platform, boolean done) {
        if (bizNo == null || bizNo.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "bizNo 필수");
        }
        Map<String, Object> body = Map.of(
                "bizNo", bizNo,
                "platform", platform,
                "done", done);
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
