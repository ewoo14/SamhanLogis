package com.samhanair.logis.groupware.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ChatRoom;
import com.samhanair.logis.groupware.domain.ChatRoomType;
import com.samhanair.logis.groupware.service.ChatMessageService;
import com.samhanair.logis.groupware.service.ChatRoomService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ChatRoomControllerTest {
    private final ChatRoomService roomService = mock(ChatRoomService.class);
    private final ChatMessageService messageService = mock(ChatMessageService.class);
    private final UserClient userClient = mock(UserClient.class);
    private final com.samhanair.logis.groupware.repository.ChatRoomParticipantRepository participantRepository = mock();
    private final com.samhanair.logis.groupware.repository.MessageRepository messageRepository = mock();
    private final ChatRoomController controller = new ChatRoomController(roomService, messageService, userClient,
            participantRepository, messageRepository);

    @Test
    void list_keeps_group_rooms_without_looking_up_an_other_direct_participant() {
        UUID actor = UUID.randomUUID();
        ChatRoom room = ChatRoom.groupShell("CHAT-20260814-000020", actor, "운영방");
        when(roomService.listFor(actor)).thenReturn(List.of(room));

        var response = controller.list(actor);

        assertThat(response.getData()).hasSize(1);
        assertThat(response.getData().get(0).roomCode()).isEqualTo("CHAT-20260814-000020");
        verify(roomService, never()).otherParticipant(anyString(), any());
    }

    @Test
    void list_resolves_profile_for_direct_rooms() {
        UUID actor = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        ChatRoom room = ChatRoom.directShell("CHAT-20260814-000021", actor, other);
        when(roomService.listFor(actor)).thenReturn(List.of(room));
        when(roomService.otherParticipant(room.getRoomCode(), actor)).thenReturn(other);
        when(userClient.resolveProfile(other)).thenReturn(java.util.Optional.of(
                new UserClient.UserProfile("개발자", "개발팀", "EC-2")));

        var response = controller.list(actor);

        assertThat(response.getData().get(0).partnerName()).isEqualTo("개발자");
        verify(roomService).otherParticipant(room.getRoomCode(), actor);
    }
}
