package com.samhanair.logis.notification.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.notification.NotificationServiceApplication;
import com.samhanair.logis.notification.client.AligoAddressBookClient;
import com.samhanair.logis.notification.client.AligoCsvSourceClient;
import com.samhanair.logis.notification.client.BlockedPartnerLookupClient;
import com.samhanair.logis.notification.client.PartnerLookupClient;
import com.samhanair.logis.notification.client.SlipServiceClient;
import com.samhanair.logis.notification.client.UserClient;
import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.RecipientType;
import com.samhanair.logis.notification.dto.NotificationSendRequest;
import com.samhanair.logis.notification.repository.NotificationLogRepository;
import com.samhanair.logis.notification.repository.NotificationRequestRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * Admin endpoint 권한 / 흐름 시나리오 (5 case).
 *
 * <ol>
 *   <li>발송 (POST /admin/notifications/send) → 201, SENT</li>
 *   <li>이력 조회 (GET /admin/notifications) → 200, 1건</li>
 *   <li>단건 조회 (GET /admin/notifications/{id}) → 200</li>
 *   <li>재시도 — FAILED 상태 fixture seed 후 (POST /admin/notifications/{id}/retry) → 200</li>
 *   <li>미존재 단건 조회 → 404</li>
 * </ol>
 *
 * <p>{@link UserClient} 및 {@link PartnerLookupClient} = {@code @MockBean} 격리
 * (memory feedback_it_mockbean_external_clients — IT 외부 client @MockBean 격리 패턴).
 *
 * <p>{@link PartnerLookupClient} 격리 — PR-D Part 2-3 의 {@code ChatRoomImportService} 가 본
 * client 를 inject 하므로, IT ApplicationContext load 시 본 빈이 필요하다. {@code @MockBean} 명시
 * 등록으로 외부 의존성 격리 + {@code NoopPartnerLookupClient} 의 {@code @ConditionalOnMissingBean}
 * 와의 잠재적 race 회피 (CI run 25605160833 회귀 fix 후속).
 */
@SpringBootTest(classes = NotificationServiceApplication.class)
@AutoConfigureMockMvc
class NotificationAdminControllerIT extends AbstractPostgresIT {

    private static final String MANAGER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000221";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private NotificationRequestRepository requestRepository;
    @Autowired
    private NotificationLogRepository logRepository;

    /** 외부 client 전체 격리 — Eureka 비활성 Testcontainers 환경에서 500 방지. */
    @MockBean private UserClient userClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private BlockedPartnerLookupClient blockedPartnerLookupClient;
    @MockBean private AligoCsvSourceClient aligoCsvSourceClient;
    @MockBean private AligoAddressBookClient aligoAddressBookClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void cleanup() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class),
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(userClient.exists(any())).thenReturn(true);
        lenient().when(userClient.verifyBulk(anyList())).thenAnswer(inv -> {
            List<UUID> ids = inv.getArgument(0);
            Map<UUID, Boolean> r = new HashMap<>();
            for (UUID id : ids) {
                r.put(id, true);
            }
            return r;
        });
        // PartnerLookupClient 기본 stub — 본 IT 는 단톡방 import 를 호출하지 않으므로 모두 empty.
        lenient().when(partnerLookupClient.findPartnerCodeByName(anyString())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.verifyPartnerCode(anyString())).thenReturn(Optional.empty());

        logRepository.deleteAll();
        requestRepository.deleteAll();
    }

    @Test
    void send_returns_201_failed_when_sms_credentials_are_placeholder() throws Exception {
        NotificationSendRequest req = new NotificationSendRequest(
                RecipientType.EXTERNAL_PHONE, null, "010-1111-2222",
                NotificationChannel.SMS, null, null, "테스트 SMS", null);
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/notifications/send")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.status").value("FAILED"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.channel").value("SMS"));
    }

    @Test
    void list_returns_200_with_filter() throws Exception {
        // 1건 발송 후 list 호출
        NotificationSendRequest req = new NotificationSendRequest(
                RecipientType.USER, UUID.randomUUID(), null,
                NotificationChannel.PUSH, null, "list 테스트", "본문", null);
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/notifications/send")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated());

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/notifications")
                        .param("channel", "PUSH")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(1));
    }

    @Test
    void find_one_returns_200() throws Exception {
        NotificationSendRequest req = new NotificationSendRequest(
                RecipientType.EXTERNAL_PHONE, null, "010-2222-3333",
                NotificationChannel.SMS, null, null, "단건", null);
        MvcResult created = mockMvc.perform(MockMvcRequestBuilders.post("/admin/notifications/send")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andReturn();
        String requestId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("requestId").asText();
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/notifications/" + requestId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.requestId").value(requestId));
    }

    @Test
    void retry_after_marking_failed_returns_200() throws Exception {
        // 1) 발송 (성공) — repository 직접 fail 마킹
        NotificationSendRequest req = new NotificationSendRequest(
                RecipientType.EXTERNAL_PHONE, null, "010-3333-4444",
                NotificationChannel.SMS, null, null, "retry case", null);
        MvcResult created = mockMvc.perform(MockMvcRequestBuilders.post("/admin/notifications/send")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andReturn();
        String requestId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("requestId").asText();

        // 2) FAILED 상태로 직접 전이 (테스트 fixture)
        var entity = requestRepository.findById(UUID.fromString(requestId)).orElseThrow();
        entity.markFailed(false);
        requestRepository.save(entity);

        // 3) retry 호출 → 200, status=SENT 또는 RETRYING (FCM stub-success 라 SENT 가능)
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/notifications/" + requestId + "/retry")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true));
    }

    @Test
    void find_one_missing_returns_404() throws Exception {
        UUID missing = UUID.randomUUID();
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/notifications/" + missing)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isNotFound())
                .andExpect(MockMvcResultMatchers.jsonPath("$.code").value("NOT_FOUND"));
    }

    /**
     * post-W5 backlog cleanup (Q-W3-2, D-P9-21) — payload @Size(max=4000) 검증.
     *
     * <p>4001 byte payload 입력 → @Valid binding 실패 → 400 INVALID_INPUT 반환.
     * Postgres TOAST 임계 회피 + 비정상 페이로드 입력 차단 일관.
     *
     * <p>post-W5 종합 fix (QA-1, D-P9-21) — 4001 byte fixture 1줄 압축.
     * ASCII 'a' 만 사용하므로 char length == byte length (UTF-8 1 byte) → 4001 char = 4001 byte.
     */
    @Test
    void send_payloadOver4000Bytes_returns400() throws Exception {
        // post-W5 종합 fix (QA-1) — 4001 byte oversize payload (ASCII 'a' 4001 char = 4001 byte UTF-8)
        String oversize = "a".repeat(4001);

        NotificationSendRequest req = new NotificationSendRequest(
                RecipientType.EXTERNAL_PHONE, null, "010-9999-0000",
                NotificationChannel.SMS, null, null, "payload size case", oversize);

        mockMvc.perform(MockMvcRequestBuilders.post("/admin/notifications/send")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isBadRequest())
                .andExpect(MockMvcResultMatchers.jsonPath("$.code").value("INVALID_INPUT"));
    }
}
