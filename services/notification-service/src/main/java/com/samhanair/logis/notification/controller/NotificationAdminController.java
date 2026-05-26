package com.samhanair.logis.notification.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.NotificationRequest;
import com.samhanair.logis.notification.domain.NotificationStatus;
import com.samhanair.logis.notification.dto.NotificationAdminResponse;
import com.samhanair.logis.notification.dto.NotificationSendRequest;
import com.samhanair.logis.notification.service.NotificationService;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 발송 admin endpoint — 직접 발송 (대량 안내) / 이력 조회 / 재시도. 인증 = X-User-* 헤더 +
 * {@code @RequirePermission} 동적 권한 가드.
 */
@RestController
@RequestMapping("/admin/notifications")
@RequiredArgsConstructor
public class NotificationAdminController {

    private final NotificationService notificationService;

    /** admin 직접 발송 (대량 안내). */
    @Operation(summary = "발송 (Admin)", description = "MASTER / MANAGER 권한 필요")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "발송 등록 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "수신자 미존재")
    })
    @PostMapping("/send")
    @RequirePermission(page = "notifications.admin", action = "EDIT")
    public ResponseEntity<ApiResponse<NotificationAdminResponse>> send(@Valid @RequestBody NotificationSendRequest req) {
        NotificationRequest entity = notificationService.send(req);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(NotificationAdminResponse.from(entity)));
    }

    /** 발송 이력 페이지 — channel / status / 기간 필터. */
    @Operation(summary = "발송 이력 조회 (Admin)")
    @GetMapping
    @RequirePermission(page = "notifications.admin", action = "VIEW")
    public ApiResponse<List<NotificationAdminResponse>> list(
            @RequestParam(required = false) NotificationChannel channel,
            @RequestParam(required = false) NotificationStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ApiResponse.ok(notificationService.findAll(channel, status, PageRequest.of(page, size))
                .map(NotificationAdminResponse::from)
                .getContent());
    }

    /** 발송 단건 조회. */
    @Operation(summary = "발송 단건 조회 (Admin)")
    @GetMapping("/{requestId}")
    @RequirePermission(page = "notifications.admin", action = "VIEW")
    public ApiResponse<NotificationAdminResponse> findOne(@PathVariable UUID requestId) {
        return ApiResponse.ok(NotificationAdminResponse.from(notificationService.findById(requestId)));
    }

    /** 실패 발송 재시도. */
    @Operation(summary = "발송 재시도 (Admin)")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "재시도 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "요청 미존재"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "재시도 불가능 상태")
    })
    @PostMapping("/{requestId}/retry")
    @RequirePermission(page = "notifications.admin", action = "EDIT")
    public ApiResponse<NotificationAdminResponse> retry(@PathVariable UUID requestId) {
        return ApiResponse.ok(NotificationAdminResponse.from(notificationService.retry(requestId)));
    }
}
