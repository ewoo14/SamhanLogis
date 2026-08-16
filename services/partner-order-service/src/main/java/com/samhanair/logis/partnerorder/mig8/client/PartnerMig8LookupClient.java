package com.samhanair.logis.partnerorder.mig8.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.partnerorder.client.OpaqueUuidDecoder;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * partner-service {@code GET /internal/partners/{id}/summary} client.
 *
 * <p>실 수신 계약 = partner-service {@code PartnerInternalResponse(partnerId, partnerCode, name,
 * bizNo, creditLimit, outstandingBalance, status)}. 사업자등록번호 필드명은 {@code bizNo} 뿐이다 —
 * PR #746(#22) 라운드1 이전에는 본 필드가 partner-service 응답에 부재해 {@link #parseSummary}
 * 가 항상 empty 를 반환했고, 결과적으로 MIG-8 partner-order 이식이 100% partner lookup miss 로
 * reject 되었다 (partner-service 측 {@code PartnerInternalResponse} 에 bizNo 추가로 해소).
 */
@Component
public class PartnerMig8LookupClient {

    private static final Logger log = LoggerFactory.getLogger(PartnerMig8LookupClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String PARTNER_SERVICE_BASE = "http://partner-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public PartnerMig8LookupClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                                   InternalAuthProperties internalAuthProperties,
                                   ObjectMapper objectMapper) {
        this.restClient = builder.baseUrl(PARTNER_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    public Optional<PartnerMig8Summary> findByPartnerId(UUID partnerId) {
        if (partnerId == null) {
            return Optional.empty();
        }
        try {
            String body = restClient.get()
                    .uri("/internal/partners/{id}/summary", partnerId)
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .retrieve()
                    .body(String.class);
            return parseSummary(body);
        } catch (BusinessException ex) {
            throw ex;
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 401 || status == 403) {
                throw new BusinessException(ErrorCode.FORBIDDEN,
                        "partner-service 내부 lookup 인증 실패", ex);
            }
            log.warn("PartnerMig8LookupClient fail-soft — partnerId={} status={}", partnerId, status);
            return Optional.empty();
        } catch (RuntimeException ex) {
            log.warn("PartnerMig8LookupClient 호출 실패 — partnerId={} msg={}",
                    partnerId, ex.getMessage());
            return Optional.empty();
        }
    }

    private Optional<PartnerMig8Summary> parseSummary(String body) {
        if (body == null || body.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            UUID partnerId = uuid(data, "partnerId", "id");
            String partnerCode = text(data, "partnerCode");
            // 실 수신 필드명은 PartnerInternalResponse.bizNo 하나뿐 — 존재하지 않는 별칭 키를
            // 다수 나열하면 실제 계약불일치를 은폐할 위험이 있어 정확한 키만 조회한다.
            String bizCode = text(data, "bizNo");
            String name = text(data, "name", "partnerName", "businessName");
            if (partnerId == null || partnerCode == null || bizCode == null) {
                return Optional.empty();
            }
            return Optional.of(new PartnerMig8Summary(partnerId, partnerCode, bizCode, name));
        } catch (RuntimeException | java.io.IOException ex) {
            log.warn("PartnerMig8LookupClient response parse 실패 — msg={}", ex.getMessage());
            return Optional.empty();
        }
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "samhan.internal-token 미설정");
        }
        return token;
    }

    private static String text(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode value = node.get(key);
            if (value != null && !value.isNull() && !value.asText().isBlank()) {
                return value.asText();
            }
        }
        return null;
    }

    private static UUID uuid(JsonNode node, String... keys) {
        String value = text(node, keys);
        return value == null ? null : OpaqueUuidDecoder.decode(value);
    }
}
