package com.samhanair.logis.groupware.dto;

import com.samhanair.logis.groupware.domain.Message;
import java.time.LocalDateTime;

public record ChatMessageResponse(String roomCode, long sequence, String body, LocalDateTime sentAt) {
    public static ChatMessageResponse from(String roomCode, Message message) {
        return new ChatMessageResponse(roomCode, message.getSequence(), message.getBody(), message.getSentAt());
    }
}
