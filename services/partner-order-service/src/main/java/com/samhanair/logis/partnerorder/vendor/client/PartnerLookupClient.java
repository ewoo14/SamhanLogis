package com.samhanair.logis.partnerorder.vendor.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.partnerorder.client.OpaqueUuidDecoder;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * partner-service internal endpoint 호출 client.
 *
 * <p>{@code GET /internal/partners/{partnerCode}} 호출 → {@link PartnerSummary} 반환.
 * accounting-service 의 {@code PartnerLookupClient} 패턴을 답습한 fail-soft —
 * 404 / 401 / 5xx / 네트워크 모두 empty 반환 (caller 가 fallback 처리).
 *
 * <p>실 수신 계약 = partner-service {@code PartnerInternalResponse(partnerId, partnerCode, name,
 * bizNo, creditLimit, outstandingBalance, status)}. 사업자번호 필드명은 {@code bizNo} 뿐이다 —
 * PR #746(#22) 라운드1 fix 전에는 {@code businessNo}/{@code businessRegistrationNumber} 등
 * 실제로 존재하지 않는 별칭만 조회해 {@link PartnerSummary#businessNo()} 가 항상 null 이었다
 * (TutorialStateService 의 bizNo 해소가 본 client 를 사용하므로 직접 연쇄 영향).
 *
 * <p>인증 = X-Internal-Token. IT 에서 {@code @MockBean} 격리 의무
 * (memory feedback_it_mockbean_external_clients).
 */
@Component
public class PartnerLookupClient {

    private static final Logger log = LoggerFactory.getLogger(PartnerLookupClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String PARTNER_SERVICE_BASE = "http://partner-service";
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(2);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public PartnerLookupClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                               InternalAuthProperties internalAuthProperties,
                               ObjectMapper objectMapper) {
        // partner-service가 연결 후 응답을 멈춰도 주문 확정 트랜잭션을 장시간 점유하지 않도록
        // 이 client에만 제한시간을 적용한다. 공유 LoadBalanced builder는 clone해 다른 외부
        // client의 transport 설정을 변이시키지 않는다.
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout((int) CONNECT_TIMEOUT.toMillis());
        requestFactory.setReadTimeout((int) READ_TIMEOUT.toMillis());
        this.restClient = builder.clone()
                .baseUrl(PARTNER_SERVICE_BASE)
                .requestFactory(requestFactory)
                .build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * partnerCode 로 거래처 단건 조회. 미존재(404)/토큰오류(401)/5xx 모두 empty 반환.
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
            log.warn("PartnerLookupClient — X-Internal-Token 미설정, lookup skip (partnerCode={})",
                    partnerCode);
            return Optional.empty();
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
            log.warn("PartnerLookupClient — partnerCode={} status={}", partnerCode, status);
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("PartnerLookupClient 호출 실패 — partnerCode={}, msg={}",
                    partnerCode, ex.getMessage());
            return Optional.empty();
        }
    }

    /**
     * 주문 정체성 확정용 조회.
     *
     * <p>404는 사용자가 입력한 코드에 대응하는 거래처가 없는 입력 오류 후보이므로 empty를
     * 반환한다. 그 외 응답 오류·네트워크 오류·유효하지 않은 성공 본문은
     * {@link PartnerLookupUnavailableException}으로 보존한다. 목록/표시 조회의 기존
     * fail-soft {@link #findByPartnerCode(String)} 계약은 변경하지 않는다.
     *
     * @param partnerCode 거래처 코드
     * @return 존재하지 않으면 empty, 정상 조회면 snapshot
     * @throws PartnerLookupUnavailableException partner-service 장애 또는 계약 위반
     */
    public Optional<PartnerSummary> findByPartnerCodeForIdentity(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            return Optional.empty();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new PartnerLookupUnavailableException("X-Internal-Token 미설정");
        }
        try {
            String body = restClient.get()
                    .uri("/internal/partners/{partnerCode}", partnerCode.trim())
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            Optional<PartnerSummary> result = parseSummary(body);
            if (result.isEmpty()) {
                throw new PartnerLookupUnavailableException("partner-service 응답 본문이 유효하지 않음");
            }
            if (result.get().businessNo() == null || result.get().businessNo().isBlank()) {
                throw new PartnerLookupUnavailableException(
                        "partner-service 응답에 businessNo(bizNo)가 없음");
            }
            return result;
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 404) {
                return Optional.empty();
            }
            throw new PartnerLookupUnavailableException(
                    "partner-service status=" + ex.getStatusCode().value(), ex);
        } catch (PartnerLookupUnavailableException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new PartnerLookupUnavailableException("partner-service 호출 실패", ex);
        }
    }

    /** 정체성 확정 호출에서 다운스트림 장애를 입력 오류와 구분하기 위한 예외. */
    public static class PartnerLookupUnavailableException extends RuntimeException {

        public PartnerLookupUnavailableException(String message) {
            super(message);
        }

        public PartnerLookupUnavailableException(String message, Throwable cause) {
            super(message, cause);
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
            // 실 수신 필드명은 PartnerInternalResponse.bizNo 하나뿐 (존재하지 않는 별칭 나열 금지).
            String businessNo = textOrNull(data, "bizNo");
             // partnerCode만 있는 응답은 거래처 정체성 계약을 충족하지 않는다. 이를 summary로
             // 인정하면 caller가 400(입력오류) 또는 성공으로 잘못 분기할 수 있다.
             if (partnerId == null || partnerCode == null || partnerCode.isBlank()) {
                return Optional.empty();
            }
            return Optional.of(new PartnerSummary(partnerId, partnerCode, name, businessNo));
        } catch (Exception ex) {
            log.warn("PartnerLookupClient response 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            return Optional.empty();
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
                    return OpaqueUuidDecoder.decode(n.asText());
                } catch (IllegalArgumentException ignore) {
                    return null;
                }
            }
        }
        return null;
    }
}
