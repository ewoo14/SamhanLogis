package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.Message;
import java.time.LocalDateTime;

public record ChatMessageResponse(String roomCode, long sequence, String body, LocalDateTime sentAt, String senderName, String senderDepartment, String senderEmployeeCode, boolean mine) {
    public static ChatMessageResponse from(String roomCode, Message message) {
        return from(roomCode, message, null, false);
    }
    public static ChatMessageResponse from(String roomCode, Message message, com.samhanair.logis.groupware.client.UserClient.UserProfile profile, boolean mine) {
        return new ChatMessageResponse(roomCode, message.getSequence(), message.getBody(), message.getSentAt(),
                profile == null ? null : profile.name(), profile == null ? null : profile.department(), profile == null ? null : profile.employeeCode(), mine);
    }
}
