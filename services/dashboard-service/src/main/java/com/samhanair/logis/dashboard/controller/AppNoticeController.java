package com.samhanair.logis.dashboard.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.dashboard.dto.AppNoticeAdminImageResponse;
import com.samhanair.logis.dashboard.dto.AppNoticeAdminResponse;
import com.samhanair.logis.dashboard.dto.AppNoticeImageOrderRequest;
import com.samhanair.logis.dashboard.dto.AppNoticeRequest;
import com.samhanair.logis.dashboard.dto.AppNoticeResponse;
import com.samhanair.logis.dashboard.service.AppNoticeService;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** 앱 팝업공지 조회 및 admin CRUD endpoint. */
@RestController
@RequiredArgsConstructor
public class AppNoticeController {

    static final String PAGE_CODE = "dev.popup-notice";

    private final AppNoticeService service;

    /** 인증 후 앱 셸이 조회하는 활성 공지 목록. */
    @Operation(summary = "활성 팝업공지 조회")
    @GetMapping("/app/notices/active")
    public ApiResponse<List<AppNoticeResponse>> active() {
        return ApiResponse.ok(service.activeNotices());
    }

    /** 팝업공지 관리자 목록. */
    @Operation(summary = "팝업공지 목록 조회 (Admin)")
    @GetMapping("/app/notices")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<AppNoticeAdminResponse>> list() {
        return ApiResponse.ok(service.list());
    }

    /** 팝업공지 등록. */
    @Operation(summary = "팝업공지 등록 (Admin)")
    @PostMapping("/app/notices")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.CREATE)
    public ApiResponse<AppNoticeAdminResponse> create(@Valid @RequestBody AppNoticeRequest request) {
        return ApiResponse.ok(service.create(request));
    }

    /** 팝업공지 수정. */
    @Operation(summary = "팝업공지 수정 (Admin)")
    @PutMapping("/app/notices/{id}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<AppNoticeAdminResponse> update(
            @PathVariable UUID id,
            @Valid @RequestBody AppNoticeRequest request) {
        return ApiResponse.ok(service.update(id, request));
    }

    /** 팝업공지 soft-delete. */
    @Operation(summary = "팝업공지 삭제 (Admin)")
    @DeleteMapping("/app/notices/{id}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.DELETE)
    public ApiResponse<Void> delete(
            @PathVariable UUID id,
            @RequestHeader("X-User-Id") String actor) {
        service.delete(id, actor);
        return ApiResponse.ok(null);
    }

    /** 팝업공지 이미지 업로드. */
    @Operation(summary = "팝업공지 이미지 업로드 (Admin)")
    @PostMapping("/app/notices/{id}/images")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<AppNoticeAdminImageResponse> uploadImage(
            @PathVariable UUID id,
            @RequestPart("file") MultipartFile file,
            @RequestParam(required = false) Integer displayOrder,
            @RequestParam(required = false) String caption) {
        return ApiResponse.ok(service.uploadImage(id, file, displayOrder, caption));
    }

    /** 팝업공지 이미지 순서 변경. */
    @Operation(summary = "팝업공지 이미지 순서 변경 (Admin)")
    @PutMapping("/app/notices/{id}/images/order")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<List<AppNoticeAdminImageResponse>> reorderImages(
            @PathVariable UUID id,
            @Valid @RequestBody List<AppNoticeImageOrderRequest> orders) {
        return ApiResponse.ok(service.reorderImages(id, orders));
    }

    /** 팝업공지 이미지 삭제. */
    @Operation(summary = "팝업공지 이미지 삭제 (Admin)")
    @DeleteMapping("/app/notices/{noticeId}/images/{imageId}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<Void> deleteImage(
            @PathVariable UUID noticeId,
            @PathVariable UUID imageId,
            @RequestHeader("X-User-Id") String actor) {
        service.deleteImage(noticeId, imageId, actor);
        return ApiResponse.ok(null);
    }
}
