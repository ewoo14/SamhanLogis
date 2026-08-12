package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.ChatRoom;

public record ChatRoomResponse(String roomCode, String type, String roomName) {
    public static ChatRoomResponse from(ChatRoom room) { return new ChatRoomResponse(room.getRoomCode(), room.getType().name(), room.getRoomName()); }
}
