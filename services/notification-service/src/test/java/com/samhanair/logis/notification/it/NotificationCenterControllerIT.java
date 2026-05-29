package com.samhanair.logis.notification.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.notification.NotificationServiceApplication;
import com.samhanair.logis.notification.client.AligoAddressBookClient;
import com.samhanair.logis.notification.client.AligoCsvSourceClient;
import com.samhanair.logis.notification.client.BlockedPartnerLookupClient;
import com.samhanair.logis.notification.client.PartnerLookupClient;
import com.samhanair.logis.notification.client.SlipServiceClient;
import com.samhanair.logis.notification.client.UserClient;
import com.samhanair.logis.notification.domain.NotificationCenter;
import com.samhanair.logis.notification.domain.NotificationSeverity;
import com.samhanair.logis.notification.repository.NotificationCenterRepository;
import com.samhanair.logis.notification.web.dto.NotificationPublishRequest;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.assertj.core.api.Assertions;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Issue 4 Slice 1 — NotificationCenterController IT.
 *
 * <ol>
 *   <li>POST /internal/notifications — X-Internal-Token 으로 알림 INSERT</li>
 *   <li>POST /internal/notifications — target_role + target_user_id 동시 지정 거절</li>
 *   <li>POST /internal/notifications — X-Internal-Token 누락 거절</li>
 *   <li>GET /notifications/my — MASTER role 알림만 노출 (다른 role 제외)</li>
 *   <li>GET /notifications/my — target_user_id 매칭 row 포함</li>
 *   <li>POST /notifications/{id}/acknowledge — read_at 설정 + idempotent</li>
 *   <li>GET /notifications/history — Pageable + page response</li>
 * </ol>
 *
 * <p>외부 client 격리 — Eureka 비활성 환경 ApplicationContext load 500 방지.
 */
@SpringBootTest(classes = NotificationServiceApplication.class)
@AutoConfigureMockMvc
class NotificationCenterControllerIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private NotificationCenterRepository repository;

    @MockBean private UserClient userClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private BlockedPartnerLookupClient blockedPartnerLookupClient;
    @MockBean private AligoCsvSourceClient aligoCsvSourceClient;
    @MockBean private AligoAddressBookClient aligoAddressBookClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    private UUID masterUserId;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
        masterUserId = UUID.randomUUID();
        lenient().when(userClient.exists(any())).thenReturn(true);
        lenient().when(userClient.verifyBulk(anyList())).thenAnswer(inv -> {
            List<UUID> ids = inv.getArgument(0);
            Map<UUID, Boolean> r = new HashMap<>();
            for (UUID id : ids) {
                r.put(id, true);
            }
            return r;
        });
        lenient().when(partnerLookupClient.findPartnerCodeByName(anyString())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.verifyPartnerCode(anyString())).thenReturn(Optional.empty());

        repository.deleteAll();
    }

    @Test
    @DisplayName("POST /internal/notifications — X-Internal-Token 으로 알림 INSERT + ID 반환")
    void publish_internalToken_inserts() throws Exception {
        NotificationPublishRequest req = new NotificationPublishRequest(
                "SAFETY_STOCK", NotificationSeverity.WARNING,
                "AJ056 부족", null,
                List.of("MASTER", "MANAGER"), null,
                "inventory-service", "product-1+wh-A",
                "/inventory/safety-stock-alerts");

        mockMvc.perform(post("/internal/notifications")
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").isNotEmpty());
    }

    @Test
    @DisplayName("POST /internal/notifications — target_role + target_user_id 동시 지정 시 400")
    void publish_bothTargetRoleAndUserId_rejected() throws Exception {
        Map<String, Object> req = Map.of(
                "channel", "MESSENGER",
                "severity", "INFO",
                "title", "중복 대상 지정",
                "targetRole", List.of("MASTER"),
                "targetUserId", masterUserId,
                "sourceService", "groupware-service",
                "sourceRefId", "msg-invalid"
        );

        mockMvc.perform(post("/internal/notifications")
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    @DisplayName("POST /internal/notifications — X-Internal-Token 누락 시 user header 위조도 거절")
    void publish_missingInternalToken_rejected() throws Exception {
        Map<String, Object> req = Map.of(
                "channel", "SAFETY_STOCK",
                "severity", "WARNING",
                "title", "토큰 누락",
                "targetRole", List.of("MASTER"),
                "sourceService", "inventory-service",
                "sourceRefId", "missing-token"
        );

        mockMvc.perform(post("/internal/notifications")
                        .header("X-User-Id", masterUserId.toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(result -> Assertions.assertThat(result.getResponse().getStatus()).isIn(401, 403));
    }

    @Test
    @DisplayName("GET /notifications/my — MASTER role 알림만 노출 (다른 role 제외)")
    void findMyUnread_filtersByRole() throws Exception {
        repository.save(NotificationCenter.publish(
                "SAFETY_STOCK", NotificationSeverity.WARNING,
                "MASTER 대상", null,
                List.of("MASTER"), null,
                "inventory-service", "ref-1", null));
        repository.save(NotificationCenter.publish(
                "MESSENGER", NotificationSeverity.INFO,
                "SALES 대상", null,
                List.of("SALES"), null,
                "groupware-service", "ref-2", null));

        mockMvc.perform(get("/notifications/my")
                        .header("X-User-Id", masterUserId.toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", Matchers.hasSize(1)))
                .andExpect(jsonPath("$.data[0].title").value("MASTER 대상"));
    }

    @Test
    @DisplayName("GET /notifications/my — TEXT[] 다중 role 중 MANAGER 매칭 row 노출")
    void findMyUnread_csvMultipleRoles_includesAllMatches() throws Exception {
        Map<String, Object> req = Map.of(
                "channel", "SAFETY_STOCK",
                "severity", "WARNING",
                "title", "MASTER/MANAGER 대상",
                "targetRole", List.of("MASTER", "MANAGER"),
                "sourceService", "inventory-service",
                "sourceRefId", "ref-multi-role"
        );

        mockMvc.perform(post("/internal/notifications")
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/notifications/my")
                        .header("X-User-Id", masterUserId.toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", Matchers.hasSize(1)))
                .andExpect(jsonPath("$.data[0].title").value("MASTER/MANAGER 대상"));
    }

    @Test
    @DisplayName("GET /notifications/my — target_user_id 매칭 row 포함")
    void findMyUnread_includesUserIdMatch() throws Exception {
        repository.save(NotificationCenter.publish(
                "MESSENGER", NotificationSeverity.INFO,
                "메시지", null,
                null, masterUserId,
                "groupware-service", "msg-1", null));

        mockMvc.perform(get("/notifications/my")
                        .header("X-User-Id", masterUserId.toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", Matchers.hasSize(1)));
    }

    @Test
    @DisplayName("POST /notifications/{id}/acknowledge — read_at 설정 + 두 번째 호출 idempotent")
    void acknowledge_idempotent() throws Exception {
        NotificationCenter saved = repository.save(NotificationCenter.publish(
                "SAFETY_STOCK", NotificationSeverity.WARNING,
                "test", null,
                List.of("MASTER"), null,
                "inventory-service", "ref-1", null));

        mockMvc.perform(post("/notifications/{id}/acknowledge", saved.getId())
                        .header("X-User-Id", masterUserId.toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk());

        // 두 번째 호출도 200 (idempotent)
        mockMvc.perform(post("/notifications/{id}/acknowledge", saved.getId())
                        .header("X-User-Id", masterUserId.toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET /notifications/history — Pageable 적용 + page response")
    void findMyHistory_pagedResponse() throws Exception {
        for (int i = 0; i < 5; i++) {
            repository.save(NotificationCenter.publish(
                    "SAFETY_STOCK", NotificationSeverity.WARNING,
                    "title " + i, null,
                    List.of("MASTER"), null,
                    "inventory-service", "ref-" + i, null));
        }

        mockMvc.perform(get("/notifications/history")
                        .header("X-User-Id", masterUserId.toString())
                        .header("X-User-Role", "MASTER")
                        .param("size", "3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(5))
                .andExpect(jsonPath("$.data.content", Matchers.hasSize(3)));
    }
}
