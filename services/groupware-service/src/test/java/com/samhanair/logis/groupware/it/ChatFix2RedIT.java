package com.samhanair.logis.groupware.it;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.repository.MessageRepository;
import com.samhanair.logis.groupware.service.ChatMessageService;
import com.samhanair.logis.groupware.service.ChatRoomService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

/** PR #1125 fix2 RED — 방 FK flush 순서와 PostgreSQL advisory lock 반환형의 실제 재현. */
@SpringBootTest(classes = GroupwareServiceApplication.class)
class ChatFix2RedIT extends AbstractPostgresIT {

    @Autowired
    private ChatRoomService roomService;

    @Autowired
    private ChatMessageService messageService;

    @Autowired
    private MessageRepository messageRepository;

    @MockBean
    private UserClient userClient;

    @Test
    void 신규_DIRECT_방은_FK_위반없이_생성되고_참여자를_저장한다() {
        UUID creator = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        when(userClient.exists(any())).thenReturn(true);

        var room = roomService.createDirect(creator, other);

        assertThat(room.getId()).isNotNull();
        assertThat(room.getParticipants()).hasSize(2);
    }

    @Test
    void PostgreSQL_advisory_lock은_실제왕복에서_Long_변환없이_호출되어야한다_RED() {
        assertThatCode(() -> messageRepository.lockRoomSequence(UUID.randomUUID()))
                .doesNotThrowAnyException();
    }

    @Test
    void 실제_PostgreSQL에서_동시_20건_메시지가_모두_전송되고_sequence가_유일하다() throws Exception {
        UUID sender = UUID.randomUUID();
        UUID recipient = UUID.randomUUID();
        when(userClient.exists(any())).thenReturn(true);
        var room = roomService.createDirect(sender, recipient);
        var executor = java.util.concurrent.Executors.newFixedThreadPool(20);
        try {
            var futures = java.util.stream.IntStream.range(0, 20)
                    .mapToObj(i -> executor.submit(() -> messageService.send(
                            room.getRoomCode(), sender, recipient, "동시 메시지 " + i)))
                    .toList();
            var sent = futures.stream().map(future -> {
                try {
                    return future.get();
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError(ex);
                } catch (java.util.concurrent.ExecutionException ex) {
                    throw new AssertionError(ex.getCause());
                }
            }).toList();

            assertThat(sent).hasSize(20);
            assertThat(sent).extracting(com.samhanair.logis.groupware.domain.Message::getSequence)
                    .containsExactlyInAnyOrderElementsOf(java.util.stream.LongStream.rangeClosed(1, 20).boxed().toList());
        } finally {
            executor.shutdownNow();
        }
    }
}
