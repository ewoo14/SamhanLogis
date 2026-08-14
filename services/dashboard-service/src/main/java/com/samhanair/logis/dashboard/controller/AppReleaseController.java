package com.samhanair.logis.dashboard.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.dashboard.domain.AppClientType;
import com.samhanair.logis.dashboard.domain.AppRelease;
import com.samhanair.logis.dashboard.dto.AppReleaseRequest;
import com.samhanair.logis.dashboard.dto.AppReleaseResponse;
import com.samhanair.logis.dashboard.dto.AppVersionResponse;
import com.samhanair.logis.dashboard.service.AppReleaseService;
import com.samhanair.logis.shared.audit.contract.AuditEventV2;
import com.samhanair.logis.shared.audit.publisher.AuditPublisher;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 앱 버전 공개 조회 및 릴리스 admin CRUD endpoint. */
@RestController
public class AppReleaseController {

    static final String PAGE_CODE = "admin.app-release";

    private final AppReleaseService service;
    private final AuditPublisher auditPublisher;

    @Autowired
    public AppReleaseController(AppReleaseService service, AuditPublisher auditPublisher) {
        this.service = service;
        this.auditPublisher = auditPublisher;
    }

    /** Legacy constructor retained for isolated controller tests and non-Spring callers. */
    public AppReleaseController(AppReleaseService service) {
        this(service, null);
    }

    /** 부팅 전 클라이언트가 호출하는 공개 버전 정책 조회. */
    @Operation(summary = "앱 버전 정책 조회 (Public)")
    @GetMapping("/app/version")
    public ApiResponse<AppVersionResponse> version(
            @RequestParam AppClientType clientType,
            @RequestParam String currentVersion) {
        return ApiResponse.ok(service.checkVersion(clientType, currentVersion));
    }

    /** 앱 릴리스 목록 조회. */
    @Operation(summary = "앱 릴리스 목록 조회 (Admin)")
    @GetMapping("/app/releases")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<AppReleaseResponse>> list(
            @RequestParam(required = false) AppClientType clientType) {
        return ApiResponse.ok(service.list(clientType).stream()
                .map(AppReleaseResponse::from)
                .toList());
    }

    /** 앱 릴리스 등록. */
    @Operation(summary = "앱 릴리스 등록 (Admin)")
    @PostMapping("/app/releases")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.CREATE)
    public ApiResponse<AppReleaseResponse> create(@Valid @RequestBody AppReleaseRequest request) {
        return ApiResponse.ok(AppReleaseResponse.from(service.create(request)));
    }

    /** 앱 릴리스 수정. */
    @Operation(summary = "앱 릴리스 수정 (Admin)")
    @PutMapping("/app/releases/{id}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<AppReleaseResponse> update(
            @PathVariable UUID id,
            @Valid @RequestBody AppReleaseRequest request) {
        return ApiResponse.ok(AppReleaseResponse.from(service.update(id, request)));
    }

    /** 앱 릴리스 배포. */
    @Operation(summary = "앱 릴리스 배포 (Admin)")
    @PostMapping("/app/releases/{id}/publish")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<AppReleaseResponse> publish(
            @PathVariable UUID id,
            @RequestHeader(value = "X-User-Id", required = false) String actor) {
        AppRelease release = service.publish(id);
        publishAudit(id, actor, "publish");
        return ApiResponse.ok(AppReleaseResponse.from(release));
    }

    /** 앱 릴리스 배포 취소. */
    @Operation(summary = "앱 릴리스 배포 취소 (Admin)")
    @PostMapping("/app/releases/{id}/unpublish")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<AppReleaseResponse> unpublish(
            @PathVariable UUID id,
            @RequestHeader(value = "X-User-Id", required = false) String actor) {
        AppRelease release = service.unpublish(id);
        publishAudit(id, actor, "unpublish");
        return ApiResponse.ok(AppReleaseResponse.from(release));
    }

    private void publishAudit(UUID id, String actor, String operation) {
        if (auditPublisher == null) return;
        try {
            auditPublisher.publishAfterCommit(AuditEventV2.mutation(
                    "dashboard-service", "POST", "/app/releases/{id}/" + operation,
                    actor, "APP_RELEASE", id.toString(), id.toString(),
                    "App release " + operation,
                    java.util.Map.of("operation", operation)));
        } catch (RuntimeException ex) {
            // Central audit is supplementary; a broker failure must not alter the release response.
        }
    }

    /** 앱 릴리스 soft-delete. */
    @Operation(summary = "앱 릴리스 삭제 (Admin)")
    @DeleteMapping("/app/releases/{id}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.DELETE)
    public ApiResponse<Void> delete(
            @PathVariable UUID id,
            @RequestHeader(value = "X-User-Id", required = false) String actor) {
        service.delete(id, actor);
        return ApiResponse.ok(null);
    }
}
