package com.samhanair.logis.groupware.it;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.repository.MessageRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
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

/**
 * 쪽지 복수 수신 API RED-first 통합 테스트.
 *
 * <p>현재 구현에는 bulk endpoint와 batch_id가 없으므로 구현 전 단계에서 계약 실패를 확인한다.
 */
@SpringBootTest(classes = GroupwareServiceApplication.class)
@AutoConfigureMockMvc
class MessageBulkSendIT extends AbstractPostgresIT {

    private static final String SENDER_ID = "10000000-0000-0000-0000-000000000302";
    private static final String EXISTING_RECIPIENT_ID = "10000000-0000-0000-0000-000000000301";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MessageRepository messageRepository;

    @MockBean
    private UserClient userClient;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        messageRepository.deleteAll();
        lenient().when(userClient.exists(any())).thenReturn(true);
        lenient().when(userClient.resolveDisplayName(any())).thenReturn(Optional.of("발신자"));
        lenient().when(userClient.search(any(), any(Integer.class))).thenReturn(List.of(
                new UserClient.ApproverSummary(UUID.fromString(EXISTING_RECIPIENT_ID), "수신자", "영업팀")));
        lenient().when(userClient.search(any(), any(Integer.class), anyBoolean())).thenReturn(List.of(
                new UserClient.ApproverSummary(UUID.fromString(EXISTING_RECIPIENT_ID), "수신자", "영업팀")));
        lenient().when(userClient.verifyBulk(anyList())).thenAnswer(invocation -> {
            List<UUID> ids = invocation.getArgument(0);
            Map<UUID, Boolean> result = new HashMap<>();
            ids.forEach(id -> result.put(id, true));
            return result;
        });
        lenient().when(userClient.verifyActiveBulk(anyList())).thenAnswer(invocation -> {
            List<UUID> ids = invocation.getArgument(0);
            Map<UUID, Boolean> result = new HashMap<>();
            ids.forEach(id -> result.put(id, true));
            return result;
        });
        lenient().when(dynamicPermissionClient.check(any(), any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);
    }

    @Test
    void R1_존재하지_않는_수신자가_하나라도_있으면_404와_함께_메시지_행을_저장하지_않는다() throws Exception {
        UUID missing = UUID.randomUUID();
        lenient().when(userClient.verifyBulk(anyList())).thenAnswer(invocation -> {
            List<UUID> ids = invocation.getArgument(0);
            Map<UUID, Boolean> result = new HashMap<>();
            ids.forEach(id -> result.put(id, !missing.equals(id)));
            return result;
        });

        mockMvc.perform(post("/admin/groupware/messages/bulk")
                        .header("X-User-Id", SENDER_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"recipientIds":["%s","%s","%s"],"body":"원자성 확인"}
                                """.formatted(EXISTING_RECIPIENT_ID, missing, UUID.randomUUID())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message", containsString("수신자를 찾을 수 없습니다")))
                .andExpect(jsonPath("$.message", not(containsString(missing.toString()))));

        assertThat(messageRepository.count()).isZero();
    }

    @Test
    void R2_성공한_다섯_수신자는_동일_batch_id로_정확히_다섯_행_UNREAD를_만든다() throws Exception {
        List<UUID> recipients = List.of(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        String body = """
                {"recipientIds":["%s","%s","%s","%s","%s"],"body":"다건 발송"}
                """.formatted(recipients.get(0), recipients.get(1), recipients.get(2), recipients.get(3), recipients.get(4));

        var result = mockMvc.perform(post("/admin/groupware/messages/bulk")
                        .header("X-User-Id", SENDER_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.sentCount").value(5))
                .andExpect(jsonPath("$.data.messages.length()").value(5))
                .andExpect(jsonPath("$.data.messages[0].status").value("UNREAD"))
                .andReturn();

        // batchId는 사용자 후속 호출에 쓰이지 않는 내부 원자성 키다. 응답 UUID가 아닌
        // 실제 저장 행 전체를 조회해 다섯 행이 같은 batchId를 공유하는지 검증한다.
        List<com.samhanair.logis.groupware.domain.Message> stored = messageRepository.findAll();
        assertThat(stored).hasSize(5);
        assertThat(stored).extracting(com.samhanair.logis.groupware.domain.Message::getBatchId)
                .doesNotContainNull().containsOnly(stored.get(0).getBatchId());
        assertThat(stored)
                .extracting(com.samhanair.logis.groupware.domain.Message::getRecipientId)
                .containsExactlyInAnyOrderElementsOf(recipients);
        assertThat(stored)
                .allSatisfy(m -> assertThat(m.getStatus())
                        .isEqualTo(com.samhanair.logis.groupware.domain.MessageStatus.UNREAD));
    }

    @Test
    void R4_송신자_본인이_포함되면_400이고_조용히_제거하지_않는다() throws Exception {
        mockMvc.perform(post("/admin/groupware/messages/bulk")
                        .header("X-User-Id", SENDER_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"recipientIds":["%s","%s"],"body":"자기 자신 포함"}
                                """.formatted(SENDER_ID, EXISTING_RECIPIENT_ID)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("본인은 수신자로 지정할 수 없습니다")));

        assertThat(messageRepository.count()).isZero();
    }

    @Test
    void R5_수신자_쉰한명은_400이고_저장하지_않는다() throws Exception {
        String ids = java.util.stream.IntStream.range(0, 51)
                .mapToObj(i -> "\"%s\"".formatted(UUID.randomUUID()))
                .collect(java.util.stream.Collectors.joining(","));

        mockMvc.perform(post("/admin/groupware/messages/bulk")
                        .header("X-User-Id", SENDER_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"recipientIds\":[%s],\"body\":\"상한\"}".formatted(ids)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("최대 50명")));

        assertThat(messageRepository.count()).isZero();
    }

    @Test
    void R9_임원실이_아닌_SALES도_부서헤더_없이_수신자_검색이_가능하다() throws Exception {
        mockMvc.perform(get("/admin/groupware/messages/recipient-search")
                        .header("X-User-Id", SENDER_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-Is-System-Master", "true")
                        .param("q", "수신")
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].name").value("수신자"));

        // 검증 결함 fix — 컨트롤러가 activeOnly=true로 배선하는지 고정한다. 이 verify가 없으면
        // 컨트롤러가 false로 바뀌어도(퇴사자 노출) 위 stub이 q/limit만 매칭해 그대로 통과한다.
        org.mockito.Mockito.verify(userClient).search("수신", 20, true);
    }

    @Test
    void R11_기존_단건_발송_계약은_201로_유지된다() throws Exception {
        mockMvc.perform(post("/admin/groupware/messages")
                        .header("X-User-Id", SENDER_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"senderId":"%s","recipientId":"%s","body":"단건 회귀"}
                                """.formatted(UUID.randomUUID(), EXISTING_RECIPIENT_ID)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.recipientId").value(EXISTING_RECIPIENT_ID));
    }

    @Test
    void R12_미존재_수신자_오류에는_UUID가_노출되지_않는다() throws Exception {
        UUID missing = UUID.randomUUID();
        lenient().when(userClient.verifyBulk(anyList())).thenReturn(Map.of(missing, false));
        mockMvc.perform(post("/admin/groupware/messages/bulk")
                        .header("X-User-Id", SENDER_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"recipientIds":["%s"],"body":"UUID 비공개"}
                                """.formatted(missing)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message", not(containsString(missing.toString()))));
    }
}
