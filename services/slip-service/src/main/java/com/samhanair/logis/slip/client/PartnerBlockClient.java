package com.samhanair.logis.slip.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * partner-service 발송금지 거래처 lookup client — PR-E1 BE-A5 (next-day-image-data) 신규.
 *
 * <p>다음날자 전표 이미지 endpoint 가 partner_code 별로 BLOCK 발송금지 여부를 표시할 때 사용.
 * partner-service 의 admin endpoint
 * {@code GET /api/v1/partners/admin/blocks?page=0&size=200} 호출. 응답에서 partner_code 만
 * 추출하여 Set 으로 반환 — service 가 빠른 contains 체크.
 *
 * <p>참고: 본 client 는 단일 호출로 page 1만 조회 (size=200). 일반적으로 BLOCK 거래처 수가 < 200
 * 이므로 한 페이지에 모두 포함. 1000건 이상 운영 시점에 page loop 추가 (현 슬라이스 미적용 — 단순화).
 *
 * <p>인증 = X-Internal-Token + ROLE_MASTER 권한. partner-service 측 PreAuthorize 가 요구.
 *
 * <p>오류 처리 (graceful fallback):
 * <ul>
 *   <li>4xx → empty Set (BLOCK 표시 안 함). 발송 진행 책임은 호출자.</li>
 *   <li>5xx / 연결 실패 → empty Set + warn log.</li>
 *   <li>internal token 미설정 → empty Set + warn log.</li>
 * </ul>
 *
 * <p>timeout — connect 2s / read 3s.
 */
@Component
public class PartnerBlockClient {

    private static final Logger log = LoggerFactory.getLogger(PartnerBlockClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String PARTNER_SERVICE_BASE = "http://partner-service";
    private static final int BULK_PAGE_SIZE = 200;

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public PartnerBlockClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                              InternalAuthProperties internalAuthProperties,
                              ObjectMapper objectMapper) {
        this.restClient = builder.build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * BLOCK 발송금지 거래처 partner_code 전체 lookup — Set 반환.
     *
     * @return 활성 BLOCK 의 partner_code Set. 미설정/오류 시 empty Set.
     */
    public Set<String> findAllBlockedPartnerCodes() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("PartnerBlockClient.findAllBlockedPartnerCodes — app.security.internal.token 미설정, empty 반환");
            return Collections.emptySet();
        }
        try {
            String body = restClient.get()
                    .uri(PARTNER_SERVICE_BASE + "/internal/partners/admin/blocks?page=0&size={size}",
                            BULK_PAGE_SIZE)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parsePartnerCodes(body);
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().is5xxServerError()) {
                log.warn("PartnerBlockClient.findAllBlockedPartnerCodes 5xx — status={}", ex.getStatusCode());
            } else {
                log.debug("PartnerBlockClient.findAllBlockedPartnerCodes 4xx — status={}", ex.getStatusCode());
            }
            return Collections.emptySet();
        } catch (Exception ex) {
            log.warn("PartnerBlockClient.findAllBlockedPartnerCodes 호출 실패 — msg={}", ex.getMessage());
            return Collections.emptySet();
        }
    }

    /**
     * partner-service 의 Page<BlockedPartnerResponse> 응답 wrapper 에서 partner_code Set 추출.
     */
    private Set<String> parsePartnerCodes(String body) {
        if (body == null || body.isBlank()) {
            return Collections.emptySet();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull()) {
                return Collections.emptySet();
            }
            // Page wrapper: { content: [...], totalElements: ... }
            JsonNode content = data.has("content") ? data.get("content") : data;
            if (content == null || !content.isArray()) {
                return Collections.emptySet();
            }
            Set<String> codes = new HashSet<>();
            for (JsonNode node : content) {
                JsonNode codeNode = node.get("partnerCode");
                if (codeNode != null && !codeNode.isNull() && !codeNode.asText().isBlank()) {
                    codes.add(codeNode.asText());
                }
                JsonNode nameNode = node.get("businessNameSnapshot");
                if (nameNode != null && !nameNode.isNull() && !nameNode.asText().isBlank()) {
                    codes.add(legacyNameKey(nameNode.asText()));
                }
            }
            return codes;
        } catch (Exception ex) {
            log.warn("PartnerBlockClient response 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            return Collections.emptySet();
        }
    }

    /**
     * 단일 partner_code 의 BLOCK 여부 단건 조회 (선택적 helper, list 미가용 환경 대비).
     * 본 슬라이스에서는 미사용 — Set bulk lookup 우선.
     *
     * @param partnerCode 거래처코드
     * @return 활성 BLOCK 시 true, 그 외 false
     */
    public boolean isBlocked(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            return false;
        }
        return findAllBlockedPartnerCodes().contains(partnerCode);
    }

    /**
     * service 레이어 helper — 응답 list 를 Set 으로 변환 (List<BlockedPartnerResponse> shape).
     */
    static Set<String> toCodeSet(List<String> codes) {
        return codes == null ? Collections.emptySet() : new HashSet<>(codes);
    }

    public static String legacyNameKey(String partnerName) {
        if (partnerName == null || partnerName.isBlank()) {
            return "";
        }
        StringBuilder sb = new StringBuilder("NAME:");
        partnerName.trim().codePoints()
                .filter(Character::isLetterOrDigit)
                .map(Character::toLowerCase)
                .forEach(cp -> sb.appendCodePoint(cp));
        return sb.toString();
    }
}
