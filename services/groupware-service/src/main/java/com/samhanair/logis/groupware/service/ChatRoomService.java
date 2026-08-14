package com.samhanair.logis.groupware.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ChatRoom;
import com.samhanair.logis.groupware.domain.ChatRoomParticipant;
import com.samhanair.logis.groupware.repository.ChatRoomParticipantRepository;
import com.samhanair.logis.groupware.repository.ChatRoomRepository;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ChatRoomService {
    private final ChatRoomRepository roomRepository;
    private final ChatRoomParticipantRepository participantRepository;
    private final UserClient userClient;
    private final RealtimeBroker broker;

    @Transactional
    public ChatRoom createDirect(UUID creator, UUID other) {
        if (creator.equals(other)) throw new BusinessException(ErrorCode.INVALID_INPUT, "자기 자신과의 1:1 대화는 만들 수 없습니다");
        if (!userClient.exists(creator) || !userClient.exists(other)) throw new BusinessException(ErrorCode.NOT_FOUND, "참여자를 찾을 수 없습니다");
        String pairKey = ChatRoom.pairKey(creator, other);
        return roomRepository.findByDirectPairKey(pairKey).orElseGet(() -> {
            ChatRoom room = roomRepository.saveAndFlush(ChatRoom.directShell(nextCode(), creator, other));
            room.addParticipant(creator, true);
            room.addParticipant(other, false);
            participantRepository.saveAll(room.getParticipants());
            return room;
        });
    }

    @Transactional
    public ChatRoom createGroup(UUID creator, java.util.List<String> employeeCodes, String roomName) {
        if (employeeCodes == null || employeeCodes.isEmpty()) throw new BusinessException(ErrorCode.INVALID_INPUT, "참여자를 한 명 이상 선택하십시오");
        java.util.List<UUID> members = employeeCodes.stream().filter(java.util.Objects::nonNull).map(String::trim)
                .filter(code -> !code.isBlank()).distinct().map(code -> userClient.resolveUserIdByEmployeeCode(code)
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "참여자를 찾을 수 없습니다"))).toList();
        members = new java.util.ArrayList<>(members);
        if (members.contains(creator)) members.remove(creator);
        if (members.isEmpty()) throw new BusinessException(ErrorCode.INVALID_INPUT, "자기 자신만으로 단톡방을 만들 수 없습니다");
        java.util.List<UUID> all = new java.util.ArrayList<>(); all.add(creator); all.addAll(members);
        if (!userClient.verifyActiveBulk(all).entrySet().containsAll(all.stream().map(id -> java.util.Map.entry(id, true)).toList()))
            throw new BusinessException(ErrorCode.NOT_FOUND, "재직 중인 참여자만 선택할 수 있습니다");
        ChatRoom room = roomRepository.saveAndFlush(ChatRoom.groupShell(nextCode(), creator, roomName));
        room.addParticipant(creator, true);
        members.forEach(member -> room.addParticipant(member, false));
        participantRepository.saveAll(room.getParticipants());
        return room;
    }

    @Transactional(readOnly = true)
    public java.util.List<ChatRoom> listFor(UUID actor) { return roomRepository.findActiveRoomsForUser(actor); }
    @Transactional(readOnly = true)
    public java.util.List<ChatRoom> listGroupsFor(UUID actor) {
        return listFor(actor).stream().filter(room -> room.getType() == com.samhanair.logis.groupware.domain.ChatRoomType.GROUP).toList();
    }
    public java.util.List<UUID> messageRecipients(String roomCode, UUID actor) {
        ChatRoom room = requireParticipant(roomCode, actor);
        return participantRepository.findAllByRoomIdAndLeftAtIsNull(room.getId()).stream()
                .map(ChatRoomParticipant::getUserId).filter(id -> !id.equals(actor)).toList();
    }

    @Transactional(readOnly = true)
    public ChatRoom requireParticipant(String roomCode, UUID actor) {
        ChatRoom room = roomRepository.findByRoomCode(roomCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "채팅방을 찾을 수 없습니다"));
        if (!participantRepository.existsByRoomIdAndUserIdAndLeftAtIsNull(room.getId(), actor))
            throw new BusinessException(ErrorCode.FORBIDDEN, "채팅방 참여자만 대화 내용을 볼 수 있습니다");
        return room;
    }

    public void assertParticipant(String roomCode, UUID actor) { requireParticipant(roomCode, actor); }
    public UUID otherParticipant(String roomCode, UUID actor) {
        ChatRoom room = requireParticipant(roomCode, actor);
        return participantRepository.findAllByRoomIdAndLeftAtIsNull(room.getId()).stream()
                .map(p -> p.getUserId()).filter(id -> !id.equals(actor)).findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "대화 상대를 찾을 수 없습니다"));
    }
    public org.springframework.web.servlet.mvc.method.annotation.SseEmitter stream(String roomCode, UUID actor) {
        return broker.subscribe(requireParticipant(roomCode, actor).getId());
    }
    private String nextCode() {
        String code = "CHAT-" + LocalDate.now().toString().replace("-", "") + "-"
                + String.format("%06d", roomRepository.nextRoomCodeSequence());
        return roomRepository.findByRoomCode(code).isPresent() ? nextCode() : code;
    }
}
