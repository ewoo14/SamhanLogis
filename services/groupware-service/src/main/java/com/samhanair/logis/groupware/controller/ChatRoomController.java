package com.samhanair.logis.groupware.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.groupware.dto.*;
import com.samhanair.logis.groupware.client.UserClient;
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
    private final UserClient userClient;
    private final com.samhanair.logis.groupware.repository.ChatRoomParticipantRepository participantRepository;
    private final com.samhanair.logis.groupware.repository.MessageRepository messageRepository;

    @PostMapping("/direct")
    @RequirePermission(page = "messenger.send", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<ChatRoomResponse>> createDirect(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actor,
            @Valid @RequestBody ChatDirectRoomRequest request) {
        return ResponseEntity.status(org.springframework.http.HttpStatus.CREATED)
                .body(ApiResponse.ok(ChatRoomResponse.from(roomService.createDirect(actor, request.participantId()), userClient.resolveProfile(request.participantId()).orElse(null))));
    }

    @PostMapping("/direct/by-employee-code")
    @RequirePermission(page = "messenger.send", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<ChatRoomResponse>> createDirectByEmployeeCode(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actor,
            @Valid @RequestBody ChatDirectEmployeeCodeRequest request) {
        UUID participantId = userClient.resolveUserIdByEmployeeCode(request.employeeCode())
                .orElseThrow(() -> new com.samhanair.logis.common.exception.BusinessException(
                        com.samhanair.logis.common.exception.ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다"));
        return ResponseEntity.status(org.springframework.http.HttpStatus.CREATED)
                .body(ApiResponse.ok(ChatRoomResponse.from(roomService.createDirect(actor, participantId),
                        userClient.resolveProfile(participantId).orElse(null))));
    }

    @PostMapping("/groups")
    @RequirePermission(page = "messenger.send", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<ChatRoomResponse>> createGroup(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actor,
            @Valid @RequestBody ChatGroupRoomRequest request) {
        var room = roomService.createGroup(actor, request.employeeCodes(), request.roomName());
        return ResponseEntity.status(org.springframework.http.HttpStatus.CREATED)
                .body(ApiResponse.ok(ChatRoomResponse.from(room)));
    }

    @GetMapping("/groups")
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public ApiResponse<java.util.List<GroupChatRoomResponse>> groups(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actor) {
        var result = roomService.listGroupsFor(actor).stream().map(room -> {
            var participants = participantRepository.findAllByRoomIdAndLeftAtIsNull(room.getId()).stream()
                    .map(participant -> GroupParticipantResponse.from(userClient.resolveProfile(participant.getUserId()).orElse(null))).toList();
            var latest = messageRepository.findTopByRoomIdOrderBySentAtDesc(room.getId()).map(com.samhanair.logis.groupware.domain.Message::getSentAt).orElse(null);
            var unread = messageRepository.countByRoomIdAndRecipientIdAndStatus(room.getId(), actor, com.samhanair.logis.groupware.domain.MessageStatus.UNREAD);
            return GroupChatRoomResponse.of(room, participants, unread, latest);
        }).toList();
        return ApiResponse.ok(result);
    }

    @PostMapping("/{roomCode}/messages")
    @RequirePermission(page = "messenger.send", action = PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<ChatMessageResponse>> sendMessage(
            @PathVariable String roomCode,
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actor,
            @Valid @RequestBody ChatMessageRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(ChatMessageResponse.from(roomCode,
                messageService.send(roomCode, actor, roomService.messageRecipients(roomCode, actor), request.body()))));
    }

    @GetMapping
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public ApiResponse<java.util.List<ChatRoomResponse>> list(
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actor) {
        return ApiResponse.ok(roomService.listFor(actor).stream().map(room -> ChatRoomResponse.from(room,
                userClient.resolveProfile(roomService.otherParticipant(room.getRoomCode(), actor)).orElse(null))).toList());
    }

    @GetMapping("/{roomCode}/messages")
    @RequirePermission(page = "messenger.send", action = PermissionAction.VIEW)
    public ApiResponse<java.util.List<ChatMessageResponse>> messages(
            @PathVariable String roomCode,
            @RequestHeader(HttpHeaderConstants.CALLER_ID_HEADER) UUID actor) {
        return ApiResponse.ok(messageService.list(roomCode, actor).stream().map(m -> ChatMessageResponse.from(roomCode, m,
                userClient.resolveProfile(m.getSenderId()).orElse(null), m.getSenderId().equals(actor))).toList());
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
