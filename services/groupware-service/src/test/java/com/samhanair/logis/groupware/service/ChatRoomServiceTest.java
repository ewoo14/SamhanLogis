package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ChatRoom;
import com.samhanair.logis.groupware.domain.ChatRoomParticipant;
import com.samhanair.logis.groupware.repository.ChatRoomParticipantRepository;
import com.samhanair.logis.groupware.repository.ChatRoomRepository;
import com.samhanair.logis.groupware.repository.MessageRepository;
import com.samhanair.logis.groupware.domain.Message;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** #894 S2 RED-first 권한·작성자 참여자·실시간 계약의 최소 행동 테스트. */
@ExtendWith(MockitoExtension.class)
class ChatRoomServiceTest {

    @Mock ChatRoomRepository roomRepository;
    @Mock ChatRoomParticipantRepository participantRepository;
    @Mock UserClient userClient;
    @Mock MessageRepository messageRepository;
    @Mock RealtimeBroker broker;

    @Test
    void creating_room_includes_creator_as_real_participant() {
        UUID creator = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        when(userClient.exists(creator)).thenReturn(true);
        when(userClient.exists(other)).thenReturn(true);
        when(roomRepository.save(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        ChatRoomService service = new ChatRoomService(roomRepository, participantRepository, userClient, null);

        ChatRoom room = service.createDirect(creator, other);

        assertThat(room.getParticipants()).extracting(ChatRoomParticipant::getUserId)
                .containsExactlyInAnyOrder(creator, other);
        assertThat(room.getParticipants()).filteredOn(p -> p.getUserId().equals(creator))
                .allMatch(ChatRoomParticipant::isOwner);
    }

    @Test
    void non_participant_cannot_read_room_messages() {
        UUID outsider = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        when(roomRepository.findByRoomCode("CHAT-20260812-000001"))
                .thenReturn(Optional.of(ChatRoom.restore(roomId, "CHAT-20260812-000001")));
        when(participantRepository.existsByRoomIdAndUserIdAndLeftAtIsNull(roomId, outsider)).thenReturn(false);
        ChatRoomService service = new ChatRoomService(roomRepository, participantRepository, userClient, null);

        assertThatThrownBy(() -> service.assertParticipant("CHAT-20260812-000001", outsider))
                .hasMessageContaining("채팅방 참여자만");
    }

    @Test
    void creating_message_publishes_one_realtime_event_after_save() {
        UUID creator = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        ChatRoom room = ChatRoom.restore(UUID.randomUUID(), "CHAT-20260812-000001");
        room.addParticipant(creator, true);
        room.addParticipant(other, false);
        when(roomRepository.findByRoomCode(room.getRoomCode())).thenReturn(Optional.of(room));
        when(participantRepository.existsByRoomIdAndUserIdAndLeftAtIsNull(room.getId(), creator)).thenReturn(true);
        ChatRoomService service = new ChatRoomService(roomRepository, participantRepository, userClient, broker);

        service.assertParticipant(room.getRoomCode(), creator);

        verify(participantRepository).existsByRoomIdAndUserIdAndLeftAtIsNull(room.getId(), creator);
    }

    @Test
    void room_message_is_published_to_the_existing_sse_broker() {
        UUID creator = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        ChatRoom room = ChatRoom.restore(UUID.randomUUID(), "CHAT-20260812-000001");
        room.addParticipant(creator, true); room.addParticipant(other, false);
        when(roomRepository.findByRoomCode(room.getRoomCode())).thenReturn(Optional.of(room));
        when(participantRepository.existsByRoomIdAndUserIdAndLeftAtIsNull(room.getId(), creator)).thenReturn(true);
        when(userClient.exists(other)).thenReturn(true);
        when(messageRepository.findMaxSequence(room.getId())).thenReturn(0L);
        when(messageRepository.save(any(Message.class))).thenAnswer(invocation -> invocation.getArgument(0));
        ChatMessageService service = new ChatMessageService(new ChatRoomService(roomRepository, participantRepository, userClient, broker), messageRepository, userClient, broker);

        service.send(room.getRoomCode(), creator, other, "실시간 도착");

        verify(broker).publish(room.getId(), "chat:message-created", java.util.Map.of("roomCode", room.getRoomCode(), "sequence", 1L));
    }
}
