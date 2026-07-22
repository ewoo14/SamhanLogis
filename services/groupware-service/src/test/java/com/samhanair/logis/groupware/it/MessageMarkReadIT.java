package com.samhanair.logis.groupware.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.Message;
import com.samhanair.logis.groupware.domain.MessageStatus;
import com.samhanair.logis.groupware.repository.MessageRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 쪽지 읽음 처리 엔드포인트의 behavioral RED-first 통합 테스트.
 *
 * <p>실제 messages 행과 미열람 count query를 함께 확인한다. actor 헤더가 유일한 신원
 * 권위이고, 반복 호출은 같은 READ 행을 유지하며, 수신함과 count가 같은 상태를 읽어야 한다.
 */
@SpringBootTest(classes = GroupwareServiceApplication.class)
@AutoConfigureMockMvc
class MessageMarkReadIT extends AbstractPostgresIT {

    private static final String ROLE = "SALES";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final String SYSTEM_MASTER_HEADER = "X-Is-System-Master";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MessageRepository messageRepository;

    @MockBean
    private UserClient userClient;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    private UUID sender;
    private UUID recipient;
    private UUID otherUser;

    @BeforeEach
    void setUp() {
        messageRepository.deleteAll();
        sender = UUID.randomUUID();
        recipient = UUID.randomUUID();
        otherUser = UUID.randomUUID();
        lenient().when(userClient.exists(any())).thenReturn(true);
        lenient().when(userClient.resolveDisplayName(any())).thenReturn(Optional.of("발신자"));
        lenient().when(userClient.search(anyString(), any(Integer.class), anyBoolean())).thenReturn(java.util.List.of());
        lenient().when(dynamicPermissionClient.check(any(), anyString(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
    }

    @Test
    void R1_타인_수신_쪽지는_호출자_헤더와_쿼리_위조_모두_무시하고_403이다() throws Exception {
        Message message = saveUnreadMessage();

        mockMvc.perform(put("/admin/groupware/messages/{messageId}/read", message.getId())
                        .header(USER_ID_HEADER, otherUser)
                        .header(ROLE_HEADER, ROLE)
                        .header(SYSTEM_MASTER_HEADER, "true")
                        // 구버전 클라이언트가 보내도 권한 주체를 바꿀 수 없어야 한다.
                        .param("userId", recipient.toString()))
                .andExpect(status().isForbidden());

        assertThat(messageRepository.findById(message.getId()).orElseThrow().getStatus())
                .isEqualTo(MessageStatus.UNREAD);
    }

    @Test
    void R2_같은_쪽지를_두_번_읽어도_READ와_readAt과_미열람_count가_중복_변경되지_않는다() throws Exception {
        Message message = saveUnreadMessage();

        mockMvc.perform(put("/admin/groupware/messages/{messageId}/read", message.getId())
                        .header(USER_ID_HEADER, recipient)
                        .header(ROLE_HEADER, ROLE)
                        .header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("READ"));
        LocalDateTime firstReadAt = messageRepository.findById(message.getId()).orElseThrow().getReadAt();

        mockMvc.perform(put("/admin/groupware/messages/{messageId}/read", message.getId())
                        .header(USER_ID_HEADER, recipient)
                        .header(ROLE_HEADER, ROLE)
                        .header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("READ"));

        Message afterSecondCall = messageRepository.findById(message.getId()).orElseThrow();
        assertThat(afterSecondCall.getReadAt()).isEqualTo(firstReadAt);
        assertThat(messageRepository.countByRecipientIdAndStatus(recipient, MessageStatus.UNREAD)).isZero();
    }

    @Test
    void L1_존재하지_않는_메시지_404_오류에는_UUID가_노출되지_않는다() throws Exception {
        UUID missingMessageId = UUID.randomUUID();

        mockMvc.perform(put("/admin/groupware/messages/{messageId}/read", missingMessageId)
                        .header(USER_ID_HEADER, recipient)
                        .header(ROLE_HEADER, ROLE)
                        .header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString(missingMessageId.toString()))));
    }

    @Test
    void R3_본인이_읽음_처리하면_수신함과_미열람_count가_같은_messages_상태를_반영한다() throws Exception {
        Message message = saveUnreadMessage();
        assertThat(messageRepository.countByRecipientIdAndStatus(recipient, MessageStatus.UNREAD)).isEqualTo(1);

        mockMvc.perform(put("/admin/groupware/messages/{messageId}/read", message.getId())
                        .header(USER_ID_HEADER, recipient)
                        .header(ROLE_HEADER, ROLE)
                        .header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/admin/groupware/messages/inbox")
                        .header(USER_ID_HEADER, recipient)
                        .header(ROLE_HEADER, ROLE)
                        .header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].status").value("READ"));

        assertThat(messageRepository.countByRecipientIdAndStatus(recipient, MessageStatus.UNREAD)).isZero();
    }

    private Message saveUnreadMessage() {
        return messageRepository.saveAndFlush(Message.send(sender, recipient, "읽음 처리 behavioral test"));
    }
}
