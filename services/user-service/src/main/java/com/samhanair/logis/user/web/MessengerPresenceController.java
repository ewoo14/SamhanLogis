package com.samhanair.logis.user.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.user.presence.MessengerPresenceService;
import com.samhanair.logis.user.web.dto.MessengerEmployeeResponse;
import com.samhanair.logis.user.web.dto.UpdateMessengerPresenceRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** 삼한 메신저 presence API. UUID는 내부 인증 경계에서만 사용하고 응답에는 employeeCode만 보낸다. */
@RestController
// Gateway legacy route strips the leading /api before forwarding to user-service.
@RequestMapping("/users/messenger")
@RequiredArgsConstructor
public class MessengerPresenceController {
    private static final String USER_HEADER = "X-User-Id";
    private final MessengerPresenceService service;

    @GetMapping("/me")
    public ApiResponse<MessengerEmployeeResponse> me(@RequestHeader(USER_HEADER) UUID actor) {
        return ApiResponse.ok(service.me(actor));
    }
    @GetMapping("/directory")
    public ApiResponse<List<MessengerEmployeeResponse>> directory() { return ApiResponse.ok(service.directory()); }
    @PutMapping("/presence")
    public ApiResponse<Void> update(@RequestHeader(USER_HEADER) UUID actor, @Valid @RequestBody UpdateMessengerPresenceRequest request) {
        service.setStatus(actor, request.presenceStatus()); return ApiResponse.ok(null);
    }
    @PostMapping("/presence/sessions/{sessionId}")
    public ApiResponse<Void> join(@RequestHeader(USER_HEADER) UUID actor, @PathVariable String sessionId) {
        service.join(actor, sessionId); return ApiResponse.ok(null);
    }
    @DeleteMapping("/presence/sessions/{sessionId}")
    public ApiResponse<Void> leave(@RequestHeader(USER_HEADER) UUID actor, @PathVariable String sessionId) {
        service.leave(actor, sessionId); return ApiResponse.ok(null);
    }
    @PostMapping("/presence/activity")
    public ApiResponse<Void> activity(@RequestHeader(USER_HEADER) UUID actor) {
        service.touchActivity(actor); return ApiResponse.ok(null);
    }
    @GetMapping(value = "/presence/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestHeader(USER_HEADER) UUID actor) { return service.stream(actor); }
}
