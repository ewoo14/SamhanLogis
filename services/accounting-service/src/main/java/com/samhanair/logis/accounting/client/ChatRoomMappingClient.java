package com.samhanair.logis.accounting.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * notification-service 의 단톡방 매핑 lookup client (PR-E2 BE-A9/A10 의존).
 *
 * <p>partner_code → 단톡방 이름 1:N 매핑 조회. 원장/거래명세서 응답에 단톡방 이름 표기.
 *
 * <p>notification-service 의 내부 단톡방 매핑 endpoint
 * ({@code GET /internal/notification/admin/chat-rooms?partnerCode=...}) 를 호출한다.
 * 서비스 간 호출이므로 gateway/admin JWT 경로가 아니라 {@code X-Internal-Token} 인증 경로를 사용한다.
 *
 * <p>fail-soft 패턴 — 404 / 401 / 5xx / 네트워크 모두 empty list 반환. caller (Service) 는
 * 빈 리스트면 chat_room_name 을 "-" 로 fallback 표시.
 *
 * <p>본 client 는 IT 에서 {@code @MockBean} 격리 의무 (memory feedback_it_mockbean_external_clients).
 */
@Component
public class ChatRoomMappingClient {

    private static final Logger log = LoggerFactory.getLogger(ChatRoomMappingClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String NOTIFICATION_SERVICE_BASE = "http://notification-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public ChatRoomMappingClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                                 InternalAuthProperties internalAuthProperties,
                                 ObjectMapper objectMapper) {
        this.restClient = builder.baseUrl(NOTIFICATION_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * partnerCode 로 단톡방 매핑 N건 조회. 매핑 없음 / 외부 오류 모두 empty list 반환.
     *
     * @param partnerCode 거래처코드
     * @return 단톡방 이름 리스트 (정렬 보장 없음)
     */
    public List<String> findChatRoomNamesByPartnerCode(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            return List.of();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("ChatRoomMappingClient — token 미설정 (partnerCode={})", partnerCode);
            return List.of();
        }
        try {
            String body = restClient.get()
                    .uri("/internal/notification/admin/chat-rooms?partnerCode={partnerCode}",
                            partnerCode.trim())
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseNames(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 404) {
                return List.of();
            }
            log.warn("ChatRoomMappingClient — partnerCode={} status={}", partnerCode, status);
            return List.of();
        } catch (Exception ex) {
            log.warn("ChatRoomMappingClient 호출 실패 — partnerCode={}, msg={}",
                    partnerCode, ex.getMessage());
            return List.of();
        }
    }

    /** ApiResponse.data 가 list (단톡방 매핑) 일 때 chatRoomName 추출. */
    private List<String> parseNames(String body) {
        if (body == null || body.isBlank()) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || !data.isArray()) {
                return List.of();
            }
            return data.findValuesAsText("chatRoomName").stream()
                    .filter(s -> s != null && !s.isBlank())
                    .toList();
        } catch (Exception ex) {
            log.warn("ChatRoomMappingClient 응답 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            return List.of();
        }
    }
}
