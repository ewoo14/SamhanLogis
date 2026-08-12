package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.ChatRoom;

public record ChatRoomResponse(String roomCode, String type, String roomName, String partnerName, String partnerDepartment, String partnerEmployeeCode) {
    public static ChatRoomResponse from(ChatRoom room) { return from(room, null); }
    public static ChatRoomResponse from(ChatRoom room, com.samhanair.logis.groupware.client.UserClient.UserProfile profile) {
        return new ChatRoomResponse(room.getRoomCode(), room.getType().name(), room.getRoomName(),
                profile == null ? null : profile.name(), profile == null ? null : profile.department(), profile == null ? null : profile.employeeCode());
    }
}
