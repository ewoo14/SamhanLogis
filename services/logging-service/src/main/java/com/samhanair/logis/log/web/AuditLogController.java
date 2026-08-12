package com.samhanair.logis.log.web;

import java.time.Instant;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.log.domain.AuditLog;
import com.samhanair.logis.log.repository.AuditLogRepository;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;

import lombok.RequiredArgsConstructor;

/**
 * Audit log search REST API.
 *
 * <p>기존 {@code /logs/search}, {@code /logs/by-*} 는 gateway 의 MASTER/MANAGER 그룹 라우트를
 * 유지한다. DEV-3 {@code /logs/activity} 는 service-level {@code @RequirePermission} 으로
 * {@code dev.activity-log} VIEW 권한을 재확인한다.
 */
@RestController
@RequestMapping("/logs")
@RequiredArgsConstructor
public class AuditLogController {

    private static final String DEV_ACTIVITY_LOG_PAGE = "dev.activity-log";

    private final AuditLogRepository repository;
    private final ActivityLogService activityLogService;

    @GetMapping("/by-service/{serviceName}")
    public ApiResponse<Page<SafeAuditLogResponse>> byService(
            @PathVariable String serviceName,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(
                repository.findByServiceName(serviceName, paged(page, size)).map(SafeAuditLogResponse::from));
    }

    @GetMapping("/by-user/{userId}")
    public ApiResponse<Page<SafeAuditLogResponse>> byUser(
            @PathVariable String userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(
                repository.findByUserId(userId, paged(page, size)).map(SafeAuditLogResponse::from));
    }

    @GetMapping("/search")
    public ApiResponse<Page<SafeAuditLogResponse>> search(
            @RequestParam String action,
            @RequestParam Instant fromInstant,
            @RequestParam Instant toInstant,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(
                repository.findByActionAndOccurredAtBetween(
                        action, fromInstant, toInstant, paged(page, size)).map(SafeAuditLogResponse::from));
    }

    /** DEV-3 개발 메뉴 활동 로그 조회. 응답에는 원본 userId(UUID)를 포함하지 않는다. */
    @GetMapping("/activity")
    @RequirePermission(page = DEV_ACTIVITY_LOG_PAGE, action = PermissionAction.VIEW)
    public ApiResponse<ActivityLogPageResponse> activity(
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String resourceType,
            @RequestParam(required = false) String resourceId,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Instant fromInstant,
            @RequestParam(required = false) Instant toInstant,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(activityLogService.search(
                new ActivityLogSearchCondition(action, resourceType, resourceId, userId, q, fromInstant, toInstant),
                page,
                size));
    }

    /** 기존 프론트 감사 이벤트 수집 계약. DEV-3 MENU_ACCESS 도 이 endpoint 를 사용한다. */
    @org.springframework.web.bind.annotation.PostMapping("/front")
    public ApiResponse<Void> collectFrontEvent(
            @org.springframework.web.bind.annotation.RequestBody FrontAuditLogRequest request,
            HttpServletRequest servletRequest) {
        activityLogService.collectFrontEvent(
                request,
                servletRequest.getHeader("X-User-Id"),
                servletRequest.getRemoteAddr(),
                servletRequest.getHeader("User-Agent"));
        return ApiResponse.ok(null);
    }

    private static Pageable paged(int page, int size) {
        return PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "occurredAt"));
    }
}
