package com.samhanair.logis.groupware.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.groupware.dto.*;
import com.samhanair.logis.groupware.service.ChatMessageService;
import com.samhanair.logis.groupware.service.ChatRoomService;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** room 기반 1:1 채팅 API. URL과 응답에는 내부 UUID를 노출하지 않는다. */
@RestController
@RequestMapping("/admin/groupware/chat/rooms")
@RequiredArgsConstructor
public class ChatRoomController {
    private final ChatRoomService roomService;
    private final ChatMessageService messageService;

    @PostMapping("/direct")
    @RequirePermission(page = "messenger.send", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<ChatRoomResponse>> createDirect(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actor,
            @Valid @RequestBody ChatDirectRoomRequest request) {
        return ResponseEntity.status(org.springframework.http.HttpStatus.CREATED)
                .body(ApiResponse.ok(ChatRoomResponse.from(roomService.createDirect(actor, request.participantId()))));
    }

    @PostMapping("/{roomCode}/messages")
    @RequirePermission(page = "messenger.send", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<ChatMessageResponse>> sendMessage(
            @PathVariable String roomCode,
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actor,
            @Valid @RequestBody ChatMessageRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(ChatMessageResponse.from(roomCode,
                messageService.send(roomCode, actor, roomService.otherParticipant(roomCode, actor), request.body()))));
    }

    @GetMapping
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public ApiResponse<java.util.List<ChatRoomResponse>> list(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actor) {
        return ApiResponse.ok(roomService.listFor(actor).stream().map(ChatRoomResponse::from).toList());
    }

    @GetMapping("/{roomCode}/messages")
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public ApiResponse<java.util.List<ChatMessageResponse>> messages(
            @PathVariable String roomCode,
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actor) {
        return ApiResponse.ok(messageService.list(roomCode, actor).stream().map(m -> ChatMessageResponse.from(roomCode, m)).toList());
    }

    @PutMapping("/{roomCode}/read")
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public ApiResponse<Void> markRead(
            @PathVariable String roomCode,
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actor,
            @RequestParam long sequence) {
        messageService.markRead(roomCode, actor, sequence);
        return ApiResponse.ok(null);
    }

    @GetMapping(value = "/{roomCode}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public org.springframework.web.servlet.mvc.method.annotation.SseEmitter stream(
            @PathVariable String roomCode,
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actor) {
        return roomService.stream(roomCode, actor);
    }
}
