package com.samhanair.logis.slip.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * notification-service 호출 client — PR-E1 BE-A5 (next-day-image-data) 신규.
 *
 * <p>다음날자 전표 이미지 endpoint 가 partner_code 별로 단톡방 (chat_room_name) 을 lookup 할 때 사용.
 * notification-service 의 admin endpoint
 * {@code GET /api/v1/notification/admin/chat-rooms?partnerCode=...} 호출. 응답에서 chat_room_name 만
 * 추출 (1 거래처 N 단톡방 — 모두 묶어 반환).
 *
 * <p>인증 = X-Internal-Token (notification-service 의 InternalTokenFilter 가 ROLE_MASTER 부여).
 *
 * <p>오류 처리 (graceful fallback) — PartnerInternalClient 패턴 동일:
 * <ul>
 *   <li>4xx → empty list. 호출자가 "단톡방 미매핑" 으로 표시.</li>
 *   <li>5xx / 연결 실패 → empty list + warn log. next-day 이미지 생성은 진행.</li>
 *   <li>internal token 미설정 → empty list + warn log.</li>
 * </ul>
 *
 * <p>timeout (DV-1 일관) — connect 2s / read 3s.
 */
@Component
public class NotificationChatRoomClient {

    private static final Logger log = LoggerFactory.getLogger(NotificationChatRoomClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String NOTIFICATION_SERVICE_BASE = "http://notification-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public NotificationChatRoomClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                                       InternalAuthProperties internalAuthProperties,
                                       ObjectMapper objectMapper) {
        this.restClient = builder.build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * partnerCode → 매핑된 chat_room_name 리스트 lookup.
     *
     * @param partnerCode 거래처코드 (예: "P-2026-0001")
     * @return 매핑된 chat_room_name 0..N 건. 미매핑 / 5xx / 토큰 미설정 시 빈 리스트.
     */
    public List<String> findChatRoomNames(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            return Collections.emptyList();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("NotificationChatRoomClient.findChatRoomNames — app.security.internal.token 미설정, empty 반환 (partnerCode={})",
                    partnerCode);
            return Collections.emptyList();
        }
        try {
            String body = restClient.get()
                    .uri(NOTIFICATION_SERVICE_BASE
                            + "/internal/notification/admin/chat-rooms?partnerCode={partnerCode}", partnerCode)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseChatRoomNames(body);
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().is5xxServerError()) {
                log.warn("NotificationChatRoomClient.findChatRoomNames 5xx — partnerCode={}, status={}",
                        partnerCode, ex.getStatusCode());
            } else {
                log.debug("NotificationChatRoomClient.findChatRoomNames 4xx — partnerCode={}, status={}",
                        partnerCode, ex.getStatusCode());
            }
            return Collections.emptyList();
        } catch (Exception ex) {
            log.warn("NotificationChatRoomClient.findChatRoomNames 호출 실패 — partnerCode={}, msg={}",
                    partnerCode, ex.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * partnerCode 조회가 비면 legacy Notion 의 사업자명 alias 로 한 번 더 조회한다.
     */
    public List<String> findChatRoomNames(String partnerCode, String partnerName) {
        List<String> byCode = findChatRoomNames(partnerCode);
        if (!byCode.isEmpty() || partnerName == null || partnerName.isBlank()) {
            return byCode;
        }
        return findChatRoomNamesByPartnerBusinessName(partnerName);
    }

    private List<String> findChatRoomNamesByPartnerBusinessName(String partnerName) {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("NotificationChatRoomClient.findChatRoomNamesByPartnerBusinessName internal token missing");
            return Collections.emptyList();
        }
        try {
            String body = restClient.get()
                    .uri(NOTIFICATION_SERVICE_BASE
                                    + "/internal/notification/admin/chat-rooms?partnerBusinessName={partnerName}",
                            partnerName)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseChatRoomNames(body);
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().is5xxServerError()) {
                log.warn("NotificationChatRoomClient.findChatRoomNamesByPartnerBusinessName 5xx — status={}",
                        ex.getStatusCode());
            } else {
                log.debug("NotificationChatRoomClient.findChatRoomNamesByPartnerBusinessName 4xx — status={}",
                        ex.getStatusCode());
            }
            return Collections.emptyList();
        } catch (Exception ex) {
            log.warn("NotificationChatRoomClient.findChatRoomNamesByPartnerBusinessName 호출 실패 — msg={}",
                    ex.getMessage());
            return Collections.emptyList();
        }
    }

    private List<String> parseChatRoomNames(String body) {
        if (body == null || body.isBlank()) {
            return Collections.emptyList();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull() || !data.isArray()) {
                return Collections.emptyList();
            }
            List<String> names = new ArrayList<>();
            for (JsonNode node : data) {
                JsonNode nameNode = node.get("chatRoomName");
                if (nameNode != null && !nameNode.isNull() && !nameNode.asText().isBlank()) {
                    names.add(nameNode.asText());
                }
            }
            return names;
        } catch (Exception ex) {
            log.warn("NotificationChatRoomClient response 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            return Collections.emptyList();
        }
    }
}
