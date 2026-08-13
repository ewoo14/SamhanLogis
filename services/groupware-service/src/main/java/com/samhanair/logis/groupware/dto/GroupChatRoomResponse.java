package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.ChatRoom;
import java.time.LocalDateTime;
import java.util.List;

/** 참여자에게만 반환하는 그룹방 목록 행. */
public record GroupChatRoomResponse(String roomCode, String type, String roomName,
                                    List<GroupParticipantResponse> participants,
                                    long unreadCount, LocalDateTime latestMessageAt) {
    public static GroupChatRoomResponse of(ChatRoom room, List<GroupParticipantResponse> participants,
                                           long unreadCount, LocalDateTime latestMessageAt) {
        return new GroupChatRoomResponse(room.getRoomCode(), room.getType().name(), room.getRoomName(),
                participants, unreadCount, latestMessageAt);
    }
}
