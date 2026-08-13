package com.samhanair.logis.notification.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.notification.service.NotificationCenterService;
import com.samhanair.logis.notification.web.dto.NotificationCenterPage;
import com.samhanair.logis.notification.web.dto.NotificationCenterResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.security.permission.PermissionAction;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 사용자 통합 알림 센터 — Issue 4 Slice 1.
 *
 * <p>X-User-Id + 선택적 X-User-Role 헤더 기반 자동 필터.
 */
@RestController
@RequestMapping("/notifications")
@RequiredArgsConstructor
@Tag(name = "Issue 4 — 통합 알림 센터")
public class NotificationCenterController {

    private final NotificationCenterService service;

    @GetMapping("/my")
    @RequirePermission(page = "notifications.center", action = PermissionAction.VIEW)
    @Operation(summary = "내 미확인 알림 목록")
    public ApiResponse<List<NotificationCenterResponse>> findMyUnread(
            @RequestHeader("X-User-Id") UUID userId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ROLE_HEADER, required = false) String role) {
        return ApiResponse.ok(service.findMyUnread(userId, role));
    }

    @GetMapping("/history")
    @RequirePermission(page = "notifications.center", action = PermissionAction.VIEW)
    @Operation(summary = "내 전체 알림 history (paged)")
    public ApiResponse<NotificationCenterPage> findMyHistory(
            @RequestHeader("X-User-Id") UUID userId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ROLE_HEADER, required = false) String role,
            @PageableDefault(size = 50) Pageable pageable) {
        return ApiResponse.ok(service.findMyHistory(userId, role, pageable));
    }

    @PostMapping("/{id}/acknowledge")
    @RequirePermission(page = "notifications.center", action = PermissionAction.VIEW)
    @Operation(summary = "알림 확인 처리 (read_at 설정)")
    public ApiResponse<Void> acknowledge(
            @PathVariable String id,
            @RequestHeader("X-User-Id") UUID userId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ROLE_HEADER, required = false) String role) {
        service.acknowledge(decodeNotificationId(id), userId, role);
        return ApiResponse.ok(null);
    }

    private UUID decodeNotificationId(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ignored) {
            try {
                byte[] bytes = java.util.Base64.getUrlDecoder().decode(value);
                if (bytes.length != 16) throw new IllegalArgumentException("invalid notification token");
                java.nio.ByteBuffer buffer = java.nio.ByteBuffer.wrap(bytes);
                return new UUID(buffer.getLong(), buffer.getLong());
            } catch (IllegalArgumentException ex) {
                throw new IllegalArgumentException("invalid notification token", ex);
            }
        }
    }
}
