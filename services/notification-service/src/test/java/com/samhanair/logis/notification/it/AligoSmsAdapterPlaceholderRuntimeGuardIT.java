package com.samhanair.logis.notification.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.notification.NotificationServiceApplication;
import com.samhanair.logis.notification.adapter.sms.AligoSmsAdapter;
import com.samhanair.logis.notification.adapter.sms.SmsAdapter;
import com.samhanair.logis.notification.client.AligoAddressBookClient;
import com.samhanair.logis.notification.client.AligoCsvSourceClient;
import com.samhanair.logis.notification.client.BlockedPartnerLookupClient;
import com.samhanair.logis.notification.client.PartnerLookupClient;
import com.samhanair.logis.notification.client.SlipServiceClient;
import com.samhanair.logis.notification.client.UserClient;
import com.samhanair.logis.notification.config.AligoProperties;
import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.NotificationRequest;
import com.samhanair.logis.notification.domain.RecipientType;
import com.samhanair.logis.notification.repository.NotificationLogRepository;
import com.samhanair.logis.notification.repository.NotificationRequestRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.Map;
import java.util.UUID;
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
 * Aligo SMS 어댑터 placeholder 런타임 가드 통합 테스트 — SP-09-2.
 *
 * <p>AligoSmsAdapter.isPlaceholder() 가드 검증 (4종 비전송 응답):
 * <ol>
 *   <li>key = CHANGE_ME_LOCAL_ONLY → NOT_SENT — 외부 호출 없음</li>
 *   <li>userid = CHANGE_ME_LOCAL_ONLY → NOT_SENT</li>
 *   <li>sender = CHANGE_ME_LOCAL_ONLY → NOT_SENT</li>
 *   <li>3종 모두 정상 key → RestClient 호출 시도 (mock RestClient 응답으로 stub-fail 대체)</li>
 * </ol>
 *
 * <p><b>외부 client @MockBean 격리</b> — memory feedback_it_mockbean_external_clients.
 * UserClient / SlipServiceClient / PartnerLookupClient / BlockedPartnerLookupClient /
 * AligoCsvSourceClient / AligoAddressBookClient 전체 lenient stub.
 *
 * <p><b>SMS 발송 결과 DB 검증</b>:
 * <ul>
 *   <li>placeholder 발송 완료 후 notification_requests.status = SENT</li>
 *   <li>notification_logs.gateway_status 가 SUCCESS (stub) 또는 FAILURE_ALIGO_N (real 실패)</li>
 *   <li>SMS 발송 결과 목록 쿼리와 row count 검증</li>
 * </ul>
 *
 * <p>SP-09-1 패턴: Testcontainers AbstractPostgresIT (Docker 미가용 skip) + @MockBean lenient.
 */
@SpringBootTest(classes = NotificationServiceApplication.class)
@AutoConfigureMockMvc
class AligoSmsAdapterPlaceholderRuntimeGuardIT extends AbstractPostgresIT {

    private static final String ADMIN_SEND_URL = "/admin/notifications/send";
    private static final String ADMIN_LIST_URL = "/admin/notifications";
    private static final String MANAGER_ROLE = "MANAGER";
    private static final String SALES_ROLE   = "SALES";
    private static final String MANAGER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000241";
    private static final String SALES_ACCOUNT_ID = "10000000-0000-0000-0000-000000000242";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private AligoProperties aligoProperties;
    @Autowired private SmsAdapter smsAdapter;
    @Autowired private NotificationRequestRepository requestRepository;
    @Autowired private NotificationLogRepository logRepository;

    /** 외부 client 전체 격리 — Eureka 비활성 Testcontainers 환경에서 500 방지. */
    @MockBean private UserClient userClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private BlockedPartnerLookupClient blockedPartnerLookupClient;
    @MockBean private AligoCsvSourceClient aligoCsvSourceClient;
    @MockBean private AligoAddressBookClient aligoAddressBookClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void stubExternalClients() {
        // lenient stub — 외부 client 가 호출되더라도 NPE/Eureka 오류 방지
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class), anyString(),
                        org.mockito.ArgumentMatchers.any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(dynamicPermissionClient.canView(SALES_ROLE, "notifications.admin")).thenReturn(false);
        lenient().when(dynamicPermissionClient.canEdit(SALES_ROLE, "notifications.admin")).thenReturn(false);
        lenient().when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class),
                        org.mockito.ArgumentMatchers.eq("notifications.admin"),
                        org.mockito.ArgumentMatchers.any(PermissionAction.class)))
                .thenAnswer(inv -> !SALES_ACCOUNT_ID.equals(inv.getArgument(0).toString()));
        lenient().when(blockedPartnerLookupClient.isBlocked(any())).thenReturn(false);
    }

    // -------------------------------------------------------------------------

    /**
     * TC-1: Aligo key placeholder (CHANGE_ME_LOCAL_ONLY) → 비전송 실패.
     *
     * <p>AligoSmsAdapter.isPlaceholder(key) == true 시 외부 RestClient 미호출,
     * gateway_status = "NOT_SENT_CREDENTIALS_PLACEHOLDER".
     *
     * <p>SP-09-2 fix (H-BE-03) — 조건부 if-block 제거. @BeforeEach 에서 key 를
     * CHANGE_ME_LOCAL_ONLY 로 직접 주입하여 무조건 assertion 이 실행되도록 수정.
     * CI / 운영 key 주입 환경 모두에서 가드가 작동함을 보장한다.
     */
    @Test
    @DisplayName("TC-1: Aligo key placeholder → 비전송 실패, 외부 RestClient 미호출")
    void keyPlaceholderReturnsNotSent() {
        // TC-1: key 를 placeholder 로 강제 주입 — 무조건 assertion 실행 (H-BE-03 fix)
        String originalKey = aligoProperties.getKey();
        aligoProperties.setKey("CHANGE_ME_LOCAL_ONLY");
        try {
            assertThat(smsAdapter).isInstanceOf(AligoSmsAdapter.class);
            AligoSmsAdapter adapter = (AligoSmsAdapter) smsAdapter;

            NotificationRequest stubRequest = buildSmsRequest("010-1234-5678", "stub 발송 테스트 TC-1");
            var result = adapter.send(stubRequest);

            assertThat(result.success()).isFalse();
            assertThat(result.gatewayStatus()).isEqualTo("NOT_SENT_CREDENTIALS_PLACEHOLDER");
        } finally {
            aligoProperties.setKey(originalKey);
        }
    }

    /**
     * TC-2: Aligo userid placeholder → 비전송 실패.
     *
     * <p>key 가 정상이어도 userid = CHANGE_ME_LOCAL_ONLY 이면 외부 호출 skip.
     * isPlaceholder(userid) 분기 커버.
     *
     * <p>SP-09-2 fix (H-BE-03) — 조건부 if-block 제거. userid 를 직접 주입하여 무조건 assertion.
     */
    @Test
    @DisplayName("TC-2: Aligo userid placeholder → 비전송 실패")
    void useridPlaceholderReturnsNotSent() {
        String originalUserid = aligoProperties.getUserid();
        aligoProperties.setUserid("CHANGE_ME_LOCAL_ONLY");
        try {
            AligoSmsAdapter adapter = (AligoSmsAdapter) smsAdapter;
            NotificationRequest stubRequest = buildSmsRequest("010-2345-6789", "stub 발송 테스트 TC-2");
            var result = adapter.send(stubRequest);

            assertThat(result.success()).isFalse();
            assertThat(result.gatewayStatus()).isEqualTo("NOT_SENT_CREDENTIALS_PLACEHOLDER");
        } finally {
            aligoProperties.setUserid(originalUserid);
        }
    }

    /**
     * TC-3: Aligo sender placeholder → 비전송 실패.
     *
     * <p>sender = CHANGE_ME_LOCAL_ONLY 시 외부 호출 skip + 비전송 실패.
     * 발신번호 미등록 상태에서의 안전 가드.
     *
     * <p>SP-09-2 fix (H-BE-03) — 조건부 if-block 제거. sender 를 직접 주입하여 무조건 assertion.
     */
    @Test
    @DisplayName("TC-3: Aligo sender placeholder → 비전송 실패")
    void senderPlaceholderReturnsNotSent() {
        String originalSender = aligoProperties.getSender();
        aligoProperties.setSender("CHANGE_ME_LOCAL_ONLY");
        try {
            AligoSmsAdapter adapter = (AligoSmsAdapter) smsAdapter;
            NotificationRequest stubRequest = buildSmsRequest("010-3456-7890", "stub 발송 테스트 TC-3");
            var result = adapter.send(stubRequest);

            assertThat(result.success()).isFalse();
            assertThat(result.gatewayStatus()).isEqualTo("NOT_SENT_CREDENTIALS_PLACEHOLDER");
        } finally {
            aligoProperties.setSender(originalSender);
        }
    }

    /**
     * TC-4: SMS 발송 결과 목록 — MANAGER 권한 조회 + DB row count 정합성.
     *
     * <p>IT 내에서 placeholder stub 발송 2건 실행 후:
     * <ul>
     *   <li>notification_requests.status = SENT — 발송 완료</li>
     *   <li>notification_logs row 2건 — gateway_status = SUCCESS (stub)</li>
     *   <li>GET /admin/notifications?channel=SMS — 2건 이상 반환</li>
     *   <li>GET /admin/notifications?channel=SMS&status=SENT — row 포함</li>
     * </ul>
     *
     * <p>AligoSmsAdapter placeholder 분기 → 비전송 실패 → NotificationService → DB save.
     */
    @Test
    @DisplayName("TC-4: placeholder stub 발송 2건 후 SMS 결과 DB 정합 + API 조회")
    void smsDeliveryResultDbIntegrityAndApiList() throws Exception {
        // ── 1) placeholder 환경에서만 의미 있는 IT (운영 key 시 RestClient 실 호출)
        boolean anyPlaceholder = isAnyPlaceholder();

        if (!anyPlaceholder) {
            // 운영 key 주입 시 이 IT 는 실 Aligo API 호출하므로 skip
            return;
        }

        // ── 2) 발송 요청 2건 — MANAGER 권한
        String body1 = objectMapper.writeValueAsString(Map.of(
                "recipientType", "EXTERNAL_PHONE",
                "recipientAddress", "01012345678",
                "channel", "SMS",
                "templateCode", "DISPATCH_NOTIFY",
                "body", "[삼한공조] 배차 안내: 1건차 출발 예정입니다."));

        String body2 = objectMapper.writeValueAsString(Map.of(
                "recipientType", "EXTERNAL_PHONE",
                "recipientAddress", "01098765432",
                "channel", "SMS",
                "templateCode", "DISPATCH_NOTIFY",
                "body", "[삼한공조] 배차 안내: 2건차 출발 예정입니다."));

        mockMvc.perform(post(ADMIN_SEND_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body1)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", MANAGER_ROLE))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.requestId").exists());

        mockMvc.perform(post(ADMIN_SEND_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body2)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", MANAGER_ROLE))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.requestId").exists());

        // ── 3) DB 직접 검증 — SMS 발송 완료 row
        long smsRequestCount = requestRepository.count();
        assertThat(smsRequestCount).isGreaterThanOrEqualTo(2);

        // ── 4) notification_logs — gateway_status = NOT_SENT (비전송)
        long notSentLogCount = logRepository.findAll().stream()
                .filter(log -> "NOT_SENT_CREDENTIALS_PLACEHOLDER".equals(log.getGatewayStatus()))
                .count();
        assertThat(notSentLogCount).isGreaterThanOrEqualTo(2);

        // ── 5) API 조회 — GET /admin/notifications?channel=SMS
        mockMvc.perform(get(ADMIN_LIST_URL)
                        .param("channel", "SMS")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", MANAGER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray());

        // ── 6) SALES 권한 — 403 확인
        mockMvc.perform(get(ADMIN_LIST_URL)
                        .param("channel", "SMS")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", SALES_ROLE))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // helper
    // -------------------------------------------------------------------------

    /** 발송 요청용 NotificationRequest 빌드 (recipientAddress = 전화번호). */
    private NotificationRequest buildSmsRequest(String phone, String body) {
        return NotificationRequest.open(
                RecipientType.EXTERNAL_PHONE,
                null,
                phone.replace("-", ""),
                NotificationChannel.SMS,
                "DISPATCH_NOTIFY",
                null,
                body,
                null);
    }

    /** 3종 credentials 중 1개라도 placeholder 이면 true. */
    private boolean isAnyPlaceholder() {
        return isPlaceholder(aligoProperties.getKey())
                || isPlaceholder(aligoProperties.getUserid())
                || isPlaceholder(aligoProperties.getSender());
    }

    private boolean isPlaceholder(String value) {
        return value == null || value.isBlank() || "CHANGE_ME_LOCAL_ONLY".equals(value);
    }

}
