package com.samhanair.logis.notification.it;

import static org.assertj.core.api.Assertions.assertThat;
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
import com.samhanair.logis.notification.domain.DispatchSmsSaveMode;
import com.samhanair.logis.notification.repository.DispatchSmsSaveHistoryRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * SP-09-2 — 배차안내 SMS 실 발송 경로에서 {@code dispatch_sms_save_history} 에
 * {@code SEND_AUDIT} row 가 자동 생성되는지 검증하는 IT.
 *
 * <p>Aligo 자격증명이 placeholder ({@code CHANGE_ME_LOCAL_ONLY}) 로 설정되어 있으므로
 * 실제 외부 SMS API 는 호출되지 않고 stub-success 로 처리된다. 그럼에도 불구하고
 * {@code DispatchBatchSendService} 가 발송 완료 후 {@code SEND_AUDIT} row 를 저장하는지
 * 검증한다.
 *
 * <ol>
 *   <li>배차안내 send endpoint 호출 → 200</li>
 *   <li>{@code dispatch_sms_save_history} 에 {@code SEND_AUDIT} 1건 생성 확인</li>
 *   <li>audit row 의 sent/failed/blocked 수치 정확성 검증</li>
 *   <li>send_audit 저장 실패가 발송 결과에 영향 없는지 (fail-soft) 확인</li>
 * </ol>
 *
 * <p>외부 client 전체 {@code @MockBean} 격리 (memory feedback_it_mockbean_external_clients).
 */
@SpringBootTest(classes = NotificationServiceApplication.class)
@AutoConfigureMockMvc
class AligoSmsAdapterSendAuditIT extends AbstractPostgresIT {

    private static final String SEND_URL = "/admin/notifications/dispatch-batch/send";
    private static final String USER_DISPATCH = "10000000-0000-0000-0000-000000000231";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DispatchSmsSaveHistoryRepository saveHistoryRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    /** 외부 client 전체 격리 — Eureka 비활성 Testcontainers 환경에서 500 방지. */
    @MockBean private UserClient userClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private BlockedPartnerLookupClient blockedPartnerLookupClient;
    @MockBean private AligoCsvSourceClient aligoCsvSourceClient;
    @MockBean private AligoAddressBookClient aligoAddressBookClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        // blocked 가드 — 기본 false (발송 진행)
        Mockito.lenient().when(dynamicPermissionClient.canView(Mockito.anyString(), Mockito.anyString())).thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.canEdit(Mockito.anyString(), Mockito.anyString())).thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.anyString(), Mockito.any(PermissionAction.class)))
                .thenReturn(true);
        Mockito.lenient().when(blockedPartnerLookupClient.isBlocked(Mockito.anyString())).thenReturn(false);
    }

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("DELETE FROM dispatch_sms_save_history");
        jdbcTemplate.update("DELETE FROM notification_logs");
        jdbcTemplate.update("DELETE FROM notification_requests");
    }

    @Test
    @DisplayName("배차안내 send 후 SEND_AUDIT row 1건 자동 생성 — sent/failed 수치 정합")
    void afterSend_sendAuditRowCreated() throws Exception {
        String reqBody = objectMapper.writeValueAsString(Map.of(
                "date", LocalDate.now().toString(),
                "entries", List.of(
                        Map.of("partnerCode", "P-001",
                                "recipientPhone", "01011112222",
                                "message", "[배차안내] 테스트 메시지 1",
                                "chatRoomName", "발주방 A"),
                        Map.of("partnerCode", "P-002",
                                "recipientPhone", "01033334444",
                                "message", "[배차안내] 테스트 메시지 2",
                                "chatRoomName", "발주방 B"))));

        mockMvc.perform(post(SEND_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reqBody)
                        .header("X-User-Id", USER_DISPATCH)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sent").value(0))
                .andExpect(jsonPath("$.data.failed").value(2))
                .andExpect(jsonPath("$.data.blocked").value(0));

        // SEND_AUDIT row 1건 생성 확인
        Integer auditCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM dispatch_sms_save_history WHERE save_mode = 'SEND_AUDIT' AND is_deleted = FALSE",
                Integer.class);
        assertThat(auditCount).isEqualTo(1);

        // audit row 상세 — sent/failed/blocked 수치 정합
        var rows = saveHistoryRepository.findAll();
        var auditRow = rows.stream()
                .filter(r -> r.getSaveMode() == DispatchSmsSaveMode.SEND_AUDIT)
                .findFirst();
        assertThat(auditRow).isPresent();
        assertThat(auditRow.get().getResponsePayload().path("sent").asInt()).isZero();
        assertThat(auditRow.get().getResponsePayload().path("failed").asInt()).isEqualTo(2);
        assertThat(auditRow.get().getResponsePayload().path("blocked").asInt()).isZero();
        assertThat(auditRow.get().getResponsePayload().path("details").isArray()).isTrue();
        assertThat(auditRow.get().getResponsePayload().path("details").size()).isEqualTo(2);
    }

    @Test
    @DisplayName("blocked 포함 혼합 — SEND_AUDIT row 에 blocked 수치 반영")
    void afterSend_blockedEntry_reflectedInAuditRow() throws Exception {
        Mockito.when(blockedPartnerLookupClient.isBlocked("P-BLK")).thenReturn(true);

        String reqBody = objectMapper.writeValueAsString(Map.of(
                "date", LocalDate.now().toString(),
                "entries", List.of(
                        Map.of("partnerCode", "P-001",
                                "recipientPhone", "01011112222",
                                "message", "정상 발송",
                                "chatRoomName", "발주방 A"),
                        Map.of("partnerCode", "P-BLK",
                                "recipientPhone", "01099998888",
                                "message", "차단 거래처",
                                "chatRoomName", "발주방 B"))));

        mockMvc.perform(post(SEND_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reqBody)
                        .header("X-User-Id", USER_DISPATCH)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sent").value(0))
                .andExpect(jsonPath("$.data.failed").value(1))
                .andExpect(jsonPath("$.data.blocked").value(1));

        var rows = saveHistoryRepository.findAll();
        var auditRow = rows.stream()
                .filter(r -> r.getSaveMode() == DispatchSmsSaveMode.SEND_AUDIT)
                .findFirst();
        assertThat(auditRow).isPresent();
        assertThat(auditRow.get().getResponsePayload().path("sent").asInt()).isZero();
        assertThat(auditRow.get().getResponsePayload().path("blocked").asInt()).isEqualTo(1);
    }

    @Test
    @DisplayName("DISPATCH role 로 send + SEND_AUDIT 저장 — 사용자 ID audit 확인")
    void sendAudit_createdByMatchesRequestUser() throws Exception {
        String reqBody = objectMapper.writeValueAsString(Map.of(
                "date", LocalDate.now().toString(),
                "entries", List.of(
                        Map.of("partnerCode", "P-001",
                                "recipientPhone", "01011112222",
                                "message", "감사 사용자 확인",
                                "chatRoomName", "발주방 A"))));

        mockMvc.perform(post(SEND_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reqBody)
                        .header("X-User-Id", USER_DISPATCH)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk());

        // SEND_AUDIT row 의 created_by 가 X-User-Id 와 일치하는지 확인
        String createdBy = jdbcTemplate.queryForObject(
                "SELECT created_by FROM dispatch_sms_save_history WHERE save_mode = 'SEND_AUDIT' AND is_deleted = FALSE",
                String.class);
        assertThat(createdBy).isEqualTo(USER_DISPATCH);
    }

    @Test
    @DisplayName("topic 이 배차일 기반으로 자동 생성된다")
    void sendAudit_topicContainsDate() throws Exception {
        String today = LocalDate.now().toString();
        String reqBody = objectMapper.writeValueAsString(Map.of(
                "date", today,
                "entries", List.of(
                        Map.of("partnerCode", "P-001",
                                "recipientPhone", "01011112222",
                                "message", "topic 날짜 확인",
                                "chatRoomName", "발주방 A"))));

        mockMvc.perform(post(SEND_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reqBody)
                        .header("X-User-Id", USER_DISPATCH)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk());

        String topic = jdbcTemplate.queryForObject(
                "SELECT topic FROM dispatch_sms_save_history WHERE save_mode = 'SEND_AUDIT' AND is_deleted = FALSE",
                String.class);
        assertThat(topic).contains(today);
        assertThat(topic).contains("발송 감사");
    }
}
