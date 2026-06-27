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
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * Internal endpoint 인증 / 발송 / 상태 조회 시나리오 (4 case).
 *
 * <ol>
 *   <li>X-Internal-Token 누락 → 401 (Spring Security authentication entrypoint)</li>
 *   <li>X-Internal-Token 불일치 → 401 (InternalTokenFilter 직접 응답)</li>
 *   <li>X-Internal-Token 일치 + 발송 → 201, status=SENT (FCM stub-success)</li>
 *   <li>X-Internal-Token 일치 + 미존재 lookup → 404</li>
 * </ol>
 *
 * <p>{@link UserClient} 및 {@link PartnerLookupClient} = {@code @MockBean} 격리
 * (memory feedback_it_mockbean_external_clients).
 *
 * <p>{@link PartnerLookupClient} 격리 — PR-D Part 2-3 의 {@code ChatRoomImportService} 가 본
 * client 를 inject 하므로, IT ApplicationContext load 시 본 빈이 필요하다. {@code @MockBean} 명시
 * 등록으로 외부 의존성 격리 + {@code NoopPartnerLookupClient} 의 {@code @ConditionalOnMissingBean}
 * 와의 잠재적 race 회피 (CI run 25605160833 회귀 fix 후속).
 */
@SpringBootTest(classes = NotificationServiceApplication.class)
@AutoConfigureMockMvc
class NotificationInternalControllerIT extends AbstractPostgresIT {

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

    @BeforeEach
    void cleanup() {
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
    void send_without_token_returns_401() throws Exception {
        NotificationSendRequest req = new NotificationSendRequest(
                RecipientType.EXTERNAL_PHONE, null, "010-1234-5678",
                NotificationChannel.SMS, null, null, "본문", null);
        mockMvc.perform(MockMvcRequestBuilders.post("/internal/notifications/send")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isUnauthorized())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(false))
                .andExpect(MockMvcResultMatchers.jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void send_with_invalid_token_returns_401() throws Exception {
        NotificationSendRequest req = new NotificationSendRequest(
                RecipientType.EXTERNAL_PHONE, null, "010-1234-5678",
                NotificationChannel.SMS, null, null, "본문", null);
        mockMvc.perform(MockMvcRequestBuilders.post("/internal/notifications/send")
                        .header("X-Internal-Token", "wrong-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isUnauthorized());
    }

    @Test
    void send_with_valid_token_returns_201_and_sent_status() throws Exception {
        NotificationSendRequest req = new NotificationSendRequest(
                RecipientType.USER, UUID.randomUUID(), null,
                NotificationChannel.PUSH, null, "안내", "본문", null);
        mockMvc.perform(MockMvcRequestBuilders.post("/internal/notifications/send")
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andExpect(MockMvcResultMatchers.jsonPath("$.success").value(true))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.status").value("SENT"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.channel").value("PUSH"));
    }

    @Test
    void status_lookup_missing_returns_404() throws Exception {
        UUID missing = UUID.randomUUID();
        mockMvc.perform(MockMvcRequestBuilders.get("/internal/notifications/" + missing + "/status")
                        .header("X-Internal-Token", "test-internal-token"))
                .andExpect(MockMvcResultMatchers.status().isNotFound())
                .andExpect(MockMvcResultMatchers.jsonPath("$.code").value("NOT_FOUND"));
    }
}
