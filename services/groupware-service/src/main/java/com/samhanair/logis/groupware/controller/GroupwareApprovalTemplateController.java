package com.samhanair.logis.groupware.controller;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.groupware.dto.ApprovalTemplateRequest;
import com.samhanair.logis.groupware.dto.ApprovalTemplateResponse;
import com.samhanair.logis.groupware.service.ApprovalTemplateService;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 그룹웨어 결재유형 템플릿 관리자 endpoint.
 *
 * <p>page-code 는 {@code groupware.approval-templates}. 조회는 VIEW, 생성/수정/삭제는 UPDATE 로
 * 통제한다.
 */
@RestController
@RequiredArgsConstructor
public class GroupwareApprovalTemplateController {

    private static final String PAGE_CODE = "groupware.approval-templates";

    private final ApprovalTemplateService approvalTemplateService;

    /** 결재유형 템플릿 목록 조회. */
    @Operation(summary = "결재유형 템플릿 목록 조회")
    @GetMapping("/admin/groupware/approval-templates")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<List<ApprovalTemplateResponse>> list() {
        return ApiResponse.ok(approvalTemplateService.findAll());
    }

    /** 결재유형 템플릿 단건 조회. */
    @Operation(summary = "결재유형 템플릿 단건 조회")
    @GetMapping("/admin/groupware/approval-templates/{templateId}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<ApprovalTemplateResponse> get(@PathVariable UUID templateId) {
        return ApiResponse.ok(approvalTemplateService.findResponse(templateId));
    }

    /** 결재유형 템플릿 생성. */
    @Operation(summary = "결재유형 템플릿 생성")
    @PostMapping("/admin/groupware/approval-templates")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ResponseEntity<ApiResponse<ApprovalTemplateResponse>> create(
            @Valid @RequestBody ApprovalTemplateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(approvalTemplateService.create(request)));
    }

    /** 결재유형 템플릿 전체 교체. */
    @Operation(summary = "결재유형 템플릿 수정")
    @PutMapping("/admin/groupware/approval-templates/{templateId}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<ApprovalTemplateResponse> update(@PathVariable UUID templateId,
                                                        @Valid @RequestBody ApprovalTemplateRequest request) {
        return ApiResponse.ok(approvalTemplateService.update(templateId, request));
    }

    /** 결재유형 템플릿 soft-delete. */
    @Operation(summary = "결재유형 템플릿 삭제")
    @DeleteMapping("/admin/groupware/approval-templates/{templateId}")
    @RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<Void> delete(@PathVariable UUID templateId, Principal principal) {
        approvalTemplateService.delete(templateId, principal == null ? "system" : principal.getName());
        return ApiResponse.ok(null);
    }

    /**
     * 사용자 작성 화면용 활성 템플릿 목록 조회.
     *
     * <p>결재 작성자(권한 {@code groupware.approvals})가 유형을 고르기 위한 목록이므로
     * 게이트웨이 노출 경로(/admin) + 결재 VIEW 권한으로 둔다. 템플릿 관리 권한
     * (groupware.approval-templates)과 분리한다. ({@code /internal/**} 은 게이트웨이 비노출 — 404)
     */
    @Operation(summary = "활성 결재유형 템플릿 목록 조회")
    @GetMapping("/admin/groupware/approval-templates/active")
    @RequirePermission(page = "groupware.approvals", action = PermissionAction.VIEW)
    public ApiResponse<List<ApprovalTemplateResponse>> active() {
        return ApiResponse.ok(approvalTemplateService.findActive());
    }
}
