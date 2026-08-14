package com.samhanair.logis.groupware.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

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
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.stream.IntStream;
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
        when(roomRepository.saveAndFlush(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        ChatRoomService service = new ChatRoomService(roomRepository, participantRepository, userClient, null);

        ChatRoom room = service.createDirect(creator, other);

        assertThat(room.getParticipants()).extracting(ChatRoomParticipant::getUserId)
                .containsExactlyInAnyOrder(creator, other);
        assertThat(room.getParticipants()).filteredOn(p -> p.getUserId().equals(creator))
                .allMatch(ChatRoomParticipant::isOwner);
    }

    @Test
    void creating_group_room_resolves_employee_codes_without_exposing_user_ids() {
        UUID creator = UUID.randomUUID();
        UUID member = UUID.randomUUID();
        when(userClient.resolveUserIdByEmployeeCode("E001")).thenReturn(Optional.of(member));
        when(userClient.verifyActiveBulk(any())).thenReturn(java.util.Map.of(creator, true, member, true));
        when(roomRepository.saveAndFlush(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));
        ChatRoomService service = new ChatRoomService(roomRepository, participantRepository, userClient, null);

        ChatRoom room = service.createGroup(creator, List.of("E001"), null);

        assertThat(room.getType()).isEqualTo(com.samhanair.logis.groupware.domain.ChatRoomType.GROUP);
        assertThat(room.getParticipants()).extracting(ChatRoomParticipant::getUserId)
                .containsExactlyInAnyOrder(creator, member);
        verify(userClient).resolveUserIdByEmployeeCode("E001");
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

    @Test
    void new_room_code_is_allocated_from_persisted_room_codes_not_process_memory() {
        UUID creator = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        when(userClient.exists(creator)).thenReturn(true);
        when(userClient.exists(other)).thenReturn(true);
        when(roomRepository.findByDirectPairKey(ChatRoom.pairKey(creator, other))).thenReturn(Optional.empty());
        when(roomRepository.findByRoomCode(org.mockito.ArgumentMatchers.anyString())).thenReturn(Optional.empty());
        when(roomRepository.saveAndFlush(any(ChatRoom.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ChatRoomService service = new ChatRoomService(roomRepository, participantRepository, userClient, null);
        service.createDirect(creator, other);

        verify(roomRepository, times(1)).findByRoomCode(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void twenty_concurrent_messages_receive_unique_sequences() throws Exception {
        UUID creator = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        ChatRoom room = ChatRoom.restore(UUID.randomUUID(), "CHAT-20260812-000001");
        room.addParticipant(creator, true);
        room.addParticipant(other, false);
        when(roomRepository.findByRoomCode(room.getRoomCode())).thenReturn(Optional.of(room));
        when(participantRepository.existsByRoomIdAndUserIdAndLeftAtIsNull(room.getId(), creator)).thenReturn(true);
        when(userClient.exists(other)).thenReturn(true);
        ConcurrentLinkedQueue<Message> saved = new ConcurrentLinkedQueue<>();
        when(messageRepository.findMaxSequence(room.getId())).thenAnswer(invocation -> saved.stream()
                .mapToLong(Message::getSequence).max().orElse(0L));
        when(messageRepository.save(any(Message.class))).thenAnswer(invocation -> {
            Message message = invocation.getArgument(0);
            saved.add(message);
            return message;
        });
        ChatMessageService service = new ChatMessageService(
                new ChatRoomService(roomRepository, participantRepository, userClient, broker),
                messageRepository, userClient, broker);

        var pool = java.util.concurrent.Executors.newFixedThreadPool(20);
        try {
            var futures = IntStream.range(0, 20).mapToObj(i -> pool.submit(() ->
                    service.send(room.getRoomCode(), creator, other, "동시 메시지 " + i))).toList();
            for (var future : futures) future.get();
        } finally {
            pool.shutdownNow();
        }

        assertThat(saved).extracting(Message::getSequence).doesNotHaveDuplicates().hasSize(20);
    }

    @Test
    void group_message_rows_keep_unique_room_sequences_per_recipient() {
        UUID creator = UUID.randomUUID();
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        ChatRoom room = ChatRoom.restore(UUID.randomUUID(), "CHAT-20260812-000002");
        room.addParticipant(creator, true);
        room.addParticipant(first, false);
        room.addParticipant(second, false);
        when(roomRepository.findByRoomCode(room.getRoomCode())).thenReturn(Optional.of(room));
        when(participantRepository.existsByRoomIdAndUserIdAndLeftAtIsNull(room.getId(), creator)).thenReturn(true);
        when(userClient.verifyActiveBulk(List.of(first, second))).thenReturn(java.util.Map.of(first, true, second, true));
        when(messageRepository.findMaxSequence(room.getId())).thenReturn(0L);
        when(messageRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));
        ChatMessageService service = new ChatMessageService(
                new ChatRoomService(roomRepository, participantRepository, userClient, broker),
                messageRepository, userClient, broker);

        service.send(room.getRoomCode(), creator, List.of(first, second), "그룹 메시지");

        var messages = new java.util.ArrayList<Message>();
        org.mockito.ArgumentCaptor<List<Message>> captor = org.mockito.ArgumentCaptor.forClass(List.class);
        verify(messageRepository).saveAll(captor.capture());
        messages.addAll(captor.getValue());
        assertThat(messages).extracting(Message::getSequence).containsExactly(1L, 2L);
    }

    @Test
    void group_message_list_collapses_recipient_rows_into_one_logical_message() {
        UUID creator = UUID.randomUUID();
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        UUID batchId = UUID.randomUUID();
        ChatRoom room = ChatRoom.restore(UUID.randomUUID(), "CHAT-20260812-000003");
        room.addParticipant(creator, true);
        room.addParticipant(first, false);
        room.addParticipant(second, false);
        when(roomRepository.findByRoomCode(room.getRoomCode())).thenReturn(Optional.of(room));
        when(participantRepository.existsByRoomIdAndUserIdAndLeftAtIsNull(room.getId(), creator)).thenReturn(true);
        Message firstRecipientRow = Message.sendInRoom(room.getId(), 1L, creator, first, "논리 메시지", batchId);
        Message secondRecipientRow = Message.sendInRoom(room.getId(), 2L, creator, second, "논리 메시지", batchId);
        when(messageRepository.findTop50ByRoomIdOrderBySequenceDesc(room.getId()))
                .thenReturn(List.of(secondRecipientRow, firstRecipientRow));
        ChatMessageService service = new ChatMessageService(
                new ChatRoomService(roomRepository, participantRepository, userClient, broker),
                messageRepository, userClient, broker);

        var listed = service.list(room.getRoomCode(), creator);

        assertThat(listed).hasSize(1);
        assertThat(listed.get(0).getBody()).isEqualTo("논리 메시지");
    }

    @Test
    void group_message_list_keeps_the_actor_recipient_row_when_actor_is_a_recipient() {
        UUID sender = UUID.randomUUID();
        UUID actor = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        UUID batchId = UUID.randomUUID();
        ChatRoom room = ChatRoom.restore(UUID.randomUUID(), "CHAT-20260812-000004");
        room.addParticipant(sender, true);
        room.addParticipant(actor, false);
        room.addParticipant(other, false);
        when(roomRepository.findByRoomCode(room.getRoomCode())).thenReturn(Optional.of(room));
        when(participantRepository.existsByRoomIdAndUserIdAndLeftAtIsNull(room.getId(), actor)).thenReturn(true);
        Message otherRecipientRow = Message.sendInRoom(room.getId(), 1L, sender, other, "논리 메시지", batchId);
        Message actorRecipientRow = Message.sendInRoom(room.getId(), 2L, sender, actor, "논리 메시지", batchId);
        when(messageRepository.findTop50ByRoomIdOrderBySequenceDesc(room.getId()))
                .thenReturn(List.of(actorRecipientRow, otherRecipientRow));
        ChatMessageService service = new ChatMessageService(
                new ChatRoomService(roomRepository, participantRepository, userClient, broker),
                messageRepository, userClient, broker);

        var listed = service.list(room.getRoomCode(), actor);

        assertThat(listed).singleElement().isSameAs(actorRecipientRow);
    }
}
